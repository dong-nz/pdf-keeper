//! Test-only helpers shared by the module test suites: generated fixture
//! PDFs (RULES R6.2 via `scripts/make-fixtures.mjs`), unique temp
//! directories, and a recording `EventSink`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::library::{CountsDto, EventSink, JobProgress};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri lives at the repo root")
        .to_path_buf()
}

/// Ensure the generated fixture tree exists (once per test process) and
/// return its root. Fixtures are produced by `scripts/make-fixtures.mjs`
/// (RULES R6.2) — Rust tests consume the same tree as the UI smoke script.
static FIXTURES_READY: std::sync::LazyLock<()> = std::sync::LazyLock::new(|| {
    let root = repo_root().join("fixtures");
    // Every tier the current generator writes has a marker; a tree missing
    // any of them is from an older generator and gets regenerated.
    let markers = [
        root.join("special").join("info-title.pdf"),
        root.join("special").join("protected.pdf"),
        root.join("multi").join("manifest.json"),
    ];
    // The v0.0.7 generator records the multi-192 outline in the manifest
    // (SPEC-v0.0.7 §3.5); a manifest without it is from an older generator
    // and takes the same regeneration path as a missing marker.
    let manifest_current = std::fs::read_to_string(root.join("multi").join("manifest.json"))
        .is_ok_and(|manifest| manifest.contains("\"outline\""));
    if markers.iter().any(|marker| !marker.exists()) || !manifest_current {
        let script = repo_root().join("scripts/make-fixtures.mjs");
        let output = Command::new("node")
            .arg(&script)
            .current_dir(repo_root())
            .output()
            .expect("run scripts/make-fixtures.mjs (node is part of the toolchain)");
        assert!(
            output.status.success(),
            "fixture generator failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    for marker in &markers {
        assert!(marker.exists(), "fixture tree incomplete after generation");
    }
});

pub fn fixtures() -> PathBuf {
    std::sync::LazyLock::force(&FIXTURES_READY);
    repo_root().join("fixtures")
}

pub fn fixture(name: &str) -> PathBuf {
    fixtures().join("special").join(name)
}

pub fn fixture_doc(index: u32) -> PathBuf {
    fixtures().join("docs").join(format!("doc{:05}.pdf", index))
}

/// Multi-page tier fixture (SPEC-v0.0.6 §3.5): `multi-<pages>.pdf` from
/// `fixtures/multi/`, the same tree the UI harness reads.
pub fn fixture_multi(name: &str) -> PathBuf {
    fixtures().join("multi").join(name)
}

/// The outline entries `fixtures/multi/manifest.json` records for one
/// multi-tier document (SPEC-v0.0.7 §3.5): the Rust tests derive the
/// expected tree from the manifest instead of hard-coding it. The manifest is
/// written by `scripts/make-fixtures.mjs` in its stable pretty-printed shape,
/// so this is a targeted scan of the `outline` array, not a JSON parser. An
/// empty result means the manifest records no outline for that document.
pub fn manifest_outline(doc_name: &str) -> Vec<(String, u32, u32)> {
    let manifest = std::fs::read_to_string(fixtures().join("multi").join("manifest.json"))
        .expect("fixtures/multi/manifest.json");
    let name_at = manifest
        .find(&format!("\"name\": \"{doc_name}.pdf\""))
        .unwrap_or_else(|| panic!("manifest has no entry for {doc_name}"));
    let block = &manifest[name_at..];
    let Some(outline_at) = block.find("\"outline\": [") else {
        return Vec::new();
    };
    let array_end = block[outline_at..]
        .find(']')
        .expect("unterminated outline array in the manifest");
    let mut rest = &block[outline_at..outline_at + array_end];
    let mut entries = Vec::new();
    while let Some(title_at) = rest.find("\"title\": \"") {
        rest = &rest[title_at + "\"title\": \"".len()..];
        let title_end = rest.find('"').expect("unterminated title string");
        let title = rest[..title_end].to_string();
        rest = &rest[title_end..];
        let (page, after_page) = scan_number(rest, "\"page\": ");
        let (depth, after_depth) = scan_number(after_page, "\"depth\": ");
        entries.push((title, page, depth));
        rest = after_depth;
    }
    entries
}

fn scan_number<'a>(text: &'a str, field: &str) -> (u32, &'a str) {
    let at = text.find(field).expect("missing manifest number field");
    let rest = &text[at + field.len()..];
    let digits_end = rest
        .find(|c: char| !c.is_ascii_digit())
        .expect("unterminated manifest number");
    let value = rest[..digits_end].parse().expect("manifest number");
    (value, &rest[digits_end..])
}

/// A unique temp directory, removed on drop. `tag` keeps names readable.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(tag: &str) -> Self {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "pdfkeeper-test-{}-{}-{}",
            std::process::id(),
            id,
            tag
        ));
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// Copy a fixture into this directory (mutation tests never touch the
    /// shared fixture tree).
    pub fn copy_fixture(&self, name: &str) -> PathBuf {
        let target = self.0.join(name);
        std::fs::copy(fixture(name), &target).expect("copy fixture");
        target
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Records every event a service emits, in order (status-feedback tests).
#[derive(Default)]
pub struct RecordingSink {
    pub statuses: std::sync::Mutex<Vec<CountsDto>>,
    pub progress: std::sync::Mutex<Vec<JobProgress>>,
    pub settings: std::sync::Mutex<Vec<(String, String)>>,
}

impl RecordingSink {
    pub fn statuses(&self) -> Vec<CountsDto> {
        self.statuses.lock().unwrap().clone()
    }
    pub fn progress(&self) -> Vec<JobProgress> {
        self.progress.lock().unwrap().clone()
    }
    pub fn settings(&self) -> Vec<(String, String)> {
        self.settings.lock().unwrap().clone()
    }
}

impl EventSink for RecordingSink {
    fn status(&self, counts: &CountsDto) {
        self.statuses.lock().unwrap().push(*counts);
    }
    fn progress(&self, job: &JobProgress) {
        self.progress.lock().unwrap().push(job.clone());
    }
    fn settings_changed(&self, key: &str, value: &str) {
        self
            .settings
            .lock()
            .unwrap()
            .push((key.to_string(), value.to_string()));
    }
}
