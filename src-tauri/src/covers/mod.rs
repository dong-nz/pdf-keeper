//! Cover thumbnails (FR-16 as modified by DR-113): a background generation
//! pipeline — a render stage that is a client of the single pdfium owner
//! (`crate::pdf`, SPEC-v0.0.6 §3.1) feeding a PNG-encode pool (D17,
//! DR-134) — and a PNG cache keyed by path+size+mtime+render width
//! (RULES R5). The pipeline keeps its queue, its bounded handoff and its
//! progress tracking (AC-63); only the rendering itself moved to the
//! service, unchanged math. Any render failure simply leaves the document
//! without a cached cover — the UI shows the generic glyph (R5.3) and
//! nothing else fails.

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, mpsc};

use rusqlite::Connection;

use crate::error::AppError;
use crate::library::EventSink;
use crate::library::JobProgress;
use crate::pdf::RenderService;

/// The renderer's target width. Part of the cache identity (FR-16 as modified
/// by DR-113, R5.2): changing it re-keys every entry instead of serving a
/// smaller stored image forever. 640 px covers a 320 CSS px card at 2× device
/// scaling (D7).
pub const RENDER_TARGET_WIDTH: u32 = 640;
const RENDER_TARGET_HEIGHT: u32 = (RENDER_TARGET_WIDTH as u64 * 309 / 218) as u32; // 905

pub struct CoverJob {
    pub doc_id: i64,
    pub path: String,
    pub size: i64,
    pub mtime: i64,
    /// The row's stored password (FR-20, DR-266): the render passes it to
    /// the loader when present; without one a protected document keeps the
    /// glyph fallback (AC-106). The cache key is unchanged — the password
    /// enables the render, it is not part of the image's identity.
    pub password: Option<String>,
}

/// Cloneable handle to the cover pipeline (D17, DR-134).
#[derive(Clone)]
pub struct CoverQueue {
    sender: mpsc::Sender<CoverJob>,
    pending: Arc<AtomicI64>,
    pub dir: PathBuf,
}

impl CoverQueue {
    pub fn enqueue(&self, job: CoverJob) {
        self.pending.fetch_add(1, Ordering::Relaxed);
        // A closed channel means the app is shutting down; dropping the job
        // is correct — it will be re-enqueued from DB state at next startup.
        let _ = self.sender.send(job);
    }
}

/// A queue without a worker thread: service tests observe exactly which
/// jobs were enqueued, with no rendering race (test-only).
#[cfg(test)]
pub fn test_queue(dir: PathBuf) -> (CoverQueue, mpsc::Receiver<CoverJob>) {
    let (sender, receiver) = mpsc::channel::<CoverJob>();
    (
        CoverQueue {
            sender,
            pending: Arc::new(AtomicI64::new(0)),
            dir,
        },
        receiver,
    )
}

/// The encode-pool ceiling and the unconfigured ceiling (D17).
const MAX_COVER_WORKERS: usize = 8;
const DEFAULT_MAX_COVER_WORKERS: usize = 4;

/// Encode-pool size (D17): default `min(4, max(1, ⌊cores/2⌋))`; the
/// `PDFKEEPER_COVER_WORKERS` override is clamped to 1..8. Takes the override
/// as an argument so tests verify the clamp without touching process env.
fn pool_size(override_value: Option<&str>) -> usize {
    if let Some(value) = override_value
        && let Ok(requested) = value.parse::<usize>()
    {
        return requested.clamp(1, MAX_COVER_WORKERS);
    }
    let cores = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1);
    (cores / 2).clamp(1, DEFAULT_MAX_COVER_WORKERS)
}

/// Completion bookkeeping shared by the pipeline's workers (R5.1): the queue
/// counters and the throttled progress events. The gate makes the event
/// stream monotonic across workers — every published count is read and
/// stamped under one lock — and the final drain event is guaranteed.
struct ProgressTracker {
    pending: Arc<AtomicI64>,
    processed: Arc<AtomicI64>,
    gate: std::sync::Mutex<i64>,
    sink: Arc<dyn EventSink>,
}

impl ProgressTracker {
    fn complete(&self) {
        self.pending.fetch_sub(1, Ordering::Relaxed);
        self.processed.fetch_add(1, Ordering::Relaxed);
        let remaining = self.pending.load(Ordering::Relaxed);
        if let Ok(mut last_emitted) = self.gate.lock() {
            let done = self.processed.load(Ordering::Relaxed);
            // Throttle progress events; always report the final drain.
            if done - *last_emitted >= 25 || remaining == 0 {
                *last_emitted = done;
                self.sink.progress(&JobProgress {
                    kind: "cover".into(),
                    processed: done,
                    total: done + remaining,
                });
            }
        }
    }
}

/// A rendered cover awaiting its PNG encode: the handoff from the render
/// worker to the encode pool (DR-134 — the encode is where the time goes).
struct RenderedCover {
    image: image::DynamicImage,
    target: PathBuf,
}

/// Start the cover pipeline (RULES R3.5, R5.1; D17 as decided by DR-134,
/// render stage rewired per SPEC-v0.0.6 §3.1): the pipeline's render stage
/// is a client of the single pdfium owner (`crate::pdf::RenderService`),
/// feeding N PNG-encode workers. The encode pool is unchanged — it is pure
/// Rust and thread-safe. A missing pdfium binary resolves every render to
/// `None` and leaves the drain-only behavior (covers stay absent).
pub fn start_pool(
    dir: PathBuf,
    sink: Arc<dyn EventSink>,
    service: Arc<RenderService>,
) -> CoverQueue {
    let requested = std::env::var("PDFKEEPER_COVER_WORKERS").ok();
    start_pool_with_workers(dir, sink, pool_size(requested.as_deref()), service)
}

fn start_pool_with_workers(
    dir: PathBuf,
    sink: Arc<dyn EventSink>,
    encoders: usize,
    service: Arc<RenderService>,
) -> CoverQueue {
    let (sender, receiver) = mpsc::channel::<CoverJob>();
    let pending = Arc::new(AtomicI64::new(0));
    let tracker = Arc::new(ProgressTracker {
        pending: pending.clone(),
        processed: Arc::new(AtomicI64::new(0)),
        gate: std::sync::Mutex::new(0i64),
        sink,
    });

    // One bounded handoff per encode worker (capacity 2): in-flight images
    // are bounded, and a full pool backpressures the render worker — which
    // is never the bottleneck (measured 1.2 ms render vs 35 ms encode,
    // DR-134).
    let mut handoffs = Vec::with_capacity(encoders);
    for _ in 0..encoders {
        let (sender, receiver) = mpsc::sync_channel::<RenderedCover>(2);
        let tracker = tracker.clone();
        std::thread::spawn(move || {
            while let Ok(cover) = receiver.recv() {
                // A save failure leaves the glyph as before (R5.3).
                let _ = cover.image.save(&cover.target);
                tracker.complete();
            }
        });
        handoffs.push(sender);
    }

    let worker_dir = dir.clone();
    std::thread::spawn(move || {
        let mut next = 0usize;
        while let Ok(job) = receiver.recv() {
            let target = cache_path(&worker_dir, &job.path, job.size, job.mtime);
            // A cache hit completes the job without asking the service; a
            // miss is a cover request on the single pdfium owner (§3.1).
            let rendered = if target.exists() {
                None
            } else {
                service.render_cover(
                    &job.path,
                    RENDER_TARGET_WIDTH,
                    RENDER_TARGET_HEIGHT,
                    job.password.as_deref(),
                )
            };
            match rendered {
                Some(image) => {
                    // Round-robin keeps the pool balanced. A disconnected
                    // worker means shutdown: the job simply ends without a
                    // cover and is re-enqueued from DB state next startup.
                    let handoff = &handoffs[next % handoffs.len()];
                    next += 1;
                    if handoff.send(RenderedCover { image, target }).is_err() {
                        tracker.complete();
                    }
                }
                // Glyph fallback (R5.3) or cache hit: the job completes now.
                None => tracker.complete(),
            }
        }
        // Dropping the handoffs here lets the encode pool finish its
        // in-flight work and exit.
    });

    CoverQueue {
        sender,
        pending,
        dir,
    }
}

/// The cache key IS the staleness check (FR-16 as modified by DR-113):
/// path + size + mtime + the renderer's current target width. The width is
/// part of the identity so a changed render target can never leave a smaller
/// stored image authoritative.
pub fn cache_key(path: &str, size: i64, mtime: i64, width: u32) -> String {
    let mut hasher = std::hash::DefaultHasher::new();
    path.hash(&mut hasher);
    size.hash(&mut hasher);
    mtime.hash(&mut hasher);
    width.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn cache_path(dir: &Path, path: &str, size: i64, mtime: i64) -> PathBuf {
    dir.join(format!(
        "{}.png",
        cache_key(path, size, mtime, RENDER_TARGET_WIDTH)
    ))
}

/// Queue survives app restart: re-enqueue every document whose cached cover
/// is absent or stale (covers.md).
pub fn enqueue_missing_covers(conn: &Connection, queue: &CoverQueue) -> Result<(), AppError> {
    let mut stmt =
        conn.prepare("SELECT id, path, size, mtime, pdf_password FROM documents ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    for row in rows {
        let (doc_id, path, size, mtime, password) = row?;
        if !cache_path(&queue.dir, &path, size, mtime).exists() {
            queue.enqueue(CoverJob {
                doc_id,
                path,
                size,
                mtime,
                password: (!password.is_empty()).then_some(password),
            });
        }
    }
    Ok(())
}

/// Startup sweep of cached files with no matching row (covers.md).
pub fn sweep_orphans(conn: &Connection, dir: &Path) -> Result<(), AppError> {
    let mut expected: HashSet<String> = HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT path, size, mtime FROM documents")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (path, size, mtime) = row?;
            expected.insert(cache_key(&path, size, mtime, RENDER_TARGET_WIDTH));
        }
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("png")
            && let Some(stem) = path.file_stem().and_then(|stem| stem.to_str())
            && !expected.contains(stem)
        {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::library::EventSink;
    use crate::pdf::{RenderService, pdfium_binary_present};
    use crate::testutil::{RecordingSink, TempDir, fixture_doc};
    use std::sync::Arc;
    use std::sync::atomic::Ordering;

    fn epoch_secs(metadata: &std::fs::Metadata) -> i64 {
        metadata
            .modified()
            .map(|when| {
                when.duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64
            })
            .unwrap_or(0)
    }

    #[test]
    fn cache_key_changes_with_any_part_of_the_document_identity() {
        // FR-16 as modified by DR-113 (AC-36): the key IS path + size +
        // mtime + render width; unchanged documents keep their key.
        let base = cache_key("C:/a.pdf", 10, 20, RENDER_TARGET_WIDTH);
        assert_eq!(
            base,
            cache_key("C:/a.pdf", 10, 20, RENDER_TARGET_WIDTH),
            "same identity, same key"
        );
        assert_ne!(base, cache_key("C:/b.pdf", 10, 20, RENDER_TARGET_WIDTH));
        assert_ne!(
            base,
            cache_key("C:/a.pdf", 11, 20, RENDER_TARGET_WIDTH),
            "changed size re-keys"
        );
        assert_ne!(
            base,
            cache_key("C:/a.pdf", 10, 21, RENDER_TARGET_WIDTH),
            "changed mtime re-keys"
        );
        assert_ne!(
            cache_key("C:/a.pdf", 10, 20, 220),
            cache_key("C:/a.pdf", 10, 20, 640),
            "AC-36: a changed render width re-keys"
        );
    }

    #[test]
    fn enqueue_missing_covers_queues_only_documents_without_a_cache_file() {
        let conn = open_in_memory().unwrap();
        let temp = TempDir::new("covers-enqueue");
        conn.execute(
            "INSERT INTO documents (id, path, filename, title, size, mtime, added_at)
             VALUES (1, 'C:/one.pdf', 'one.pdf', 'one', 10, 20, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, path, filename, title, size, mtime, added_at)
             VALUES (2, 'C:/two.pdf', 'two.pdf', 'two', 30, 40, 0)",
            [],
        )
        .unwrap();
        std::fs::write(cache_path(temp.path(), "C:/one.pdf", 10, 20), "png").unwrap();

        let (queue, receiver) = test_queue(temp.path().to_path_buf());
        enqueue_missing_covers(&conn, &queue).unwrap();
        let jobs: Vec<CoverJob> = receiver.try_iter().collect();
        assert_eq!(
            jobs.iter().map(|job| job.doc_id).collect::<Vec<_>>(),
            vec![2]
        );
        assert_eq!(jobs[0].path, "C:/two.pdf");
    }

    #[test]
    fn sweep_orphans_removes_pngs_no_document_owns() {
        let conn = open_in_memory().unwrap();
        let temp = TempDir::new("covers-sweep");
        conn.execute(
            "INSERT INTO documents (path, filename, title, size, mtime, added_at)
             VALUES ('C:/kept.pdf', 'kept.pdf', 'kept', 10, 20, 0)",
            [],
        )
        .unwrap();
        std::fs::write(cache_path(temp.path(), "C:/kept.pdf", 10, 20), "png").unwrap();
        std::fs::write(temp.path().join("stale.png"), "png").unwrap();
        std::fs::write(temp.path().join("keep.txt"), "not a cover").unwrap();

        sweep_orphans(&conn, temp.path()).unwrap();

        assert!(cache_path(temp.path(), "C:/kept.pdf", 10, 20).exists());
        assert!(
            !temp.path().join("stale.png").exists(),
            "unowned PNG is swept"
        );
        assert!(
            temp.path().join("keep.txt").exists(),
            "only PNG files are considered"
        );
    }

    #[test]
    fn worker_renders_valid_pdfs_and_leaves_glyph_fallback_for_unrenderable() {
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping render proof"
            );
            return;
        }
        let temp = TempDir::new("covers-render");
        let valid = temp.copy_fixture("info-title.pdf");
        let broken = temp.copy_fixture("malformed.pdf");
        let sink: Arc<dyn EventSink> = Arc::new(RecordingSink::default());
        let queue =
            start_pool_with_workers(temp.path().to_path_buf(), sink, 1, RenderService::shared());

        let valid_meta = std::fs::metadata(&valid).unwrap();
        let broken_meta = std::fs::metadata(&broken).unwrap();
        let valid_key = (
            valid.to_string_lossy().into_owned(),
            valid_meta.len() as i64,
            epoch_secs(&valid_meta),
        );
        let broken_key = (
            broken.to_string_lossy().into_owned(),
            broken_meta.len() as i64,
            epoch_secs(&broken_meta),
        );
        queue.enqueue(CoverJob {
            doc_id: 1,
            path: valid_key.0.clone(),
            size: valid_key.1,
            mtime: valid_key.2,
            password: None,
        });
        queue.enqueue(CoverJob {
            doc_id: 2,
            path: broken_key.0.clone(),
            size: broken_key.1,
            mtime: broken_key.2,
            password: None,
        });

        // D22 (v0.0.8, M9): 90 s, not 30. The Rust and frontend layers must
        // not run concurrently in one verification pass (ui-verify barriers
        // them; the flake this raises came from manual concurrent runs). The
        // generous deadline makes the test immune to a loaded machine; a real
        // drain finishes in seconds.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
        while queue.pending.load(Ordering::Relaxed) > 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        assert_eq!(
            queue.pending.load(Ordering::Relaxed),
            0,
            "worker drains the queue"
        );

        let cover_file = cache_path(temp.path(), &valid_key.0, valid_key.1, valid_key.2);
        assert!(
            cover_file.exists(),
            "AC-06: a valid fixture produces a PNG cover"
        );
        // AC-36: the cached file the queue wrote decodes at ≥ 560 px wide
        // (the renderer targets 640; the floor allows pdfium's page-ratio
        // cap without re-introducing the 220 px generation).
        let (cover_width, _) = image::image_dimensions(&cover_file)
            .expect("AC-36: the cached cover is a decodable PNG");
        assert!(
            cover_width >= 560,
            "AC-36: cached covers are at least 560 px wide, got {cover_width}"
        );
        assert!(
            !cache_path(temp.path(), &broken_key.0, broken_key.1, broken_key.2).exists(),
            "R5.3: an unrenderable file produces no cover (the UI shows the glyph) and never fails the batch"
        );
    }

    /// Wait for a started pool to drain (the existing pool tests' deadline
    /// pattern, named once). D22 (v0.0.8, M9): callers pass 90 s, not 30 —
    /// the Rust and frontend layers must not run concurrently in one
    /// verification pass; the deadline absorbs a loaded machine, not slow
    /// product behavior.
    fn drain(queue: &CoverQueue, seconds: u64) {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(seconds);
        while queue.pending.load(Ordering::Relaxed) > 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        assert_eq!(queue.pending.load(Ordering::Relaxed), 0, "pool drains");
    }

    #[test]
    fn a_protected_document_gets_no_cover_until_its_password_is_stored() {
        // AC-106 (FR-20): the import-time cover of a protected document
        // stays absent (the UI keeps the glyph); storing the row's password
        // through the service (the reader's unlock path) re-enqueues it and
        // the real image appears under the unchanged cache key.
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping protected-cover proof"
            );
            return;
        }
        let temp = TempDir::new("covers-protected");
        let covers_dir = temp.path().join("covers");
        // The app creates the covers directory at startup (lib.rs); the test
        // mirrors that state before starting the pool.
        std::fs::create_dir_all(&covers_dir).unwrap();
        let sink: Arc<dyn EventSink> = Arc::new(RecordingSink::default());
        let queue = start_pool_with_workers(covers_dir.clone(), Arc::clone(&sink), 1, RenderService::shared());
        let db = crate::Db::for_tests(crate::db::open_in_memory().unwrap());

        let protected = temp.copy_fixture("protected.pdf");
        let path = protected.to_string_lossy().into_owned();
        crate::library::service::import_paths(&db, sink.as_ref(), &queue, std::slice::from_ref(&path), &[])
            .unwrap();
        // The cache key composes from the stored (normalized) row values,
        // so the expectation reads them from the row itself.
        let (row_path, size, mtime) = db
            .with_raw(|conn| {
                conn.query_row(
                    "SELECT path, size, mtime FROM documents WHERE id = 1",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
                )
                .map_err(AppError::from)
            })
            .unwrap();
        let cover = cache_path(&covers_dir, &row_path, size, mtime);

        // The import enqueues a job with no password (the row has none): the
        // pool runs, and no cover file appears.
        drain(&queue, 90);
        assert!(
            !cover.exists(),
            "AC-106: a protected document without a stored password gets no cover image"
        );

        // Storing the password re-enqueues with it; the render now succeeds.
        db.with_raw(|conn| {
            crate::library::service::set_password(conn, sink.as_ref(), &queue, 1, "sesame")
        })
        .unwrap();
        drain(&queue, 90);
        let (width, _) =
            image::image_dimensions(&cover).expect("AC-106: the stored password produces the real cover");
        assert!(
            width >= 560,
            "the cover renders at the normal target, got {width}"
        );
    }

    #[test]
    fn a_renamed_document_renders_under_the_new_key_and_the_stale_entry_is_swept() {
        // AC-110 (FR-21) end-to-end: the real rename path through the real
        // cover pool — the cover follows the new identity (the key composes
        // from the new path, M3) and the stale entry is removed by the
        // existing orphan sweep.
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping rename-cover proof"
            );
            return;
        }
        let temp = TempDir::new("covers-rename");
        let covers_dir = temp.path().join("covers");
        std::fs::create_dir_all(&covers_dir).unwrap();
        let sink: Arc<dyn EventSink> = Arc::new(RecordingSink::default());
        let queue = start_pool_with_workers(covers_dir.clone(), Arc::clone(&sink), 1, RenderService::shared());
        let db = crate::Db::for_tests(crate::db::open_in_memory().unwrap());

        let original = temp.copy_fixture("info-title.pdf");
        let old_path = original.to_string_lossy().into_owned();
        crate::library::service::import_paths(&db, sink.as_ref(), &queue, std::slice::from_ref(&old_path), &[])
            .unwrap();
        let (row_path, size, mtime) = db
            .with_raw(|conn| {
                conn.query_row(
                    "SELECT path, size, mtime FROM documents WHERE id = 1",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
                )
                .map_err(AppError::from)
            })
            .unwrap();
        let old_cover = cache_path(&covers_dir, &row_path, size, mtime);
        drain(&queue, 90);
        assert!(old_cover.exists(), "the imported document has its cover");

        let renamed = db
            .with_raw(|conn| {
                crate::library::service::rename_document(
                    conn,
                    sink.as_ref(),
                    &queue,
                    1,
                    "Renamed Cover.pdf",
                )
            })
            .unwrap();
        drain(&queue, 90);
        let new_cover = cache_path(&covers_dir, &renamed.path, size, mtime);
        assert!(
            new_cover.exists(),
            "AC-110: the cover is regenerated under the new cache key"
        );

        db.with_raw(|conn| sweep_orphans(conn, &covers_dir)).unwrap();
        assert!(!old_cover.exists(), "AC-110: the stale entry is swept");
        assert!(new_cover.exists(), "the live entry survives the sweep");
    }

    #[test]
    fn cover_pool_size_clamps_the_override_and_bounds_the_default() {
        // D17: PDFKEEPER_COVER_WORKERS clamps to 1..8; the default is
        // min(4, max(1, cores/2)) and never 0 or above 4.
        assert_eq!(pool_size(Some("1")), 1);
        assert_eq!(pool_size(Some("2")), 2);
        assert_eq!(pool_size(Some("100")), 8, "override clamps to 8");
        assert_eq!(pool_size(Some("0")), 1, "zero clamps up to one worker");
        assert_eq!(
            pool_size(Some("not a number")),
            pool_size(None),
            "an unparseable override falls back to the default"
        );
        let default = pool_size(None);
        assert!(
            (1..=DEFAULT_MAX_COVER_WORKERS).contains(&default),
            "default pool size is bounded 1..=4, got {default}"
        );
    }

    #[test]
    fn worker_pool_renders_every_cover_exactly_once_across_two_workers() {
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping pool render proof"
            );
            return;
        }
        let temp = TempDir::new("covers-pool");
        let sink = Arc::new(RecordingSink::default());
        let queue = start_pool_with_workers(
            temp.path().to_path_buf(),
            sink.clone(),
            2,
            RenderService::shared(),
        );

        // 30 valid fixtures (enough to cross the 25-job throttle), one
        // unrenderable file, and a duplicate of the first job: the cache
        // must produce exactly one file per key (AC-57), the failure must
        // not block the queue (R5.3).
        let mut jobs = Vec::new();
        for index in 1..=30u32 {
            let path = fixture_doc(index);
            let metadata = std::fs::metadata(&path).unwrap();
            jobs.push((
                path.to_string_lossy().into_owned(),
                metadata.len() as i64,
                epoch_secs(&metadata),
            ));
        }
        let broken = temp.copy_fixture("malformed.pdf");
        let broken_meta = std::fs::metadata(&broken).unwrap();
        let broken_key = (
            broken.to_string_lossy().into_owned(),
            broken_meta.len() as i64,
            epoch_secs(&broken_meta),
        );
        let total_jobs = jobs.len() + 2;
        for (doc_id, (path, size, mtime)) in jobs.iter().enumerate() {
            queue.enqueue(CoverJob {
                doc_id: doc_id as i64 + 1,
                path: path.clone(),
                size: *size,
                mtime: *mtime,
                password: None,
            });
        }
        queue.enqueue(CoverJob {
            doc_id: 1,
            path: jobs[0].0.clone(),
            size: jobs[0].1,
            mtime: jobs[0].2,
            password: None,
        });
        queue.enqueue(CoverJob {
            doc_id: 31,
            path: broken_key.0.clone(),
            size: broken_key.1,
            mtime: broken_key.2,
            password: None,
        });

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while queue.pending.load(Ordering::Relaxed) > 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        assert_eq!(
            queue.pending.load(Ordering::Relaxed),
            0,
            "AC-57: the pool drains the queue"
        );

        let pngs: Vec<_> = std::fs::read_dir(temp.path())
            .unwrap()
            .flatten()
            .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("png"))
            .collect();
        assert_eq!(
            pngs.len(),
            30,
            "AC-57: 30 distinct documents produced exactly 30 covers — the duplicate rendered nothing extra"
        );
        for (path, size, mtime) in &jobs {
            assert!(
                cache_path(temp.path(), path, *size, *mtime).exists(),
                "AC-57: every document in the batch has its cover from the pipeline"
            );
        }
        assert!(
            !cache_path(temp.path(), &broken_key.0, broken_key.1, broken_key.2).exists(),
            "R5.3: the unrenderable file produced no cover and did not block the queue"
        );

        let events = sink.progress();
        assert!(
            events.len() >= 2,
            "AC-57: the 25-job throttle and the final drain both emitted progress events"
        );
        let mut last_processed = 0i64;
        for event in &events {
            assert!(
                event.processed >= last_processed,
                "AC-57: progress events stay monotonic across workers"
            );
            assert!(event.processed <= event.total);
            last_processed = event.processed;
        }
        let final_event = events.last().unwrap();
        assert_eq!(
            (final_event.processed, final_event.total),
            (total_jobs as i64, total_jobs as i64),
            "AC-57: the final drain event reports the whole batch"
        );
    }
}
