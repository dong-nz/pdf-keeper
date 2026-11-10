use serde::Serialize;
use thiserror::Error;

/// The single application error type (RULES R3.2). Services return this; the
/// command boundary converts it to `AppErrorPayload` (RULES R1.2).
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Title cannot be empty")]
    TitleEmpty,
    #[error("{0}")]
    Validation(String),
    #[error("Tag name already exists: {name}")]
    TagNameDuplicate { name: String },
    #[error("Tag not found (id {id})")]
    TagNotFound { id: i64 },
    #[error("Document not found (id {id})")]
    DocumentNotFound { id: i64 },
    #[error("Missing from disk: {path}")]
    MissingFile { path: String, document_id: i64 },
    #[error("Not a PDF file: {path}")]
    NotPdf { path: String },
    #[error("Cannot read PDF: {path}")]
    PdfUnopenable { path: String },
    #[error("Password required: {path}")]
    PasswordRequired {
        path: String,
        /// The stored (rejected) password, carried to the unlock form for
        /// prefill (FR-20, AC-104/AC-105 — the mechanism named by DR-266).
        stored: Option<String>,
    },
    #[error("Already in the library: {path}")]
    PathTaken { path: String },
    #[error("Invalid name: {0}")]
    InvalidName(String),
    #[error("A file or document already exists at: {path}")]
    NameConflict { path: String },
    #[error("Cannot access {path}: {message}")]
    Io { path: String, message: String },
    #[error("Database error: {source}")]
    Db { source: rusqlite::Error },
    #[error("Internal error: {0}")]
    Internal(String),
}

/// Typed error payload crossing the command boundary (spec §5.1, §5.3.3).
#[derive(Debug, Clone, Serialize)]
pub struct AppErrorPayload {
    pub kind: &'static str,
    pub message: String,
    pub document_id: Option<i64>,
    /// Only ever set by `password-required`: the stored password the reader
    /// unlock form pre-fills (FR-20). Absent from every other payload.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}

impl AppError {
    pub fn payload(&self) -> AppErrorPayload {
        let (kind, message, document_id, password) = match self {
            AppError::TitleEmpty => ("validation", self.to_string(), None, None),
            AppError::Validation(_) => ("validation", self.to_string(), None, None),
            AppError::TagNameDuplicate { .. } => ("tag_duplicate", self.to_string(), None, None),
            AppError::TagNotFound { id } => ("tag_not_found", self.to_string(), Some(*id), None),
            AppError::DocumentNotFound { id } => {
                ("document_not_found", self.to_string(), Some(*id), None)
            }
            AppError::MissingFile { path, document_id } => {
                ("missing_file", path.clone(), Some(*document_id), None)
            }
            AppError::NotPdf { path } => ("not_pdf", path.clone(), None, None),
            AppError::PdfUnopenable { path } => ("pdf_unopenable", path.clone(), None, None),
            AppError::PasswordRequired { path, stored } => (
                "password-required",
                path.clone(),
                None,
                stored.clone(),
            ),
            AppError::PathTaken { path } => ("path_taken", path.clone(), None, None),
            AppError::InvalidName(_) => ("invalid_name", self.to_string(), None, None),
            AppError::NameConflict { path } => ("name_conflict", path.clone(), None, None),
            AppError::Io { path, message } => ("io", format!("{path}: {message}"), None, None),
            AppError::Db { .. } => ("internal", self.to_string(), None, None),
            AppError::Internal(_) => ("internal", self.to_string(), None, None),
        };
        AppErrorPayload {
            kind,
            message,
            document_id,
            password,
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(source: rusqlite::Error) -> Self {
        AppError::Db { source }
    }
}

/// True when a rusqlite error is a UNIQUE/PRIMARY constraint violation.
pub fn is_unique_violation(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation
    )
}

/// True when a rusqlite error is an FTS5 query-syntax failure — the only
/// trigger for the permitted LIKE fallback (RULES R2.3).
pub fn is_fts_syntax_error(error: &rusqlite::Error) -> bool {
    match error {
        rusqlite::Error::SqliteFailure(_, Some(msg)) => msg.contains("fts5"),
        _ => false,
    }
}
