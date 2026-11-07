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
        root.join("multi").join("manifest.json"),
    ];
    if markers.iter().any(|marker| !marker.exists()) {
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
}

impl RecordingSink {
    pub fn statuses(&self) -> Vec<CountsDto> {
        self.statuses.lock().unwrap().clone()
    }
    pub fn progress(&self) -> Vec<JobProgress> {
        self.progress.lock().unwrap().clone()
    }
}

impl EventSink for RecordingSink {
    fn status(&self, counts: &CountsDto) {
        self.statuses.lock().unwrap().push(*counts);
    }
    fn progress(&self, job: &JobProgress) {
        self.progress.lock().unwrap().push(job.clone());
    }
}
