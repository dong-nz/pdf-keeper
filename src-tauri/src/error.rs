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
    #[error("Category name already exists: {name}")]
    CategoryNameDuplicate { name: String },
    #[error("Category not found (id {id})")]
    CategoryNotFound { id: i64 },
    #[error("Document not found (id {id})")]
    DocumentNotFound { id: i64 },
    #[error("Missing from disk: {path}")]
    MissingFile { path: String, document_id: i64 },
    #[error("Not a PDF file: {path}")]
    NotPdf { path: String },
    #[error("Cannot read PDF: {path}")]
    PdfUnopenable { path: String },
    #[error("Already in the library: {path}")]
    PathTaken { path: String },
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
}

impl AppError {
    pub fn payload(&self) -> AppErrorPayload {
        let (kind, message, document_id) = match self {
            AppError::TitleEmpty => ("validation", self.to_string(), None),
            AppError::Validation(_) => ("validation", self.to_string(), None),
            AppError::CategoryNameDuplicate { .. } => {
                ("category_duplicate", self.to_string(), None)
            }
            AppError::CategoryNotFound { id } => {
                ("category_not_found", self.to_string(), Some(*id))
            }
            AppError::DocumentNotFound { id } => {
                ("document_not_found", self.to_string(), Some(*id))
            }
            AppError::MissingFile { path, document_id } => {
                ("missing_file", path.clone(), Some(*document_id))
            }
            AppError::NotPdf { path } => ("not_pdf", path.clone(), None),
            AppError::PdfUnopenable { path } => ("pdf_unopenable", path.clone(), None),
            AppError::PathTaken { path } => ("path_taken", path.clone(), None),
            AppError::Io { path, message } => ("io", format!("{path}: {message}"), None),
            AppError::Db { .. } => ("internal", self.to_string(), None),
            AppError::Internal(_) => ("internal", self.to_string(), None),
        };
        AppErrorPayload {
            kind,
            message,
            document_id,
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
