//! Tauri commands — thin wrappers only: validate → call service → return
//! data or a typed error payload (RULES R1.2). Long-running operations run
//! on blocking tasks so commands never block the UI thread (RULES R3.5).

use tauri::{AppHandle, Manager, State};

use crate::error::{AppError, AppErrorPayload};
use crate::library::query::{self, Query};
use crate::library::service;
use crate::library::{
    CategoryDto, DocumentDto, ImportResult, RescanResult, SearchPage, SettingsDto,
};
use crate::pdf;
use crate::{Covers, Db, Reader, TauriSink};

/// Run a service call on a blocking thread with the app's shared state.
async fn background<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&Db, &Covers, &TauriSink) -> Result<T, AppErrorPayload> + Send + 'static,
) -> Result<T, AppErrorPayload> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Db>();
        let covers = app.state::<Covers>();
        let sink = TauriSink::new(app.clone());
        work(db.inner(), covers.inner(), &sink)
    })
    .await
    .map_err(|join_error| {
        AppError::Internal(format!("background job failed: {join_error}")).payload()
    })
    // The service call's own payload passes through unchanged.
    .and_then(std::convert::identity)
}

fn build_query(
    q: String,
    category_ids: Vec<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
    sort_secondary: String,
) -> Query {
    let (sort_key, sort_dir) = query::parse_sort(&sort, &dir);
    Query {
        q,
        category_ids,
        favorites_only,
        missing_only,
        sort: sort_key,
        sort_dir,
        sort_secondary: query::parse_sort_secondary(&sort_secondary),
    }
}

// ------------------------------------------------------------------ import

#[tauri::command]
pub async fn library_import_paths(
    app: AppHandle,
    paths: Vec<String>,
    category_ids: Vec<i64>,
) -> Result<ImportResult, AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::import_paths(conn, sink, &covers.0, &paths, &category_ids))
    })
    .await
}

#[tauri::command]
pub async fn library_import_folder(
    app: AppHandle,
    dir: String,
    category_ids: Vec<i64>,
) -> Result<ImportResult, AppErrorPayload> {
    background(app, move |db, covers, sink| {
        db.with(|conn| service::import_folder(conn, sink, &covers.0, &dir, &category_ids))
    })
    .await
}

// ------------------------------------------------------------- search/list

// Flat argument lists here are the wire contract mirrored in `ui/src/api.ts`
// (spec §5.3.3); grouping them would change the command payload for no gain.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn library_search(
    app: AppHandle,
    db: State<'_, Db>,
    query: String,
    category_ids: Vec<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
    sort_secondary: String,
    offset: i64,
    limit: i64,
) -> Result<SearchPage, AppErrorPayload> {
    let limit = limit.clamp(1, 500);
    let offset = offset.max(0);
    let query = build_query(
        query,
        category_ids,
        favorites_only,
        missing_only,
        sort,
        dir,
        sort_secondary,
    );
    let covers_dir = app.state::<Covers>().0.dir.clone();
    db.with(move |conn| service::search_document(conn, &covers_dir, &query, offset, limit))
}

// Same wire-contract rationale as `library_search` above.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn library_ids(
    db: State<'_, Db>,
    query: String,
    category_ids: Vec<i64>,
    favorites_only: bool,
    missing_only: bool,
    sort: String,
    dir: String,
    sort_secondary: String,
) -> Result<Vec<i64>, AppErrorPayload> {
    let query = build_query(
        query,
        category_ids,
        favorites_only,
        missing_only,
        sort,
        dir,
        sort_secondary,
    );
    db.with(move |conn| query::ids(conn, &query))
}

// --------------------------------------------------------------- documents

#[tauri::command]
pub fn library_get_document(
    db: State<'_, Db>,
    app: AppHandle,
    id: i64,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    db.with(move |conn| service::get_document(conn, &covers_dir, id))
}

// Same wire-contract rationale as `library_search` above.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn library_update_document(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    title: String,
    author: String,
    notes: String,
    favorite: bool,
    category_ids: Vec<i64>,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    let sink = TauriSink::new(app);
    db.with(move |conn| {
        service::update_document(
            conn,
            &sink,
            &covers_dir,
            id,
            &service::DocumentEdit {
                title: &title,
                author: &author,
                notes: &notes,
                favorite,
                category_ids: &category_ids,
            },
        )
    })
}

#[tauri::command]
pub fn library_set_document_categories(
    app: AppHandle,
    db: State<'_, Db>,
    document_id: i64,
    category_ids: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| {
        service::set_document_categories(
            conn,
            &TauriSink::new(app.clone()),
            document_id,
            &category_ids,
        )
    })
}

#[tauri::command]
pub fn library_set_favorite(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    value: bool,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers_dir = app.state::<Covers>().0.dir.clone();
    let sink = TauriSink::new(app);
    db.with(move |conn| service::set_favorite(conn, &sink, &covers_dir, id, value))
}

#[tauri::command]
pub fn library_bulk_categories(
    app: AppHandle,
    db: State<'_, Db>,
    document_ids: Vec<i64>,
    add: Vec<i64>,
    remove: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| {
        service::bulk_categories(
            conn,
            &TauriSink::new(app.clone()),
            &document_ids,
            &add,
            &remove,
        )
    })
}

/// AC-67: deleting a document closes its reader window with the row. Window
/// handling is boundary plumbing (R1.2): the close runs on the main thread,
/// and the `Destroyed` handler (§3.2) removes the cache directory exactly as
/// any other close does. A close failure never fails the delete — a deleted
/// document's window has nothing left to read.
fn close_reader_windows(app: &AppHandle, ids: &[i64]) {
    let app = app.clone();
    let ids = ids.to_vec();
    let _ = app.clone().run_on_main_thread(move || {
        for id in &ids {
            if let Some(window) = app.get_webview_window(&format!("reader-{id}")) {
                let _ = window.close();
            }
        }
    });
}

#[tauri::command]
pub async fn library_delete_document(app: AppHandle, ids: Vec<i64>) -> Result<(), AppErrorPayload> {
    let reader_dir = app.state::<Reader>().dir.clone();
    let (window_app, window_ids) = (app.clone(), ids.clone());
    let result = background(app, move |db, covers, sink| {
        db.with(|conn| service::delete_documents(conn, sink, &covers.0, &ids, false, &reader_dir))
    })
    .await;
    if result.is_ok() {
        close_reader_windows(&window_app, &window_ids);
    }
    result
}

#[tauri::command]
pub async fn library_delete_document_and_file(
    app: AppHandle,
    ids: Vec<i64>,
) -> Result<(), AppErrorPayload> {
    let reader_dir = app.state::<Reader>().dir.clone();
    let (window_app, window_ids) = (app.clone(), ids.clone());
    let result = background(app, move |db, covers, sink| {
        db.with(|conn| service::delete_documents(conn, sink, &covers.0, &ids, true, &reader_dir))
    })
    .await;
    if result.is_ok() {
        close_reader_windows(&window_app, &window_ids);
    }
    result
}

// ------------------------------------------------------------------ relink

#[tauri::command]
pub fn library_relink_document(
    app: AppHandle,
    db: State<'_, Db>,
    id: i64,
    new_path: String,
) -> Result<DocumentDto, AppErrorPayload> {
    let covers = app.state::<Covers>();
    db.with(|conn| {
        service::relink_document(conn, &TauriSink::new(app.clone()), &covers.0, id, &new_path)
    })
}

// ------------------------------------------------------------------ rescan

#[tauri::command]
pub async fn library_rescan(app: AppHandle) -> Result<RescanResult, AppErrorPayload> {
    background(app, |db, covers, sink| {
        db.with(|conn| service::rescan(conn, sink, &covers.0, false))
    })
    .await
}

// -------------------------------------------------------------- categories

#[tauri::command]
pub fn categories_list(db: State<'_, Db>) -> Result<Vec<CategoryDto>, AppErrorPayload> {
    db.with(|conn| service::categories_list(conn))
}

#[tauri::command]
pub fn categories_create(db: State<'_, Db>, name: String) -> Result<CategoryDto, AppErrorPayload> {
    db.with(|conn| service::categories_create(conn, &name))
}

#[tauri::command]
pub fn categories_rename(
    db: State<'_, Db>,
    id: i64,
    name: String,
) -> Result<CategoryDto, AppErrorPayload> {
    db.with(|conn| service::categories_rename(conn, id, &name))
}

#[tauri::command]
pub fn categories_delete(db: State<'_, Db>, id: i64) -> Result<(), AppErrorPayload> {
    db.with(|conn| service::categories_delete(conn, id))
}

// -------------------------------------------------------------------- app

#[tauri::command]
pub fn app_get_settings(db: State<'_, Db>) -> Result<SettingsDto, AppErrorPayload> {
    db.with(|conn| service::get_settings(conn))
}

#[tauri::command]
pub fn app_set_setting(
    db: State<'_, Db>,
    key: String,
    value: String,
) -> Result<(), AppErrorPayload> {
    db.with(|conn| service::set_setting(conn, &key, &value))
}

#[tauri::command]
pub fn app_open_document(app: AppHandle, id: i64) -> Result<(), AppErrorPayload> {
    let path = {
        let db = app.state::<Db>();
        db.with(|conn| service::open_target(conn, id))?.path
    };
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|error| {
        AppError::Io {
            path,
            message: error.to_string(),
        }
        .payload()
    })
}

// -------------------------------------------------------------------- reader

/// Payload of `app_open_reader_window` (§3.2): whether the window was created
/// or focused — bookkeeping for the caller; the page data flows through
/// `app_pdf_document` / `app_pdf_page` regardless of which happened.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OpenedReaderDto {
    pub opened: &'static str,
}

/// UI-31/FR-17 activation entry (§3.2): resolve the target through
/// `service::open_target` FIRST, so a missing file yields the typed
/// `MissingFile` error before any window exists (FR-08's error path
/// unchanged); then create the `reader-<id>` window — or focus the existing
/// one, since re-activation is focus, not a second window (§3.3). Creation
/// is Rust-side: the library frontend gains no window capability, so R1.5
/// keeps its single meaning. **Async command on purpose** (R1.2): Tauri runs
/// async commands off the main thread, and `WebviewWindowBuilder::build`
/// deadlocks on Windows when called on the main thread — the documented
/// WebView2 issue; a sync command here would freeze the app (observed in
/// the harness probe). The only DB read is the target resolve; the rest is
/// window plumbing.
#[tauri::command]
pub async fn app_open_reader_window(
    app: AppHandle,
    id: i64,
) -> Result<OpenedReaderDto, AppErrorPayload> {
    let target = {
        let db = app.state::<Db>();
        db.with(|conn| service::open_target(conn, id))?
    };
    let label = format!("reader-{id}");
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().map_err(|error| {
            AppError::Internal(format!("focus reader window: {error}")).payload()
        })?;
        return Ok(OpenedReaderDto { opened: "focused" });
    }
    let reader_dir = app.state::<Reader>().dir.clone();
    let built = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html?reader={id}").into()),
    )
    .title(&target.filename) // DR-140: the window title is the document filename
    .decorations(false) // UI-30/OQ-40-B: frameless like the shipped main window
    .resizable(true)
    .inner_size(1000.0, 700.0)
    .min_inner_size(640.0, 480.0)
    // §3.3: OS cascade placement — `center()` is deliberately not called.
    .build();
    let window = match built {
        Ok(window) => window,
        Err(error) => {
            // Activation race: a concurrent call created this label between
            // the check above and the build. Focus it — re-activation is
            // focus, never an error to the user (§3.3).
            match app.get_webview_window(&label) {
                Some(existing) => {
                    let _ = existing.set_focus();
                    return Ok(OpenedReaderDto { opened: "focused" });
                }
                None => {
                    return Err(
                        AppError::Internal(format!("create reader window: {error}")).payload()
                    );
                }
            }
        }
    };
    // Window-close cleanup (§3.2/§3.3): the document's session cache goes
    // with its window — the close control, `Esc` and the OS close all end in
    // `Destroyed`. A cleanup failure never fails the close (R5.3 discipline):
    // the next launch sweep removes what a failed one leaves behind.
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            pdf::remove_document_cache(&reader_dir, id);
        }
    });
    Ok(OpenedReaderDto { opened: "created" })
}

/// The document geometry the reader view needs for exact page sizing (§3.2):
/// resolved through `service::open_target` first — a file deleted after the
/// window opened yields the typed error, which the reader window shows as
/// its error state (UI-31).
#[tauri::command]
pub async fn app_pdf_document(app: AppHandle, id: i64) -> Result<pdf::PdfDocDto, AppErrorPayload> {
    let render = app.state::<Reader>().render.clone();
    background(app, move |db, _covers, _sink| {
        let target = db.with(|conn| service::open_target(conn, id))?;
        pdf::document_dto(&render, &target.path).map_err(|error| error.payload())
    })
    .await
}

/// Serve one reader page (§3.2): `page` is 1-based; `target_width` is
/// validated at the boundary (R1.2). The render goes through the single
/// pdfium owner; the PNG encode and cache write happen on the blocking
/// thread (R3.5); the payload is the cache path (R5.4).
#[tauri::command]
pub async fn app_pdf_page(
    app: AppHandle,
    id: i64,
    page: u32,
    target_width: u32,
) -> Result<String, AppErrorPayload> {
    if page == 0 {
        return Err(AppError::Validation("page must be 1 or greater".into()).payload());
    }
    if !(100..=4000).contains(&target_width) {
        return Err(
            AppError::Validation("target width must be between 100 and 4000 px".into()).payload(),
        );
    }
    let (render, reader_dir) = {
        let reader = app.state::<Reader>();
        (reader.render.clone(), reader.dir.clone())
    };
    background(app, move |db, _covers, _sink| {
        let target = db.with(|conn| service::open_target(conn, id))?;
        pdf::serve_page(&render, &reader_dir, id, &target.path, page, target_width)
            .map_err(|error| error.payload())
    })
    .await
}

/// Application identity for the About dialog (UI-12). No service module and no
/// business logic: these are Tauri's own package metadata — `tauri.conf.json`
/// at runtime — which is the release's single version source (DR-79, R1.6).
#[derive(Debug, Clone, serde::Serialize)]
pub struct AboutDto {
    pub name: String,
    pub version: String,
}

#[tauri::command]
pub fn app_about(app: AppHandle) -> Result<AboutDto, AppErrorPayload> {
    let info = app.package_info();
    Ok(AboutDto {
        name: info.name.clone(),
        version: info.version.to_string(),
    })
}

/// Read-only location of the app's own data directory (UI-21, DR-111,
/// DR-162): reads the `DataDir` state `lib.rs` resolved at setup — the exact
/// directory the app places `library.db` and `covers/` in, override included.
/// No state write, no business logic (R1.2, R1.4).
#[tauri::command]
pub fn app_data_dir(data: State<'_, crate::data_dir::DataDir>) -> Result<String, AppErrorPayload> {
    Ok(data.0.to_string_lossy().into_owned())
}
