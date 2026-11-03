//! App wiring: shared state, startup sequence (§5.1), event sink, and the
//! command router. All product logic lives in the service modules (RULES
//! R1.1); this file only composes them.

pub mod commands;
pub mod covers;
pub mod db;
pub mod error;
pub mod library;
pub mod pdfmeta;
#[cfg(test)]
pub mod testutil;

use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppErrorPayload;
use crate::library::{CountsDto, EventSink, JobProgress};

/// One-shot gate proving the UI bridge is alive: the UI registers its event
/// listeners before issuing any command (App.svelte startup order), so the
/// first command call arrives strictly after `listen()` succeeded. The startup
/// task waits on this gate before publishing counts, which turns the startup
/// `status_updated` from a race the UI usually loses into a delivery it
/// always receives (FR-15: the status bar shows real counts at startup).
#[derive(Default)]
pub struct UiGate {
    reached: Mutex<bool>,
    ready: Condvar,
}

impl UiGate {
    fn mark(&self) {
        let mut reached = self
            .reached
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *reached = true;
        self.ready.notify_all();
    }

    /// Blocks until marked; `false` when `timeout` elapsed first.
    fn wait(&self, timeout: Duration) -> bool {
        let mut reached = self
            .reached
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let start = Instant::now();
        while !*reached {
            let remaining = match timeout.checked_sub(start.elapsed()) {
                Some(remaining) => remaining,
                None => return false,
            };
            let (guard, timed_out) = self
                .ready
                .wait_timeout(reached, remaining)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            reached = guard;
            if timed_out.timed_out() && !*reached {
                return false;
            }
        }
        true
    }
}

/// Shared library database. `with` guards the single connection and converts
/// service errors to the command-boundary payload (RULES R1.2). Every call
/// marks the UI gate; the startup task uses `with_startup` and stays out of
/// that signal.
pub struct Db {
    conn: Mutex<Connection>,
    ui_gate: UiGate,
}

impl Db {
    pub fn with<T>(
        &self,
        work: impl FnOnce(&mut Connection) -> Result<T, crate::error::AppError>,
    ) -> Result<T, AppErrorPayload> {
        self.ui_gate.mark();
        self.run(work)
    }

    pub fn with_startup<T>(
        &self,
        work: impl FnOnce(&mut Connection) -> Result<T, crate::error::AppError>,
    ) -> Result<T, AppErrorPayload> {
        self.run(work)
    }

    fn run<T>(
        &self,
        work: impl FnOnce(&mut Connection) -> Result<T, crate::error::AppError>,
    ) -> Result<T, AppErrorPayload> {
        // A poisoned lock only happens if a service panicked; recovering the
        // connection beats panicking a second time at the boundary.
        let mut guard = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        work(&mut guard).map_err(|error| error.payload())
    }
}

/// Shared cover-generation queue + its cache directory.
pub struct Covers(pub covers::CoverQueue);

/// `EventSink` over the Tauri event system (`status_updated`,
/// `library_job_progress`, spec §5.3.3).
pub struct TauriSink {
    app: AppHandle,
}

impl TauriSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriSink {
    fn status(&self, counts: &CountsDto) {
        let _ = self.app.emit("status_updated", counts);
    }

    fn progress(&self, job: &JobProgress) {
        let _ = self.app.emit("library_job_progress", job);
    }
}

/// §5.1 startup order: open + migrate DB, start the cover worker, then a
/// background task that publishes counts, runs the silent startup rescan
/// (FR-12), re-enqueues missing covers, and sweeps orphaned cache files —
/// none of it blocks first paint (NFR-07). The task first waits on the UI
/// gate so the startup `status_updated` reaches the UI instead of racing its
/// listener registration; a timed-out gate only delays the background work.
fn startup(app: &AppHandle) {
    let db = app.state::<Db>();
    let covers = app.state::<Covers>();
    let sink = TauriSink::new(app.clone());
    db.ui_gate.wait(Duration::from_secs(10));
    let _ = db.with_startup(|conn| {
        let counts = library::service::get_counts(conn)?;
        sink.status(&counts);
        library::service::rescan(conn, &sink, &covers.0, true)?;
        covers::enqueue_missing_covers(conn, &covers.0)?;
        covers::sweep_orphans(conn, &covers.0.dir)
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let covers_dir = data_dir.join("covers");
            std::fs::create_dir_all(&covers_dir)?;

            app.manage(Db {
                conn: Mutex::new(db::open(&data_dir)?),
                ui_gate: UiGate::default(),
            });
            let sink: Arc<dyn EventSink> = Arc::new(TauriSink::new(app.handle().clone()));
            app.manage(Covers(covers::start_worker(covers_dir, sink)));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || startup(&handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library_import_paths,
            commands::library_import_folder,
            commands::library_search,
            commands::library_ids,
            commands::library_get_document,
            commands::library_update_document,
            commands::library_set_document_categories,
            commands::library_set_favorite,
            commands::library_bulk_categories,
            commands::library_delete_document,
            commands::library_delete_document_and_file,
            commands::library_relink_document,
            commands::library_rescan,
            commands::categories_list,
            commands::categories_create,
            commands::categories_rename,
            commands::categories_delete,
            commands::app_get_settings,
            commands::app_set_setting,
            commands::app_open_document
        ])
        .run(tauri::generate_context!())
        .expect("PDF Keeper failed to start");
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::{Db, UiGate};

    /// FR-15 startup delivery: the startup task publishes counts only after
    /// the first command proves the UI bridge is up.
    #[test]
    fn ui_gate_releases_a_waiter_when_marked() {
        let gate = Arc::new(UiGate::default());
        let marker = {
            let gate = Arc::clone(&gate);
            std::thread::spawn(move || gate.mark())
        };
        assert!(gate.wait(Duration::from_secs(5)), "mark must release wait");
        marker.join().expect("marker thread");
    }

    #[test]
    fn ui_gate_wait_returns_false_on_timeout() {
        let gate = UiGate::default();
        assert!(!gate.wait(Duration::from_millis(120)));
    }

    #[test]
    fn only_command_calls_mark_the_ui_gate() {
        let db = Db {
            conn: Mutex::new(rusqlite::Connection::open_in_memory().expect("in-memory db")),
            ui_gate: UiGate::default(),
        };
        let _ = db.with_startup(|conn| {
            conn.execute("SELECT 1", [])?;
            Ok(())
        });
        assert!(
            !*db.ui_gate.reached.lock().expect("fresh gate"),
            "the startup path must not fake UI presence"
        );
        let _ = db.with(|conn| {
            conn.execute("SELECT 1", [])?;
            Ok(())
        });
        assert!(
            *db.ui_gate.reached.lock().expect("marked gate"),
            "a command call proves the UI bridge"
        );
    }

    /// The router and `ui/src/api.ts` are one contract (spec §5.3.3): the
    /// two lists must stay exactly equal, so neither side can drift silently.
    #[test]
    fn command_router_matches_the_ui_command_client() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let router_source = std::fs::read_to_string(manifest.join("src/lib.rs")).unwrap();
        let api_source = std::fs::read_to_string(manifest.join("../ui/src/api.ts")).unwrap();

        let router = between(&router_source, "generate_handler![", "]")
            .split(',')
            .filter_map(|entry| {
                entry
                    .trim()
                    .trim_end_matches(',')
                    .trim()
                    .strip_prefix("commands::")
                    .map(|name| name.trim().to_string())
            })
            .collect::<BTreeSet<_>>();
        let client = between(&api_source, "export const COMMANDS = [", "] as const")
            .split('"')
            .skip(1)
            .step_by(2)
            .map(String::from)
            .collect::<BTreeSet<_>>();

        assert!(!router.is_empty(), "router extraction must find commands");
        assert_eq!(router, client, "Rust router and api.ts COMMANDS drifted");
    }

    fn between(haystack: &str, start: &str, end: &str) -> String {
        let from = haystack.find(start).expect("marker present") + start.len();
        let to = haystack[from..].find(end).expect("closing marker present") + from;
        haystack[from..to].to_string()
    }
}
