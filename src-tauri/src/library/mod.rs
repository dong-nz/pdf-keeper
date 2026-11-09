//! Library service: query composition, import, categories, favorites,
//! deletion, relink, rescan, counts (RULES R1.1 — plain modules, no Tauri).

pub mod query;
pub mod service;

use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Row DTO — the exact fields of spec §5.3.3 plus `categories` (names for
/// row/card badges, UI-03; DR-51).
#[derive(Debug, Clone, Serialize)]
pub struct DocumentDto {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub title: String,
    pub author: String,
    pub notes: String,
    pub favorite: bool,
    pub size: i64,
    pub added_at: i64,
    pub missing: bool,
    pub title_source: String,
    pub categories: Vec<String>,
    pub cover_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryDto {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CountsDto {
    pub total: i64,
    pub favorites: i64,
    pub missing: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub imported: i64,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct RescanResult {
    pub missing_found: i64,
    pub restored: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobProgress {
    pub kind: String,
    pub processed: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchPage {
    pub rows: Vec<DocumentDto>,
    pub total: i64,
}

/// UI preferences persisted in the `settings` table (DR-44).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsDto {
    pub view: String,
    pub sort: String,
    pub dir: String,
    /// Secondary sort key, `"none"` when unset (FR-13).
    pub sort_secondary: String,
    /// Grid column override, `"auto"` when unset (UI-08).
    pub grid_columns: String,
    /// Color ramp override, `"system"` when unset — follows the OS (UI-17).
    pub theme: String,
    pub last_filter: String,
}

/// Backend → UI events (`status_updated`, `library_job_progress`,
/// `settings_changed` (DR-230), spec §5.3.3). Services report through this
/// trait so they stay testable without a running app (RULES R1.1);
/// `TauriSink` implements it over `AppHandle` in `lib.rs`, tests use a
/// recording sink.
pub trait EventSink: Send + Sync {
    fn status(&self, counts: &CountsDto);
    fn progress(&self, job: &JobProgress);
    /// A persisted setting changed (DR-230): every window re-applies its
    /// settings store from the key and its new value.
    fn settings_changed(&self, key: &str, value: &str);
}

/// `settings_changed` payload (DR-230).
#[derive(Debug, Clone, Serialize)]
pub struct SettingsChanged {
    pub key: String,
    pub value: String,
}

pub const SETTINGS_KEYS: [&str; 7] = [
    "view",
    "sort",
    "dir",
    "sort_secondary",
    "grid_columns",
    "theme",
    "last_filter",
];

/// Absolute + lexically normalized path (RULES R2.5). Never touches the
/// filesystem, so symlinked targets are preserved as written.
pub fn normalize_path(input: &str) -> String {
    let absolute = std::path::absolute(input).unwrap_or_else(|_| PathBuf::from(input));
    let mut root: Option<OsString> = None;
    let mut parts: Vec<OsString> = Vec::new();
    for component in absolute.components() {
        match component {
            Component::Prefix(prefix) => {
                let raw = prefix.as_os_str().to_string_lossy().into_owned();
                let stripped = raw.strip_prefix(r"\\?\").unwrap_or(raw.as_str());
                root = Some(OsString::from(stripped));
                parts.clear();
            }
            Component::RootDir => {
                let mut base = root.take().unwrap_or_default();
                base.push(component.as_os_str());
                root = Some(base);
                parts.clear();
            }
            Component::CurDir => {}
            Component::Normal(segment) => parts.push(segment.to_os_string()),
            Component::ParentDir => {
                parts.pop();
            }
        }
    }
    let mut out = PathBuf::new();
    if let Some(prefix) = root {
        out.push(prefix);
    }
    for part in parts {
        out.push(part);
    }
    out.to_string_lossy().into_owned()
}

pub fn is_pdf_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
}

pub fn filename_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// Fallback title: filename without the `.pdf` extension (FR-05).
pub fn title_from_filename(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| filename.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_path_is_absolute_and_lexically_clean() {
        let normalized = normalize_path("docs/../notes.pdf");
        assert!(Path::new(&normalized).is_absolute());
        assert!(!normalized.contains(".."));
        assert!(normalized.ends_with("notes.pdf"));
    }

    #[test]
    fn normalize_path_keeps_absolute_input_unchanged_apart_from_redundant_parts() {
        #[cfg(windows)]
        {
            assert_eq!(normalize_path(r"C:\books\a.pdf"), r"C:\books\a.pdf");
            assert_eq!(
                normalize_path(r"C:\books\.\sub\..\a.pdf"),
                r"C:\books\a.pdf"
            );
        }
        #[cfg(unix)]
        {
            assert_eq!(normalize_path("/books/a.pdf"), "/books/a.pdf");
            assert_eq!(normalize_path("/books/./sub/../a.pdf"), "/books/a.pdf");
        }
    }

    #[test]
    fn pdf_detection_is_extension_based_and_case_insensitive() {
        assert!(is_pdf_path("/a/b/file.PDF"));
        assert!(!is_pdf_path("/a/b/file.pdf.txt"));
        assert!(!is_pdf_path("/a/b/noext"));
    }

    #[test]
    fn fallback_title_strips_the_extension() {
        assert_eq!(
            title_from_filename("Quarterly Report.pdf"),
            "Quarterly Report"
        );
        assert_eq!(title_from_filename("noext"), "noext");
    }
}
