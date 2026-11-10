//! The single owner of pdfium (FR-17, SPEC-v0.0.6 §3.1). The bundled
//! binary is not safe for concurrent calls (DR-134, pdfium-render #262)
//! and the process-global bind can be taken once, so exactly one service
//! thread binds pdfium and serves every render request: the cover
//! pipeline's render stage and the reader commands are its clients.
//! Requests queue with interactive work (reader pages, document info)
//! taken ahead of background work (covers); each resolves exactly once on
//! its one-shot reply channel. A missing binary resolves every request to
//! `None` — covers keep the glyph (R5.3), the reader reports the typed
//! error (§3.2) — the degraded path released in v0.0.2, unchanged.
//!
//! The service is a process singleton (`shared()`): the bind is
//! process-global, so a process can host exactly one service — the app as
//! well as the test process, which is what keeps rendering deterministic
//! under parallel tests.
//!
//! v0.0.8 (FR-20, DR-266): every request carries the document's stored
//! password and the load presents it to pdfium. A protected document whose
//! password is absent or wrong resolves to `LoadFailure::PasswordRequired`
//! — a state distinct from `Unreadable`, which is what the reader's unlock
//! form keys on (AC-104).
use std::collections::VecDeque;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, LazyLock, Mutex};

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::ImageEncoder;
use pdfium_render::prelude::{
    PdfDocument, PdfRenderConfig, Pdfium, PdfiumError, PdfiumInternalError,
};

use crate::error::AppError;

/// §3.1 rendering math: PDF pages are measured in points (72/inch), CSS
/// pixels are 96/inch. A page request's `target_width` is CSS px; the
/// scale it resolves to is bounded to `[0.2, 4.0]` — UI-30's zoom bounds
/// plus the 2× device-pixel cap.
const CSS_PER_POINT: f32 = 4.0 / 3.0;
const MIN_PAGE_SCALE: f32 = 0.2;
const MAX_PAGE_SCALE: f32 = 4.0;

/// Page geometry in PDF units, exactly as pdfium reports it (§3.2's
/// `PdfDocDto` source; AC-61 asserts the values match the file).
pub struct PageInfo {
    pub width_pt: f32,
    pub height_pt: f32,
}

pub struct DocumentInfo {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
}

type ImageReply = mpsc::Sender<Result<image::DynamicImage, LoadFailure>>;
type InfoReply = mpsc::Sender<Result<DocumentInfo, LoadFailure>>;

/// Why a load failed (FR-20, AC-104): a missing or wrong password is a
/// distinct state from an unreadable file — the reader prompts for a
/// password only for the first; the second keeps the existing error state.
#[derive(Debug)]
pub enum LoadFailure {
    /// pdfium refused the file because it is encrypted and the password
    /// presented was absent or wrong (`FPDF_ERR_PASSWORD`).
    PasswordRequired,
    /// The binary is missing, the file is damaged, or the page is out of
    /// range — every failure that is not a password state.
    Unreadable,
}

enum Request {
    /// One reader page: `page` is 1-based (AC-62), `target_width` CSS px.
    Page {
        path: String,
        page: u32,
        target_width: u32,
        password: Option<String>,
        reply: ImageReply,
    },
    /// Document geometry: page count and per-page sizes in points. The
    /// mechanism §3.2's `app_pdf_page`/`app_pdf_document` need, served on
    /// the same single-owner thread.
    Info {
        path: String,
        password: Option<String>,
        reply: InfoReply,
    },
    /// Cover image: page 1 at the cover pipeline's fixed target — the
    /// released rendering math, unchanged (AC-63).
    Cover {
        path: String,
        width: u32,
        max_height: u32,
        password: Option<String>,
        reply: ImageReply,
    },
}

/// The service's queue: interactive requests are taken ahead of queued
/// cover jobs (§3.1 — interactive work beats background work).
#[derive(Default)]
struct Queue {
    interactive: VecDeque<Request>,
    covers: VecDeque<Request>,
}

impl Queue {
    fn take(&mut self) -> Option<Request> {
        self.interactive
            .pop_front()
            .or_else(|| self.covers.pop_front())
    }
}

pub struct RenderService {
    queue: Arc<Mutex<Queue>>,
    wake: Arc<Condvar>,
}

static SERVICE: LazyLock<Arc<RenderService>> = LazyLock::new(RenderService::start);

impl RenderService {
    /// The one service this process may have (the bind is process-global).
    /// `lib.rs` initializes it at setup; tests and services use the same one.
    pub fn shared() -> Arc<RenderService> {
        SERVICE.clone()
    }

    fn start() -> Arc<RenderService> {
        let queue = Arc::new(Mutex::new(Queue::default()));
        let wake = Arc::new(Condvar::new());
        {
            let queue = queue.clone();
            let wake = wake.clone();
            std::thread::spawn(move || serve(&queue, &wake));
        }
        Arc::new(RenderService { queue, wake })
    }

    fn submit(&self, request: Request, interactive: bool) {
        {
            let mut queue = self
                .queue
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if interactive {
                queue.interactive.push_back(request);
            } else {
                queue.covers.push_back(request);
            }
        }
        self.wake.notify_one();
    }

    /// Renders one page (1-based) at a CSS-px target width, scale bounded
    /// per §3.1. `Err(LoadFailure)`: no binary, unreadable file, or page
    /// out of range is `Unreadable`; a protected document with no or wrong
    /// password is `PasswordRequired` (FR-20) — the caller maps each to its
    /// degraded outcome (typed error, unlock form).
    pub fn render_page(
        &self,
        path: &str,
        page: u32,
        target_width: u32,
        password: Option<&str>,
    ) -> Result<image::DynamicImage, LoadFailure> {
        let (reply, result) = mpsc::channel();
        self.submit(
            Request::Page {
                path: path.to_string(),
                page,
                target_width,
                password: password.map(str::to_string),
                reply,
            },
            true,
        );
        result.recv().unwrap_or(Err(LoadFailure::Unreadable))
    }

    /// Page count and per-page sizes in points, or the typed load failure.
    pub fn document_info(
        &self,
        path: &str,
        password: Option<&str>,
    ) -> Result<DocumentInfo, LoadFailure> {
        let (reply, result) = mpsc::channel();
        self.submit(
            Request::Info {
                path: path.to_string(),
                password: password.map(str::to_string),
                reply,
            },
            true,
        );
        result.recv().unwrap_or(Err(LoadFailure::Unreadable))
    }

    /// The cover pipeline's request: page 1 at the pipeline's fixed render
    /// target. Queued behind interactive work — the background path. A
    /// protected document without a usable password yields `None` — no
    /// cover, the glyph fallback (AC-106); cover failures stay untyped.
    pub fn render_cover(
        &self,
        path: &str,
        width: u32,
        max_height: u32,
        password: Option<&str>,
    ) -> Option<image::DynamicImage> {
        let (reply, result) = mpsc::channel();
        self.submit(
            Request::Cover {
                path: path.to_string(),
                width,
                max_height,
                password: password.map(str::to_string),
                reply,
            },
            false,
        );
        result
            .recv()
            .ok()
            .unwrap_or(Err(LoadFailure::Unreadable)) // worker died: no cover
            .ok()
    }
}

fn serve(queue: &Arc<Mutex<Queue>>, wake: &Arc<Condvar>) {
    // The process's one pdfium binding, bound on the one thread that ever
    // calls it (DR-134) — the bind order and failure behavior the cover
    // pipeline shipped since v0.0.2, moved here unchanged.
    let pdfium = bind_pdfium();
    let mut guard = queue
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    loop {
        let Some(request) = guard.take() else {
            guard = wake
                .wait(guard)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            continue;
        };
        drop(guard);
        match request {
            Request::Page {
                path,
                page,
                target_width,
                password,
                reply,
            } => {
                let result = pdfium.as_ref().map_or(Err(LoadFailure::Unreadable), |pdfium| {
                    render_page_image(pdfium, &path, page, target_width, password.as_deref())
                });
                let _ = reply.send(result);
            }
            Request::Info {
                path,
                password,
                reply,
            } => {
                let result = pdfium.as_ref().map_or(Err(LoadFailure::Unreadable), |pdfium| {
                    read_document_info(pdfium, &path, password.as_deref())
                });
                let _ = reply.send(result);
            }
            Request::Cover {
                path,
                width,
                max_height,
                password,
                reply,
            } => {
                let result = pdfium.as_ref().map_or(Err(LoadFailure::Unreadable), |pdfium| {
                    render_cover_image(pdfium, &path, width, max_height, password.as_deref())
                });
                let _ = reply.send(result);
            }
        }
        guard = queue
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
    }
}

// ---------------------------------------------------------------- rendering

/// FR-20 (AC-104): the single load point. The stored password is presented
/// to pdfium when the row holds one; pdfium's password refusal
/// (`FPDF_ERR_PASSWORD`) is classified distinctly from every other load
/// failure — that distinction is what the reader's unlock form keys on.
fn load_pdf<'a>(
    pdfium: &'a Pdfium,
    path: &str,
    password: Option<&str>,
) -> Result<PdfDocument<'a>, LoadFailure> {
    pdfium.load_pdf_from_file(path, password).map_err(|error| {
        if matches!(
            error,
            PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError)
        ) {
            LoadFailure::PasswordRequired
        } else {
            LoadFailure::Unreadable
        }
    })
}

/// §3.1: `scale = target_width / (width_pt × 4/3)` bounded `[0.2, 4.0]`;
/// the page renders at exactly that scale.
fn render_page_image(
    pdfium: &Pdfium,
    path: &str,
    page: u32,
    target_width: u32,
    password: Option<&str>,
) -> Result<image::DynamicImage, LoadFailure> {
    let document = load_pdf(pdfium, path, password)?;
    let pages = document.pages();
    let index = i32::try_from(page.checked_sub(1).ok_or(LoadFailure::Unreadable)?).map_err(
        |_| LoadFailure::Unreadable,
    )?;
    let page = pages.get(index).map_err(|_| LoadFailure::Unreadable)?;
    let size = page.page_size();
    let width_pt = size.width().value;
    let height_pt = size.height().value;
    if width_pt <= 0.0 || height_pt <= 0.0 {
        return Err(LoadFailure::Unreadable);
    }
    let css_width = width_pt * CSS_PER_POINT;
    let css_height = height_pt * CSS_PER_POINT;
    let scale = (target_width as f32 / css_width).clamp(MIN_PAGE_SCALE, MAX_PAGE_SCALE);
    let config = PdfRenderConfig::new()
        .set_target_width((css_width * scale).max(1.0) as i32)
        .set_maximum_height((css_height * scale).max(1.0) as i32);
    page.render_with_config(&config)
        .map_err(|_| LoadFailure::Unreadable)?
        .as_image()
        .map_err(|_| LoadFailure::Unreadable)
}

/// The released cover math (D7, DR-134) unchanged: fixed target width with
/// a height cap, no scale bound — AC-63's regression net depends on it.
fn render_cover_image(
    pdfium: &Pdfium,
    path: &str,
    width: u32,
    max_height: u32,
    password: Option<&str>,
) -> Result<image::DynamicImage, LoadFailure> {
    let config = PdfRenderConfig::new()
        .set_target_width(width as i32)
        .set_maximum_height(max_height as i32);
    let document = load_pdf(pdfium, path, password)?;
    let page = document.pages().iter().next().ok_or(LoadFailure::Unreadable)?;
    page.render_with_config(&config)
        .map_err(|_| LoadFailure::Unreadable)?
        .as_image()
        .map_err(|_| LoadFailure::Unreadable)
}

fn read_document_info(
    pdfium: &Pdfium,
    path: &str,
    password: Option<&str>,
) -> Result<DocumentInfo, LoadFailure> {
    let document = load_pdf(pdfium, path, password)?;
    let pages = document.pages();
    let count = pages.len();
    let mut infos = Vec::with_capacity(usize::try_from(count).map_err(|_| LoadFailure::Unreadable)?);
    for index in 0..count {
        let size = pages.page_size(index).map_err(|_| LoadFailure::Unreadable)?;
        infos.push(PageInfo {
            width_pt: size.width().value,
            height_pt: size.height().value,
        });
    }
    Ok(DocumentInfo {
        page_count: u32::try_from(count).map_err(|_| LoadFailure::Unreadable)?,
        pages: infos,
    })
}

// ------------------------------------------------------------ pdfium bind

fn bind_candidates() -> Vec<PathBuf> {
    // DR-50c bind order: exe directory → binaries/ beside the exe (packaged)
    // → binaries/ in the working directory (dev). Moved from `covers/`
    // unchanged (SPEC-v0.0.6 §3.1).
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

fn bind_pdfium() -> Option<Pdfium> {
    // pdfium-render binds process-globally: the first successful bind wins
    // and every later attempt returns AlreadyInitialized. The service thread
    // binds exactly once — it is the only thread that ever calls pdfium
    // (R5.1, DR-134).
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
/// process-global bind the service thread needs.
pub fn pdfium_binary_present() -> bool {
    bind_candidates()
        .iter()
        .any(|dir| Pdfium::pdfium_platform_library_name_at_path(dir).is_file())
}

// ----------------------------------------------------------- reader cache

/// The reader page cache (FR-17, §3.2): `<reader_dir>/<doc-key>/<page>-<width>.png`
/// — the document id is the key, mirroring the `reader-<id>` window label,
/// so window-close and delete cleanup address exactly one directory.
/// Session-scoped: written by `app_pdf_page`, removed when a reader window
/// closes, when the document is deleted, and wholesale at startup.
pub fn reader_page_path(reader_dir: &Path, doc_id: i64, page: u32, width: u32) -> PathBuf {
    reader_dir
        .join(doc_id.to_string())
        .join(format!("{page}-{width}.png"))
}

/// Removing one document's reader cache never fails a flow (AC-62/AC-67):
/// absence is success, any other failure leaves stale files the reader
/// simply re-requests — the same cleanup discipline the cover cache ships.
pub fn remove_document_cache(reader_dir: &Path, doc_id: i64) {
    remove_dir_ignoring_absence(&reader_dir.join(doc_id.to_string()));
}

/// Startup sweep: the reader cache is session-scoped, so leftovers from a
/// previous run are removed wholesale (the released sweep pattern, §3.2).
pub fn clear_reader_cache(reader_dir: &Path) {
    remove_dir_ignoring_absence(reader_dir);
}

fn remove_dir_ignoring_absence(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

// ------------------------------------------------------- reader page serving

/// One page's geometry, in points — the `app_pdf_document` payload (§3.2);
/// the reader view sizes each page at its exact aspect ratio.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PdfPageDto {
    pub width_pt: f32,
    pub height_pt: f32,
}

/// The `app_pdf_document` payload (§3.2).
#[derive(Debug, Clone, serde::Serialize)]
pub struct PdfDocDto {
    pub page_count: u32,
    pub pages: Vec<PdfPageDto>,
}

/// Document geometry for the reader view. An unopenable file yields the
/// typed `PdfUnopenable` — the same classification the cover path gives the
/// same failure, which is what UI-31's error state keys on (AC-69). A
/// protected document yields `PasswordRequired` with the row's stored
/// password (FR-20, AC-104): `Some` pre-fills the unlock form, `None`
/// leaves it empty.
pub fn document_dto(
    render: &RenderService,
    path: &str,
    password: Option<&str>,
) -> Result<PdfDocDto, AppError> {
    let info = render.document_info(path, password).map_err(|error| {
        password_required_or_unopenable(error, path, password)
    })?;
    Ok(PdfDocDto {
        page_count: info.page_count,
        pages: info
            .pages
            .iter()
            .map(|page| PdfPageDto {
                width_pt: page.width_pt,
                height_pt: page.height_pt,
            })
            .collect(),
    })
}

fn password_required_or_unopenable(
    error: LoadFailure,
    path: &str,
    password: Option<&str>,
) -> AppError {
    match error {
        LoadFailure::PasswordRequired => AppError::PasswordRequired {
            path: path.to_string(),
            stored: password.map(str::to_string),
        },
        LoadFailure::Unreadable => AppError::PdfUnopenable {
            path: path.to_string(),
        },
    }
}

/// Serve one reader page (§3.2): a cache hit is served as-is with no
/// rendering; a miss renders through the single owner at the requested width
/// (the service clamps scale to `MAX_SCALE` — the cache key records the
/// *requested* width, so re-requesting the same size is always a hit),
/// PNG-encodes and writes the cache file. The payload is the path (R5.4);
/// callers run this on a blocking thread, never the UI thread (R3.5).
pub fn serve_page(
    render: &RenderService,
    reader_dir: &Path,
    doc_id: i64,
    document_path: &str,
    page: u32,
    target_width: u32,
    password: Option<&str>,
) -> Result<String, AppError> {
    let cache = reader_page_path(reader_dir, doc_id, page, target_width);
    if cache.exists() {
        return Ok(cache.to_string_lossy().into_owned());
    }
    let image = render
        .render_page(document_path, page, target_width, password)
        .map_err(|error| {
            password_required_or_unopenable(error, document_path, password)
        })?;
    if let Some(parent) = cache.parent() {
        std::fs::create_dir_all(parent).map_err(|error| AppError::Io {
            path: parent.to_string_lossy().into_owned(),
            message: error.to_string(),
        })?;
    }
    // D19 (DR-196): the reader page path encodes with the measured
    // `Fast + Sub` row — 332→207 ms at 1 932 px, lossless by construction
    // (AC-74). The cache contract is untouched: same key, same PNG format,
    // same two-stage serving. Covers keep the balanced default encoder.
    let file = std::fs::File::create(&cache).map_err(|error| AppError::Io {
        path: cache.to_string_lossy().into_owned(),
        message: error.to_string(),
    })?;
    PngEncoder::new_with_quality(BufWriter::new(file), CompressionType::Fast, FilterType::Sub)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|error| AppError::Io {
            path: cache.to_string_lossy().into_owned(),
            message: error.to_string(),
        })?;
    Ok(cache.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{TempDir, fixture, fixture_multi};

    #[test]
    fn the_queue_takes_interactive_requests_ahead_of_cover_jobs() {
        // §3.1: interactive work beats background work, regardless of the
        // order requests arrived in.
        let (page_reply, _pr) = mpsc::channel();
        let (cover_reply, _cr) = mpsc::channel();
        let (info_reply, _ir) = mpsc::channel();
        let mut queue = Queue::default();
        queue.covers.push_back(Request::Cover {
            path: "C:/a.pdf".into(),
            width: 640,
            max_height: 905,
            password: None,
            reply: cover_reply,
        });
        queue.covers.push_back(Request::Cover {
            path: "C:/b.pdf".into(),
            width: 640,
            max_height: 905,
            password: None,
            reply: mpsc::channel().0,
        });
        queue.interactive.push_back(Request::Page {
            path: "C:/a.pdf".into(),
            page: 1,
            target_width: 800,
            password: None,
            reply: page_reply,
        });
        queue.interactive.push_back(Request::Info {
            path: "C:/a.pdf".into(),
            password: None,
            reply: info_reply,
        });
        let first = queue.take().expect("page request first");
        assert!(matches!(first, Request::Page { .. }));
        let second = queue.take().expect("info request second");
        assert!(matches!(second, Request::Info { .. }));
        let third = queue.take().expect("covers follow");
        assert!(matches!(third, Request::Cover { .. }));
        assert!(matches!(queue.take(), Some(Request::Cover { .. })));
        assert!(queue.take().is_none());
    }

    #[test]
    fn reader_cache_paths_address_one_directory_per_document() {
        let dir = Path::new("C:/appdata/reader");
        assert_eq!(
            reader_page_path(dir, 7, 3, 1600),
            PathBuf::from("C:/appdata/reader/7/3-1600.png")
        );
        assert_eq!(
            reader_page_path(dir, 7, 1, 100),
            PathBuf::from("C:/appdata/reader/7/1-100.png")
        );
        assert_ne!(
            reader_page_path(dir, 7, 3, 1600),
            reader_page_path(dir, 8, 3, 1600),
            "different documents never share a cache file"
        );
    }

    #[test]
    fn reader_cache_cleanup_removes_the_document_directory_and_tolerates_absence() {
        // AC-62/AC-67 cleanup mechanics: window close and delete both call
        // this; absence is success; other documents' caches are untouched.
        let temp = TempDir::new("reader-cache");
        let reader_dir = temp.path().join("reader");
        std::fs::create_dir_all(reader_dir.join("7")).unwrap();
        std::fs::create_dir_all(reader_dir.join("8")).unwrap();
        std::fs::write(reader_dir.join("7/3-1600.png"), "png").unwrap();
        std::fs::write(reader_dir.join("8/1-800.png"), "png").unwrap();

        remove_document_cache(&reader_dir, 7);
        assert!(!reader_dir.join("7").exists());
        assert!(
            reader_dir.join("8/1-800.png").exists(),
            "other documents keep their cache"
        );
        remove_document_cache(&reader_dir, 7); // absent is success
        remove_document_cache(&reader_dir, 99); // never existed

        clear_reader_cache(&reader_dir);
        assert!(!reader_dir.exists());
        clear_reader_cache(&reader_dir); // absent is success
    }

    fn service() -> Arc<RenderService> {
        RenderService::shared()
    }

    #[test]
    fn document_info_reports_the_fixture_page_count_and_sizes() {
        // AC-61: page count correct, sizes match the file (the generator's
        // Letter MediaBox: 612 × 792 pt).
        if !pdfium_binary_present() {
            eprintln!("pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping info proof");
            return;
        }
        let path = fixture_multi("multi-024.pdf");
        let info = service()
            .document_info(&path.to_string_lossy(), None)
            .expect("AC-61: a valid multi-page fixture yields its info");
        assert_eq!(info.page_count, 24);
        assert_eq!(info.pages.len(), 24);
        for page in &info.pages {
            assert_eq!((page.width_pt, page.height_pt), (612.0, 792.0));
        }
        // An unrenderable file yields Err(Unreadable) — the typed-error
        // contract (§3.2).
        assert!(
            service()
                .document_info(&fixture("malformed.pdf").to_string_lossy(), None)
                .is_err_and(|error| matches!(error, LoadFailure::Unreadable))
        );
    }

    #[test]
    fn a_protected_document_prompts_and_unlocks_with_the_right_password() {
        // AC-104 (FR-20, DR-266 b): a protected document with no or wrong
        // password is `PasswordRequired` on every request path; the stored
        // password opens it. The fixture is genuinely RC4-encrypted with the
        // user password "sesame" (make-fixtures.mjs).
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping password proof"
            );
            return;
        }
        let path = fixture("protected.pdf").to_string_lossy().into_owned();
        let service = service();

        // No password: the load refuses on both interactive paths.
        assert!(
            service
                .document_info(&path, None)
                .is_err_and(|error| matches!(error, LoadFailure::PasswordRequired)),
            "a protected document without a password is the prompt state"
        );
        assert!(
            service
                .render_page(&path, 1, 800, None)
                .is_err_and(|error| matches!(error, LoadFailure::PasswordRequired)),
            "page rendering shares the prompt state"
        );
        // A wrong password is the same state — the reader's failed attempt.
        assert!(
            service
                .render_page(&path, 1, 800, Some("wrong"))
                .is_err_and(|error| matches!(error, LoadFailure::PasswordRequired)),
            "a wrong password is still the prompt state, not Unreadable"
        );

        // The right password: the document behaves like any other.
        let info = service
            .document_info(&path, Some("sesame"))
            .expect("the stored password opens the document");
        assert_eq!(info.page_count, 1);
        let page = service
            .render_page(&path, 1, 800, Some("sesame"))
            .expect("the protected page renders with the password");
        assert!(
            (page.width() as i64 - 800).abs() <= 2,
            "rendered at the requested width, got {}",
            page.width()
        );
        // The decrypted content stream really carries the drawn text: the
        // page is not blank (the per-object RC4 key is part of the fixture).
        let luma = page.to_luma8();
        let dark = luma.as_raw().iter().filter(|byte| **byte < 128).count();
        assert!(dark > 100, "the protected page renders its text, got {dark} dark pixels");

        // The typed error carries the stored (rejected) password for the
        // unlock form's prefill (DR-266 b).
        let error = document_dto(&service, &path, Some("wrong")).expect_err("stays protected");
        match error {
            AppError::PasswordRequired { stored, .. } => {
                assert_eq!(stored.as_deref(), Some("wrong"));
            }
            other => panic!("expected password-required, got {other:?}"),
        }
        let unopened = document_dto(&service, &path, None).expect_err("stays protected");
        match unopened {
            AppError::PasswordRequired { stored, .. } => assert_eq!(stored, None),
            other => panic!("expected password-required, got {other:?}"),
        }

        // AC-106 (render half): the cover path degrades to no-image — the
        // glyph fallback — without a usable password, and renders with one.
        assert!(service.render_cover(&path, 320, 456, None).is_none());
        assert!(service.render_cover(&path, 320, 456, Some("wrong")).is_none());
        assert!(service.render_cover(&path, 320, 456, Some("sesame")).is_some());
    }

    #[test]
    fn page_rendering_honours_the_scale_bounds_and_page_range() {
        // AC-61/AC-62: pages render at the requested CSS width; §3.1 bounds
        // the scale to [0.2, 4.0]; pages outside the document resolve None.
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping render proof"
            );
            return;
        }
        let path = fixture_multi("multi-012.pdf")
            .to_string_lossy()
            .into_owned();
        let service = service();
        // Letter: css width 612 × 4/3 = 816 px.
        let exact = service
            .render_page(&path, 2, 800, None)
            .expect("AC-61: page 2 of a valid multi-page fixture renders");
        assert!(
            (exact.width() as i64 - 800).abs() <= 2,
            "AC-62: rendered at the requested width, got {}",
            exact.width()
        );
        // 4000 / 816 = 4.9 → clamped to 4.0 → 3264 px.
        let capped = service.render_page(&path, 1, 4000, None).expect("page 1 renders");
        assert!(
            (capped.width() as i64 - 3264).abs() <= 2,
            "§3.1: scale capped at 4.0, got {}",
            capped.width()
        );
        // 100 / 816 = 0.12 → clamped to 0.2 → 163 px.
        let floored = service
            .render_page(&path, 12, 100, None)
            .expect("the last page renders");
        assert!(
            (floored.width() as i64 - 163).abs() <= 2,
            "§3.1: scale floored at 0.2, got {}",
            floored.width()
        );
        assert!(
            service.render_page(&path, 13, 800, None).is_err(),
            "AC-62: a page outside the document resolves Err"
        );
        assert!(
            service.render_page(&path, 0, 800, None).is_err(),
            "pages are 1-based; 0 is out of range"
        );
        assert!(
            service
                .render_page(&fixture("malformed.pdf").to_string_lossy(), 1, 800, None)
                .is_err_and(|error| matches!(error, LoadFailure::Unreadable)),
            "an unreadable file resolves Err(Unreadable) (the caller reports the typed error)"
        );
    }

    #[test]
    fn rendered_pages_are_distinguishable_by_the_drawn_page_number() {
        // AC-61: "a rendered page is distinguishable" — the generator draws
        // the page number into each page's content stream; two rendered
        // pages of the same document must differ in pixels.
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping render proof"
            );
            return;
        }
        let path = fixture_multi("multi-012.pdf")
            .to_string_lossy()
            .into_owned();
        let service = service();
        let page1 = service.render_page(&path, 1, 400, None).expect("page 1 renders");
        let page2 = service.render_page(&path, 2, 400, None).expect("page 2 renders");
        assert_eq!(page1.width(), page2.width());
        assert_eq!(page1.height(), page2.height());
        assert_ne!(
            page1.into_bytes(),
            page2.into_bytes(),
            "AC-61: page 1 and page 2 render differently (the drawn page number)"
        );
    }

    #[test]
    fn the_scale_fixture_serves_its_last_page_like_its_first() {
        // AC-65's fixture contract: the 1 000-page document opens, reports
        // 1 000 pages, and its last page renders (the mount-bound test
        // itself is the UI harness flow).
        if !pdfium_binary_present() {
            eprintln!(
                "pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping render proof"
            );
            return;
        }
        let path = fixture_multi("multi-1000.pdf")
            .to_string_lossy()
            .into_owned();
        let service = service();
        let info = service
            .document_info(&path, None)
            .expect("AC-65 fixture: the scale document opens");
        assert_eq!(info.page_count, 1000);
        assert!(
            service.render_page(&path, 1000, 800, None).is_ok(),
            "the last page of a 1 000-page document renders"
        );
    }

    #[test]
    fn serve_page_writes_the_cache_once_and_serves_the_cached_file_after() {
        // §3.2's serving rule: a miss renders and writes; a hit is served
        // as-is, with no rendering — proven by replacing the cache file's
        // bytes with a sentinel and re-requesting the same page and width.
        if !pdfium_binary_present() {
            eprintln!("pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping serve proof");
            return;
        }
        let temp = TempDir::new("serve-page");
        let reader_dir = temp.path().join("reader");
        let path = fixture_multi("multi-012.pdf")
            .to_string_lossy()
            .into_owned();
        let served = super::serve_page(&service(), &reader_dir, 42, &path, 2, 800, None)
            .expect("a valid document serves its page");
        assert_eq!(
            served,
            reader_page_path(&reader_dir, 42, 2, 800).to_string_lossy(),
            "the payload is the cache path (R5.4)"
        );
        std::fs::write(&served, "sentinel").unwrap();
        let again = super::serve_page(&service(), &reader_dir, 42, &path, 2, 800, None).unwrap();
        assert_eq!(again, served);
        assert_eq!(
            std::fs::read_to_string(&served).unwrap(),
            "sentinel",
            "the cache hit is served untouched — no re-render overwrote it"
        );
    }

    #[test]
    fn the_chosen_encoder_writes_lossless_pixels_at_the_unchanged_cache_key() {
        // AC-74: `serve_page` writes the cache file through the chosen
        // encoder (DR-196); the file decodes back through the `image` crate
        // with identical dimensions and identical pixels, and the cache path
        // key is unchanged.
        if !pdfium_binary_present() {
            eprintln!("pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping encode proof");
            return;
        }
        let temp = TempDir::new("encode");
        let reader_dir = temp.path().join("reader");
        let path = fixture_multi("multi-012.pdf")
            .to_string_lossy()
            .into_owned();
        let served = super::serve_page(&service(), &reader_dir, 44, &path, 1, 800, None)
            .expect("a valid document serves its page");
        assert_eq!(
            served,
            reader_page_path(&reader_dir, 44, 1, 800).to_string_lossy(),
            "the cache path key is unchanged (§3.2)"
        );
        let decoded = image::open(&served).expect("the cache file decodes through the image crate");
        let rendered = service()
            .render_page(&path, 1, 800, None)
            .expect("the same page renders again");
        assert_eq!(decoded.width(), rendered.width());
        assert_eq!(decoded.height(), rendered.height());
        assert_eq!(
            decoded.into_bytes(),
            rendered.into_bytes(),
            "PNG is lossless: the file decodes back with identical pixels"
        );
    }

    #[test]
    fn the_reader_helpers_report_an_unopenable_document_as_a_typed_error() {
        // AC-69's Rust half: the reader commands' error state keys on the
        // typed classification — both page serving and document info yield
        // `PdfUnopenable`, the same classification the cover path gives.
        if !pdfium_binary_present() {
            eprintln!("pdfium binary missing — run scripts/fetch-pdfium.mjs; skipping error proof");
            return;
        }
        let temp = TempDir::new("serve-error");
        let reader_dir = temp.path().join("reader");
        let broken = fixture("malformed.pdf").to_string_lossy().into_owned();
        let page_error =
            super::serve_page(&service(), &reader_dir, 43, &broken, 1, 800, None)
                .expect_err("typed");
        assert!(
            matches!(page_error, AppError::PdfUnopenable { .. }),
            "page serving yields the typed classification: {page_error}"
        );
        let info_error = super::document_dto(&service(), &broken, None).expect_err("typed");
        assert!(
            matches!(info_error, AppError::PdfUnopenable { .. }),
            "document info yields the typed classification: {info_error}"
        );
        assert!(
            !reader_dir.join("43").exists(),
            "a failed serve leaves no cache directory or half-written file behind"
        );
    }
}
