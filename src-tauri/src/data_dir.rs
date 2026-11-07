//! Data-directory resolution (DR-162): the one place that decides where the
//! app writes. `PDFKEEPER_DATA_DIR` is the verification-harness override that
//! lets the two UI suites run in parallel against isolated libraries; unset,
//! the released Tauri resolution stands unchanged. Same pattern as the
//! `PDFKEEPER_COVER_WORKERS` override: a test-only mechanism, no UI surface.

use std::path::{Path, PathBuf};

use crate::error::AppError;

pub const ENV_VAR: &str = "PDFKEEPER_DATA_DIR";

/// The resolved directory, managed as app state so the `app_data_dir` command
/// reports exactly the directory the app itself writes to (R1.4: the read
/// follows the write at one source).
pub struct DataDir(pub PathBuf);

/// Resolve the data directory from the environment override and the app's
/// own fallback resolution. An override must be an absolute path — a relative
/// one is a harness misconfiguration, and guessing a base would silently
/// point two suites at the same library. An empty value counts as unset.
pub fn resolve(fallback: &Path, override_value: Option<&str>) -> Result<PathBuf, AppError> {
    let Some(raw) = override_value else {
        return Ok(fallback.to_path_buf());
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(fallback.to_path_buf());
    }
    let candidate = Path::new(trimmed);
    if !candidate.is_absolute() {
        return Err(AppError::Validation(format!(
            "{ENV_VAR} must be an absolute path: {trimmed}"
        )));
    }
    Ok(candidate.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::TempDir;

    #[test]
    fn data_dir_override_absolute_is_used() {
        // Absolute on every platform (testutil), like the harness passes it.
        let tmp = TempDir::new("data_dir");
        let override_dir = tmp.path().join("parallel").join("docs");
        let out = resolve(
            Path::new("/app/default"),
            Some(&override_dir.to_string_lossy()),
        )
        .unwrap();
        assert_eq!(out, override_dir);
    }

    #[test]
    fn data_dir_without_override_keeps_the_app_resolution() {
        let tmp = TempDir::new("data_dir_fallback");
        let fallback = tmp.path();
        let out = resolve(fallback, None).unwrap();
        assert_eq!(out, fallback);
        // An empty environment value is the Windows way of saying "unset".
        let out = resolve(fallback, Some("  ")).unwrap();
        assert_eq!(out, fallback);
    }

    #[test]
    fn data_dir_override_must_be_absolute() {
        let err = resolve(Path::new("/app/default"), Some("parallel/docs")).unwrap_err();
        match &err {
            AppError::Validation(message) => {
                assert!(message.contains(ENV_VAR), "names the offending variable");
                assert!(
                    message.contains("parallel/docs"),
                    "quotes the rejected value"
                );
            }
            other => panic!("expected a validation error, got {other:?}"),
        }
        assert_eq!(err.payload().kind, "validation");
    }
}
