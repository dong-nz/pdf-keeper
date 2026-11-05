//! Cover thumbnails (FR-16 as modified by DR-113): a background generation
//! queue and a PNG cache keyed by path+size+mtime+render width (RULES R5).
//! Rendering uses `pdfium-render` bound to a bundled pdfium library at
//! runtime (DR-50c); any render failure simply leaves the document without a
//! cached cover — the UI shows the generic glyph (R5.3) and nothing else
//! fails.

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, mpsc};

use rusqlite::Connection;

use crate::error::AppError;
use crate::library::EventSink;
use crate::library::JobProgress;

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
}

/// Cloneable handle to the generation worker.
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

/// Start the single background worker (RULES R3.5, R5.1). Pdfium itself is
/// not thread-safe; the crate's `thread_safe` feature serializes access, and
/// one worker keeps the pipeline simple.
pub fn start_worker(dir: PathBuf, sink: Arc<dyn EventSink>) -> CoverQueue {
    let (sender, receiver) = mpsc::channel::<CoverJob>();
    let pending = Arc::new(AtomicI64::new(0));
    let processed = Arc::new(AtomicI64::new(0));
    let counter_pending = pending.clone();
    let counter_processed = processed.clone();
    let worker_dir = dir.clone();

    std::thread::spawn(move || {
        let pdfium = bind_pdfium();
        let mut last_emitted: i64 = 0;
        while let Ok(job) = receiver.recv() {
            if let Some(pdfium) = &pdfium {
                let target = cache_path(&worker_dir, &job.path, job.size, job.mtime);
                if !target.exists() {
                    render_cover(pdfium, &job.path, &target);
                }
            }
            counter_pending.fetch_sub(1, Ordering::Relaxed);
            let done = counter_processed.fetch_add(1, Ordering::Relaxed) + 1;
            let remaining = counter_pending.load(Ordering::Relaxed);
            // Throttle progress events; always report the final drain.
            if done - last_emitted >= 25 || remaining == 0 {
                last_emitted = done;
                sink.progress(&JobProgress {
                    kind: "cover".into(),
                    processed: done,
                    total: done + remaining,
                });
            }
        }
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

fn bind_candidates() -> Vec<PathBuf> {
    // DR-50c bind order: exe directory → binaries/ beside the exe (packaged)
    // → binaries/ in the working directory (dev).
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe()
        && let Some(exe_dir) = exe.parent()
    {
        candidates.push(exe_dir.to_path_buf());
        candidates.push(exe_dir.join("binaries"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("binaries"));
    }
    candidates
}

fn bind_pdfium() -> Option<pdfium_render::prelude::Pdfium> {
    use pdfium_render::prelude::Pdfium;
    // pdfium-render binds process-globally: the first successful bind wins
    // and every later attempt returns AlreadyInitialized. The app binds
    // exactly once — in the cover worker thread (R5.1).
    for dir in bind_candidates() {
        let name = Pdfium::pdfium_platform_library_name_at_path(&dir);
        if let Ok(library) = Pdfium::bind_to_library(&name) {
            return Some(Pdfium::new(library));
        }
    }
    Pdfium::bind_to_system_library().ok().map(Pdfium::new)
}

/// Whether a Pdfium library file sits in the bind search path. Tests use
/// this instead of `bind_pdfium` because probing would consume the
/// process-global bind the worker needs.
pub fn pdfium_binary_present() -> bool {
    use pdfium_render::prelude::Pdfium;
    bind_candidates()
        .iter()
        .any(|dir| Pdfium::pdfium_platform_library_name_at_path(dir).is_file())
}

fn render_cover(pdfium: &pdfium_render::prelude::Pdfium, path: &str, target: &Path) {
    use pdfium_render::prelude::PdfRenderConfig;

    // D7 (FR-16 as modified): 640 px covers a 320 CSS px card at 2× device
    // scaling; the same A4 ratio as the former 220×311 pair, scaled up. A
    // wider page is height-capped exactly as before.
    let config = PdfRenderConfig::new()
        .set_target_width(RENDER_TARGET_WIDTH as i32)
        .set_maximum_height(RENDER_TARGET_HEIGHT as i32);
    let document = match pdfium.load_pdf_from_file(path, None) {
        Ok(document) => document,
        Err(_) => return, // unrenderable → glyph (R5.3), never an error
    };
    let page = match document.pages().iter().next() {
        Some(page) => page,
        None => return,
    };
    let bitmap = match page.render_with_config(&config) {
        Ok(bitmap) => bitmap,
        Err(_) => return,
    };
    let image = match bitmap.as_image() {
        Ok(image) => image,
        Err(_) => return,
    };
    // PNG path extension selects the format; write errors leave the glyph.
    let _ = image.save(target);
}

/// Queue survives app restart: re-enqueue every document whose cached cover
/// is absent or stale (covers.md).
pub fn enqueue_missing_covers(conn: &Connection, queue: &CoverQueue) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id, path, size, mtime FROM documents ORDER BY id")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    for row in rows {
        let (doc_id, path, size, mtime) = row?;
        if !cache_path(&queue.dir, &path, size, mtime).exists() {
            queue.enqueue(CoverJob {
                doc_id,
                path,
                size,
                mtime,
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
    use crate::testutil::{RecordingSink, TempDir};
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
        let queue = start_worker(temp.path().to_path_buf(), sink);

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
        });
        queue.enqueue(CoverJob {
            doc_id: 2,
            path: broken_key.0.clone(),
            size: broken_key.1,
            mtime: broken_key.2,
        });

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
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
}
