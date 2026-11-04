//! Service operations. Every fallible path returns `AppError` (RULES R3.2);
//! multi-table writes run in transactions (RULES R2.4); every mutation path
//! emits `status_updated` (FR-15 invariant).

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, params, params_from_iter};

use crate::covers::{self, CoverJob, CoverQueue};
use crate::db;
use crate::error::{AppError, is_unique_violation};

use super::query::{self, Query};
use super::{
    CategoryDto, CountsDto, DocumentDto, EventSink, ImportResult, JobProgress, RescanResult,
    SETTINGS_KEYS, SearchPage, SettingsDto, filename_of, is_pdf_path, normalize_path,
    title_from_filename,
};

const CHUNK: usize = 500;

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn mtime_secs(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn emit_status(conn: &Connection, sink: &dyn EventSink) -> Result<(), AppError> {
    let counts = get_counts(conn)?;
    sink.status(&counts);
    Ok(())
}

pub fn get_counts(conn: &Connection) -> Result<CountsDto, AppError> {
    // One pass, no cached counters (FR-15).
    Ok(conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(favorite), 0), COALESCE(SUM(missing), 0) FROM documents",
        [],
        |row| {
            Ok(CountsDto {
                total: row.get(0)?,
                favorites: row.get(1)?,
                missing: row.get(2)?,
            })
        },
    )?)
}

// ---------------------------------------------------------------- documents

pub fn search_document(
    conn: &Connection,
    covers_dir: &Path,
    query: &Query,
    offset: i64,
    limit: i64,
) -> Result<SearchPage, AppError> {
    query::search(conn, query, offset, limit, covers_dir)
}

pub fn get_document(
    conn: &Connection,
    covers_dir: &Path,
    id: i64,
) -> Result<DocumentDto, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM documents d WHERE d.id = ?1",
        query::ROW_COLUMNS
    ))?;
    let mut rows = stmt.query_map(params![id], |row| query::map_row(row, covers_dir))?;
    match rows.next() {
        Some(Ok(doc)) => Ok(doc),
        Some(Err(e)) => Err(e.into()),
        None => Err(AppError::DocumentNotFound { id }),
    }
}

/// Resolve the file to hand to the OS viewer (FR-08): a missing document
/// short-circuits to `MissingFile` and no open is attempted.
pub fn open_target(conn: &Connection, id: i64) -> Result<String, AppError> {
    let result = conn.query_row(
        "SELECT path, missing FROM documents WHERE id = ?1",
        params![id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
    );
    match result {
        Ok((path, true)) => Err(AppError::MissingFile {
            path,
            document_id: id,
        }),
        Ok((path, false)) => Ok(path),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::DocumentNotFound { id }),
        Err(e) => Err(e.into()),
    }
}

pub fn set_favorite(
    conn: &Connection,
    sink: &dyn EventSink,
    covers_dir: &Path,
    id: i64,
    value: bool,
) -> Result<DocumentDto, AppError> {
    let changed = conn.execute(
        "UPDATE documents SET favorite = ?2 WHERE id = ?1",
        params![id, value as i64],
    )?;
    if changed == 0 {
        return Err(AppError::DocumentNotFound { id });
    }
    emit_status(conn, sink)?;
    get_document(conn, covers_dir, id)
}

/// The editable fields of one document, grouped so the service signature
/// stays small (RULES R7).
pub struct DocumentEdit<'a> {
    pub title: &'a str,
    pub author: &'a str,
    pub notes: &'a str,
    pub favorite: bool,
    pub category_ids: &'a [i64],
}

pub fn update_document(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_dir: &Path,
    id: i64,
    edit: &DocumentEdit<'_>,
) -> Result<DocumentDto, AppError> {
    let title = edit.title.trim();
    if title.is_empty() {
        return Err(AppError::TitleEmpty);
    }
    let exists = conn
        .query_row("SELECT 1 FROM documents WHERE id = ?1", params![id], |_| {
            Ok(())
        })
        .is_ok();
    if !exists {
        return Err(AppError::DocumentNotFound { id });
    }
    validate_categories(conn, edit.category_ids)?;

    let tx = conn.transaction()?;
    // title_source flips to 'user' only when the title value itself changes;
    // that flag gates relink title re-derivation (metadata-editing.md).
    tx.execute(
        "UPDATE documents SET title = ?2, author = ?3, notes = ?4, favorite = ?5,
         title_source = CASE WHEN ?2 = title THEN title_source ELSE 'user' END
         WHERE id = ?1",
        params![id, title, edit.author, edit.notes, edit.favorite as i64],
    )?;
    replace_document_categories(&tx, id, edit.category_ids)?;
    tx.commit()?;
    emit_status(conn, sink)?;
    get_document(conn, covers_dir, id)
}

pub fn set_document_categories(
    conn: &mut Connection,
    sink: &dyn EventSink,
    document_id: i64,
    category_ids: &[i64],
) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE id = ?1",
        params![document_id],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::DocumentNotFound { id: document_id });
    }
    validate_categories(conn, category_ids)?;
    let tx = conn.transaction()?;
    replace_document_categories(&tx, document_id, category_ids)?;
    tx.commit()?;
    emit_status(conn, sink)
}

fn replace_document_categories(
    tx: &rusqlite::Transaction<'_>,
    document_id: i64,
    category_ids: &[i64],
) -> Result<(), AppError> {
    tx.execute(
        "DELETE FROM document_categories WHERE document_id = ?1",
        params![document_id],
    )?;
    for category_id in category_ids {
        tx.execute(
            "INSERT OR IGNORE INTO document_categories (document_id, category_id) VALUES (?1, ?2)",
            params![document_id, category_id],
        )?;
    }
    Ok(())
}

fn validate_categories(conn: &Connection, category_ids: &[i64]) -> Result<(), AppError> {
    for category_id in category_ids {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE id = ?1",
            params![category_id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::CategoryNotFound { id: *category_id });
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ import

/// Import pipeline (importing-pdfs.md): filter to `.pdf`, stat, insert in
/// chunked transactions with duplicate skip (FR-11), metadata extraction
/// with filename fallback (FR-05), category auto-assignment (FR-10), cover
/// jobs enqueued after each commit — the command returns as soon as the
/// rows are committed.
pub fn import_paths(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    paths: &[String],
    category_ids: &[i64],
) -> Result<ImportResult, AppError> {
    // FR-10 as modified (DR-82): every active category receives the import;
    // an empty set assigns nothing. All ids are validated before any write.
    validate_categories(&*conn, category_ids)?;

    let mut candidates: Vec<(String, i64, i64)> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for path in paths {
        let normalized = normalize_path(path);
        if !is_pdf_path(&normalized) {
            skipped.push(normalized);
            continue;
        }
        match fs::metadata(&normalized) {
            Ok(metadata) if metadata.is_file() => {
                if seen.insert(normalized.clone()) {
                    candidates.push((normalized, metadata.len() as i64, mtime_secs(&metadata)));
                } else {
                    skipped.push(normalized);
                }
            }
            _ => skipped.push(normalized),
        }
    }

    let total = candidates.len() as i64;
    let mut imported = 0i64;
    let mut processed = 0i64;
    for chunk in candidates.chunks(CHUNK) {
        let mut jobs: Vec<CoverJob> = Vec::new();
        {
            let tx = conn.transaction()?;
            let added_at = now_secs();
            for (path, size, mtime) in chunk {
                let extracted = crate::pdfmeta::extract(path);
                let filename = filename_of(path);
                let title = extracted
                    .title
                    .unwrap_or_else(|| title_from_filename(&filename));
                let author = extracted.author.unwrap_or_default();
                let inserted = tx.execute(
                    "INSERT OR IGNORE INTO documents (path, filename, title, author, notes, size, mtime, added_at)
                     VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, ?7)",
                    params![path, filename, title, author, size, mtime, added_at],
                )?;
                if inserted == 0 {
                    skipped.push(path.clone());
                    continue;
                }
                let document_id = tx.last_insert_rowid();
                for category_id in category_ids {
                    tx.execute(
                        "INSERT OR IGNORE INTO document_categories (document_id, category_id) VALUES (?1, ?2)",
                        params![document_id, category_id],
                    )?;
                }
                imported += 1;
                jobs.push(CoverJob {
                    doc_id: document_id,
                    path: path.clone(),
                    size: *size,
                    mtime: *mtime,
                });
            }
            tx.commit()?;
        }
        for job in jobs {
            covers_queue.enqueue(job);
        }
        processed += chunk.len() as i64;
        sink.progress(&JobProgress {
            kind: "import".into(),
            processed,
            total,
        });
    }

    emit_status(conn, sink)?;
    Ok(ImportResult { imported, skipped })
}

/// One-time folder import: recursive walk for `*.pdf` (DR-50a), then the
/// same pipeline.
pub fn import_folder(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    dir: &str,
    category_ids: &[i64],
) -> Result<ImportResult, AppError> {
    let mut paths: Vec<String> = Vec::new();
    collect_pdfs(Path::new(dir), &mut paths);
    import_paths(conn, sink, covers_queue, &paths, category_ids)
}

fn collect_pdfs(dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_pdfs(&path, out);
        } else if file_type.is_file()
            && let Some(text) = path.to_str()
            && is_pdf_path(text)
        {
            out.push(text.to_string());
        }
    }
}

// ------------------------------------------------------------------ rescan

/// Startup + manual Rescan only (FR-12, DR-13b). Marks vanished files
/// missing, refreshes size/mtime, enqueues cover jobs for changed files.
/// `quiet` suppresses progress events (the startup run stays silent unless
/// it finds something — the status counts still update).
pub fn rescan(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    quiet: bool,
) -> Result<RescanResult, AppError> {
    struct Entry {
        id: i64,
        path: String,
        size: i64,
        mtime: i64,
        missing: bool,
    }
    let mut entries: Vec<Entry> = Vec::new();
    {
        let mut stmt =
            conn.prepare("SELECT id, path, size, mtime, missing FROM documents ORDER BY id")?;
        let rows = stmt.query_map([], |row| {
            Ok(Entry {
                id: row.get(0)?,
                path: row.get(1)?,
                size: row.get(2)?,
                mtime: row.get(3)?,
                missing: row.get::<_, i64>(4)? != 0,
            })
        })?;
        for entry in rows {
            entries.push(entry?);
        }
    }

    let total = entries.len() as i64;
    let mut result = RescanResult {
        missing_found: 0,
        restored: 0,
    };
    let mut changed = false;
    let mut processed = 0i64;

    for chunk in entries.chunks(CHUNK) {
        let mut jobs: Vec<CoverJob> = Vec::new();
        {
            let tx = conn.transaction()?;
            for entry in chunk {
                match fs::metadata(&entry.path) {
                    Err(_) => {
                        if !entry.missing {
                            tx.execute(
                                "UPDATE documents SET missing = 1 WHERE id = ?1",
                                params![entry.id],
                            )?;
                            result.missing_found += 1;
                            changed = true;
                        }
                    }
                    Ok(metadata) => {
                        let size = metadata.len() as i64;
                        let mtime = mtime_secs(&metadata);
                        if entry.missing {
                            tx.execute(
                                "UPDATE documents SET missing = 0, size = ?2, mtime = ?3 WHERE id = ?1",
                                params![entry.id, size, mtime],
                            )?;
                            result.restored += 1;
                            changed = true;
                            jobs.push(CoverJob {
                                doc_id: entry.id,
                                path: entry.path.clone(),
                                size,
                                mtime,
                            });
                        } else if size != entry.size || mtime != entry.mtime {
                            tx.execute(
                                "UPDATE documents SET size = ?2, mtime = ?3 WHERE id = ?1",
                                params![entry.id, size, mtime],
                            )?;
                            changed = true;
                            jobs.push(CoverJob {
                                doc_id: entry.id,
                                path: entry.path.clone(),
                                size,
                                mtime,
                            });
                        }
                    }
                }
            }
            tx.commit()?;
        }
        for job in jobs {
            covers_queue.enqueue(job);
        }
        processed += chunk.len() as i64;
        if !quiet {
            sink.progress(&JobProgress {
                kind: "rescan".into(),
                processed,
                total,
            });
        }
    }

    if !quiet || changed {
        emit_status(conn, sink)?;
    }
    Ok(result)
}

// ------------------------------------------------------------------ delete

/// FR-09 / DR-50b: for the with-file variant, `remove_file` runs BEFORE the
/// row transaction so a failure leaves every row intact and the operation is
/// retriable (a file already gone counts as deleted). Cover-cache cleanup
/// happens after the commit; no document can leave an orphan cover.
pub fn delete_documents(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    ids: &[i64],
    delete_files: bool,
) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut rows: Vec<(i64, String, i64, i64)> = Vec::new();
    {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT id, path, size, mtime FROM documents WHERE id IN ({placeholders})"
        ))?;
        let found = stmt.query_map(params_from_iter(ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        for row in found {
            rows.push(row?);
        }
    }
    if rows.len() != ids.len() {
        let present: HashSet<i64> = rows.iter().map(|(id, ..)| *id).collect();
        let missing_id = ids
            .iter()
            .find(|id| !present.contains(id))
            .copied()
            .unwrap_or(0);
        return Err(AppError::DocumentNotFound { id: missing_id });
    }

    if delete_files {
        for (_, path, _, _) in &rows {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(AppError::Io {
                        path: path.clone(),
                        message: error.to_string(),
                    });
                }
            }
        }
    }

    {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let tx = conn.transaction()?;
        tx.execute(
            &format!("DELETE FROM documents WHERE id IN ({placeholders})"),
            params_from_iter(ids.iter()),
        )?;
        tx.commit()?;
    }

    for (_, path, size, mtime) in &rows {
        let cache_file = covers::cache_path(&covers_queue.dir, path, *size, *mtime);
        match fs::remove_file(&cache_file) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {} // a stale cache file is swept at startup; deletion never fails the flow
        }
    }

    emit_status(conn, sink)
}

// ------------------------------------------------------------------ relink

/// FR-12: point an entry at a new path. Validation errors are typed so the
/// Relink dialog can show them inline (not a bare toast). Auto-titled
/// documents re-derive their title from the new filename; user titles are
/// preserved.
pub fn relink_document(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    id: i64,
    new_path: &str,
) -> Result<DocumentDto, AppError> {
    let normalized = normalize_path(new_path);
    if !is_pdf_path(&normalized) {
        return Err(AppError::NotPdf { path: normalized });
    }
    let metadata = fs::metadata(&normalized).map_err(|error| AppError::Io {
        path: normalized.clone(),
        message: error.to_string(),
    })?;
    if !metadata.is_file() {
        return Err(AppError::NotPdf { path: normalized });
    }

    let title_source: Option<String> = conn
        .query_row(
            "SELECT title_source FROM documents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .ok();
    let Some(title_source) = title_source else {
        return Err(AppError::DocumentNotFound { id });
    };

    let filename = filename_of(&normalized);
    let size = metadata.len() as i64;
    let mtime = mtime_secs(&metadata);
    let tx = conn.transaction()?;
    let update = if title_source == "auto" {
        tx.execute(
            "UPDATE documents SET path = ?2, filename = ?3, title = ?4, size = ?5, mtime = ?6, missing = 0 WHERE id = ?1",
            params![id, normalized, filename, title_from_filename(&filename), size, mtime],
        )
    } else {
        tx.execute(
            "UPDATE documents SET path = ?2, filename = ?3, size = ?4, mtime = ?5, missing = 0 WHERE id = ?1",
            params![id, normalized, filename, size, mtime],
        )
    };
    match update {
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::PathTaken { path: normalized });
        }
        Err(error) => return Err(error.into()),
    }
    tx.commit()?;

    covers_queue.enqueue(CoverJob {
        doc_id: id,
        path: normalized,
        size,
        mtime,
    });
    emit_status(conn, sink)?;
    get_document(conn, &covers_queue.dir, id)
}

// -------------------------------------------------------------- categories

pub fn categories_list(conn: &Connection) -> Result<Vec<CategoryDto>, AppError> {
    // Live counts computed in SQL, never cached client-side (categories.md).
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, COUNT(dc.document_id)
         FROM categories c
         LEFT JOIN document_categories dc ON dc.category_id = c.id
         GROUP BY c.id, c.name
         ORDER BY c.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(CategoryDto {
            id: row.get(0)?,
            name: row.get(1)?,
            count: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn categories_create(conn: &Connection, name: &str) -> Result<CategoryDto, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Category name cannot be empty".into()));
    }
    let inserted = conn.execute("INSERT INTO categories (name) VALUES (?1)", params![name]);
    let id = match inserted {
        Ok(_) => conn.last_insert_rowid(),
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::CategoryNameDuplicate { name: name.into() });
        }
        Err(error) => return Err(error.into()),
    };
    Ok(CategoryDto {
        id,
        name: name.into(),
        count: 0,
    })
}

pub fn categories_rename(conn: &Connection, id: i64, name: &str) -> Result<CategoryDto, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Category name cannot be empty".into()));
    }
    let updated = conn.execute(
        "UPDATE categories SET name = ?2 WHERE id = ?1",
        params![id, name],
    );
    match updated {
        Ok(0) => return Err(AppError::CategoryNotFound { id }),
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::CategoryNameDuplicate { name: name.into() });
        }
        Err(error) => return Err(error.into()),
    }
    // Membership is untouched (FR-02 invariant).
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM document_categories WHERE category_id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(CategoryDto {
        id,
        name: name.into(),
        count,
    })
}

pub fn categories_delete(conn: &Connection, id: i64) -> Result<(), AppError> {
    // Join rows cascade; documents are never touched (FR-02).
    let deleted = conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::CategoryNotFound { id });
    }
    Ok(())
}

/// FR-07: add and/or remove categories over a multi-selection in ONE
/// transaction / one command call.
pub fn bulk_categories(
    conn: &mut Connection,
    sink: &dyn EventSink,
    document_ids: &[i64],
    add: &[i64],
    remove: &[i64],
) -> Result<(), AppError> {
    {
        let placeholders = document_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let mut present: HashSet<i64> = HashSet::new();
        {
            let mut stmt = conn.prepare(&format!(
                "SELECT id FROM documents WHERE id IN ({placeholders})"
            ))?;
            let rows = stmt.query_map(params_from_iter(document_ids.iter()), |row| {
                row.get::<_, i64>(0)
            })?;
            for id in rows {
                present.insert(id?);
            }
        }
        if let Some(missing) = document_ids.iter().find(|id| !present.contains(id)) {
            return Err(AppError::DocumentNotFound { id: *missing });
        }
    }
    validate_categories(conn, add)?;
    validate_categories(conn, remove)?;

    let tx = conn.transaction()?;
    for document_id in document_ids {
        for category_id in add {
            tx.execute(
                "INSERT OR IGNORE INTO document_categories (document_id, category_id) VALUES (?1, ?2)",
                params![document_id, category_id],
            )?;
        }
        for category_id in remove {
            tx.execute(
                "DELETE FROM document_categories WHERE document_id = ?1 AND category_id = ?2",
                params![document_id, category_id],
            )?;
        }
    }
    tx.commit()?;
    emit_status(conn, sink)
}

// ---------------------------------------------------------------- settings

pub fn get_settings(conn: &Connection) -> Result<SettingsDto, AppError> {
    Ok(SettingsDto {
        view: db::get_setting(conn, "view")?
            .filter(|v| v == "list" || v == "grid")
            .unwrap_or_else(|| "list".into()),
        sort: db::get_setting(conn, "sort")?
            .filter(|v| matches!(v.as_str(), "title" | "date_added" | "size"))
            .unwrap_or_else(|| "title".into()),
        dir: db::get_setting(conn, "dir")?
            .filter(|v| v == "asc" || v == "desc")
            .unwrap_or_else(|| "asc".into()),
        sort_secondary: db::get_setting(conn, "sort_secondary")?
            .filter(|v| matches!(v.as_str(), "none" | "title" | "date_added" | "size"))
            .unwrap_or_else(|| "none".into()),
        grid_columns: db::get_setting(conn, "grid_columns")?
            .filter(|v| is_valid_grid_columns(v))
            .unwrap_or_else(|| "auto".into()),
        last_filter: db::get_setting(conn, "last_filter")?
            .filter(|v| is_valid_filter(v))
            .unwrap_or_else(|| "all".into()),
    })
}

/// `last_filter` grammar (spec §3.2): a mode, optionally followed by
/// `&cats=<id>(,<id>)*`. The v0.0.1 form `cat:<id>` stays valid input so an
/// existing saved filter survives the upgrade instead of being dropped.
fn is_valid_filter(value: &str) -> bool {
    if let Some(id) = value.strip_prefix("cat:") {
        // v0.0.1 wrote exactly one id in this position; anything else is a
        // corrupt row, not a category list.
        return !id.is_empty()
            && id.chars().all(|c| c.is_ascii_digit())
            && id.parse::<i64>().is_ok();
    }
    let (mode, cats) = match value.split_once("&cats=") {
        Some((mode, ids)) => (mode, Some(ids)),
        None => (value, None),
    };
    matches!(mode, "all" | "favorites" | "missing") && cats.is_none_or(is_valid_id_list)
}

fn is_valid_id_list(ids: &str) -> bool {
    !ids.is_empty()
        && ids.split(',').all(|part| {
            !part.is_empty()
                && part.chars().all(|c| c.is_ascii_digit())
                && part.parse::<i64>().is_ok()
        })
}

/// Grid column override (UI-08): `"auto"` or a manual count in the clamp range
/// the View menu offers (2–10). Anything else is a corrupt row, never a count.
fn is_valid_grid_columns(value: &str) -> bool {
    value == "auto"
        || value
            .parse::<u32>()
            .is_ok_and(|count| (2..=10).contains(&count))
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    if !SETTINGS_KEYS.contains(&key) {
        return Err(AppError::Validation(format!("Unknown setting: {key}")));
    }
    let valid = match key {
        "view" => value == "list" || value == "grid",
        "sort" => matches!(value, "title" | "date_added" | "size"),
        "dir" => value == "asc" || value == "desc",
        "sort_secondary" => matches!(value, "none" | "title" | "date_added" | "size"),
        "grid_columns" => is_valid_grid_columns(value),
        "last_filter" => is_valid_filter(value),
        _ => false,
    };
    if !valid {
        return Err(AppError::Validation(format!("Invalid value for {key}")));
    }
    db::set_setting(conn, key, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;
    use crate::library::query::{Query, SortDir, SortKey};
    use crate::testutil::{RecordingSink, TempDir, fixture, fixture_doc};
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    fn list_query(q: &str) -> Query {
        Query {
            q: q.to_string(),
            category_ids: Vec::new(),
            favorites_only: false,
            missing_only: false,
            sort: SortKey::Title,
            sort_dir: SortDir::Asc,
            sort_secondary: None,
        }
    }

    /// Import a copied fixture so mutation tests never touch the shared tree.
    fn import_copy(
        conn: &mut Connection,
        temp: &TempDir,
        name: &str,
        sink: &dyn EventSink,
    ) -> DocumentDto {
        let path = temp.copy_fixture(name).to_string_lossy().into_owned();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let result =
            import_paths(conn, sink, &queue, std::slice::from_ref(&path), &[]).expect("import");
        assert_eq!(result.imported, 1, "fixture must import: {path}");
        let id = conn.last_insert_rowid();
        drop(receiver);
        get_document(conn, &queue.dir, id).expect("imported document")
    }

    #[test]
    fn import_extracts_info_titles_and_falls_back_to_filename() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("import-meta");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = [
            "info-title.pdf",
            "info-none.pdf",
            "encrypted.pdf",
            "malformed.pdf",
            "notes.txt",
        ]
        .iter()
        .map(|name| temp.copy_fixture(name).to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let result = import_paths(&mut conn, &sink, &queue, &paths, &[]).unwrap();
        drop(receiver);

        assert_eq!(result.imported, 4);
        assert_eq!(
            result.skipped,
            vec![paths[4].clone()],
            "non-PDF is skipped with notice"
        );

        let rows = search_document(&conn, &queue.dir, &list_query(""), 0, 100)
            .unwrap()
            .rows;
        let by_title = |needle: &str| {
            rows.iter()
                .find(|row| row.title == needle)
                .unwrap_or_else(|| {
                    panic!(
                        "no row titled {needle} in {:?}",
                        rows.iter().map(|r| &r.title).collect::<Vec<_>>()
                    )
                })
        };
        // FR-05: Info-dictionary hit; every failure mode lands on the filename.
        let hit = by_title("Real Info Title");
        assert_eq!(hit.author, "Real Info Author");
        assert_eq!(hit.title_source, "auto");
        for fallback in ["info-none", "encrypted", "malformed"] {
            let row = by_title(fallback);
            assert_eq!(row.author, "");
            assert_eq!(row.title_source, "auto");
        }
    }

    #[test]
    fn import_skips_duplicates_and_auto_assigns_the_selected_category() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("import-dup");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let path = temp
            .copy_fixture("info-title.pdf")
            .to_string_lossy()
            .into_owned();

        let category = categories_create(&conn, "Reading").unwrap();
        let first = import_paths(
            &mut conn,
            &sink,
            &queue,
            std::slice::from_ref(&path),
            &[category.id],
        )
        .unwrap();
        assert_eq!(first.imported, 1);

        let second = import_paths(
            &mut conn,
            &sink,
            &queue,
            std::slice::from_ref(&path),
            &[category.id],
        )
        .unwrap();
        assert_eq!(second.imported, 0);
        assert_eq!(
            second.skipped,
            vec![path.clone()],
            "duplicate path is skipped with notice"
        );

        // FR-01 (DR-13a): import auto-assigns the currently selected category.
        let document = get_document(&conn, &queue.dir, 1).unwrap();
        assert_eq!(document.categories, vec!["Reading".to_string()]);

        let unknown = import_paths(
            &mut conn,
            &sink,
            &queue,
            &["z:/nope.pdf".to_string()],
            &[999],
        );
        assert!(matches!(
            unknown,
            Err(AppError::CategoryNotFound { id: 999 })
        ));
        drop(receiver);
    }

    #[test]
    fn import_of_ten_thousand_fixtures_stays_within_budget() {
        // AC-01 + NFR-02 (DR-42): the batch completes in under 30 s.
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("import-10k");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = (1..=10_000)
            .map(|i| fixture_doc(i).to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        let started = Instant::now();
        let result = import_paths(&mut conn, &sink, &queue, &paths, &[]).unwrap();
        let elapsed = started.elapsed();

        assert_eq!(result.imported, 10_000);
        assert_eq!(result.skipped, Vec::<String>::new());
        let counts = get_counts(&conn).unwrap();
        assert_eq!(counts.total, 10_000);
        // Titles come from the fixtures' Info dictionaries end to end.
        let page = search_document(
            &conn,
            &queue.dir,
            &list_query("Fixture Doc doc00042"),
            0,
            10,
        )
        .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.rows[0].title, "Fixture Doc doc00042");
        assert!(
            elapsed.as_secs() < 30,
            "10 000-document import took {elapsed:?}, budget is 30 s"
        );
        drop(receiver);
    }

    #[test]
    fn search_of_ten_thousand_documents_stays_within_budget() {
        // AC-02 (R6.3): prefix hits across all four fields at fixture scale,
        // timing asserted in the test. Rows are seeded directly — search
        // semantics do not need the files on disk (import is covered by
        // the AC-01 test).
        let conn = open_in_memory().unwrap();
        let temp = TempDir::new("search-10k");
        for i in 0..10_000i64 {
            conn.execute(
                "INSERT INTO documents (path, filename, title, author, notes, size, mtime, added_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    format!("{}:{i:05}.pdf", temp.path().display()),
                    format!("{i:05}.pdf"),
                    format!("Report {i:05}"),
                    format!("Author {i:05}"),
                    format!("notes about widget {i:05}"),
                    i,
                    i,
                    i
                ],
            )
            .unwrap();
        }

        let cases = [
            ("rep", 10_000, "title"),
            ("auth", 10_000, "author"),
            ("widg", 10_000, "notes"),
            ("00012", 1, "filename of row 12 only"),
        ];
        for (needle, expected, field) in cases {
            let started = Instant::now();
            let hits = search_document(&conn, temp.path(), &list_query(needle), 0, 500).unwrap();
            let elapsed = started.elapsed();
            assert_eq!(hits.total, expected, "{needle} must prefix-hit {field}");
            assert!(hits.rows.len() <= 500, "page respects the limit");
            assert!(
                elapsed < Duration::from_millis(100),
                "AC-02 budget: prefix query over 10 000 documents took {elapsed:?}"
            );
        }
    }

    #[test]
    fn categories_membership_bulk_edit_and_delete_cascade() {
        // AC-03: many-to-many, bulk add/remove in one call, delete cascades
        // the join rows only (FR-02).
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("categories");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        drop(receiver);

        fs::write(
            temp.path().join("second.pdf"),
            "%PDF-1.4\nnot parsed but imported\n%%EOF\n",
        )
        .unwrap();
        let paths = [
            temp.copy_fixture("info-title.pdf")
                .to_string_lossy()
                .into_owned(),
            temp.path()
                .join("second.pdf")
                .to_string_lossy()
                .into_owned(),
        ];
        let result = import_paths(&mut conn, &sink, &queue, &paths, &[]).unwrap();
        assert_eq!(result.imported, 2);

        let a = categories_create(&conn, "A").unwrap();
        let b = categories_create(&conn, "B").unwrap();
        let c = categories_create(&conn, "C").unwrap();
        assert!(
            matches!(
                categories_create(&conn, "a"),
                Err(AppError::CategoryNameDuplicate { .. })
            ),
            "names are unique case-insensitively"
        );

        set_document_categories(&mut conn, &sink, 1, &[a.id, b.id]).unwrap();
        let document = get_document(&conn, &queue.dir, 1).unwrap();
        assert_eq!(document.categories, vec!["A".to_string(), "B".to_string()]);

        // One call, multiple documents: add C to both, remove A from doc 1.
        bulk_categories(&mut conn, &sink, &[1, 2], &[c.id], &[a.id]).unwrap();
        let listed = categories_list(&conn).unwrap();
        let counts = |name: &str| {
            listed
                .iter()
                .find(|category| category.name == name)
                .map(|category| category.count)
        };
        assert_eq!(counts("A"), Some(0));
        assert_eq!(counts("B"), Some(1));
        assert_eq!(counts("C"), Some(2));

        // Deleting a category never deletes documents (FR-02).
        categories_delete(&conn, b.id).unwrap();
        let document = get_document(&conn, &queue.dir, 1).unwrap();
        assert_eq!(document.categories, vec!["C".to_string()]);
        let counts = get_counts(&conn).unwrap();
        assert_eq!(counts.total, 2);
    }

    #[test]
    fn delete_library_only_keeps_the_file_delete_with_file_removes_it_and_its_cover() {
        // AC-04 + R5.2.
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("delete");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");

        let kept = import_copy_with(&mut conn, &temp, "info-none.pdf", &sink, &covers_dir);
        let removed = import_copy_with(&mut conn, &temp, "info-title.pdf", &sink, &covers_dir);

        // Fake cache entries so removal can be observed without rendering.
        fs::create_dir_all(&covers_dir).unwrap();
        let kept_mtime = mtime_secs(&fs::metadata(&kept.path).unwrap());
        let removed_mtime = mtime_secs(&fs::metadata(&removed.path).unwrap());
        let kept_cover = covers::cache_path(&covers_dir, &kept.path, kept.size, kept_mtime);
        let removed_cover =
            covers::cache_path(&covers_dir, &removed.path, removed.size, removed_mtime);
        fs::write(&kept_cover, "png").unwrap();
        fs::write(&removed_cover, "png").unwrap();

        let queue = queue_for(&temp, &covers_dir);
        delete_documents(&mut conn, &sink, &queue, &[kept.id], false).unwrap();
        assert!(
            fs::exists(&kept.path).unwrap(),
            "library-only delete leaves the file (FR-09)"
        );
        assert!(
            !fs::exists(&kept_cover).unwrap(),
            "R5.2: cache entry goes with the entry"
        );
        assert!(
            fs::exists(&removed_cover).unwrap(),
            "other entries are untouched"
        );

        delete_documents(&mut conn, &sink, &queue, &[removed.id], true).unwrap();
        assert!(
            !fs::exists(&removed.path).unwrap(),
            "delete-with-file removes it (FR-11)"
        );
        assert!(!fs::exists(&removed_cover).unwrap());

        let counts = get_counts(&conn).unwrap();
        assert_eq!(counts.total, 0);
    }

    fn queue_for(temp: &TempDir, covers_dir: &Path) -> covers::CoverQueue {
        let _ = temp;
        let (queue, _receiver) = covers::test_queue(covers_dir.to_path_buf());
        queue
    }

    fn import_copy_with(
        conn: &mut Connection,
        temp: &TempDir,
        name: &str,
        sink: &dyn EventSink,
        covers_dir: &Path,
    ) -> DocumentDto {
        let path = temp.copy_fixture(name).to_string_lossy().into_owned();
        let (queue, receiver) = covers::test_queue(covers_dir.to_path_buf());
        import_paths(conn, sink, &queue, &[path], &[]).unwrap();
        drop(receiver);
        get_document(conn, covers_dir, conn.last_insert_rowid()).unwrap()
    }

    #[test]
    fn rescan_marks_missing_and_relink_restores_the_entry() {
        // AC-05: move outside → rescan marks missing → relink restores.
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("relink");
        let sink = RecordingSink::default();
        let document = import_copy(&mut conn, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        let old_path = PathBuf::from(&document.path);
        let new_path = temp.path().join("moved-here.pdf");
        fs::rename(&old_path, &new_path).unwrap();

        let result = rescan(&mut conn, &sink, &queue, false).unwrap();
        assert_eq!(result.missing_found, 1);
        assert_eq!(result.restored, 0);
        let marked = get_document(&conn, &queue.dir, document.id).unwrap();
        assert!(marked.missing);
        assert_eq!(get_counts(&conn).unwrap().missing, 1);

        let restored = relink_document(
            &mut conn,
            &sink,
            &queue,
            document.id,
            &new_path.to_string_lossy(),
        )
        .unwrap();
        assert!(!restored.missing);
        assert_eq!(restored.path, new_path.to_string_lossy());
        assert_eq!(get_counts(&conn).unwrap().missing, 0);

        // Typed validation for the Relink dialog (relinking.md).
        let not_pdf = relink_document(
            &mut conn,
            &sink,
            &queue,
            document.id,
            &temp.path().join("x.txt").to_string_lossy(),
        );
        assert!(matches!(not_pdf, Err(AppError::NotPdf { .. })));

        let other = temp.path().join("other.pdf");
        fs::copy(fixture("info-none.pdf"), &other).unwrap();
        import_paths(
            &mut conn,
            &sink,
            &queue,
            &[other.to_string_lossy().into_owned()],
            &[],
        )
        .unwrap();
        let taken = relink_document(
            &mut conn,
            &sink,
            &queue,
            document.id,
            &other.to_string_lossy(),
        );
        assert!(
            matches!(taken, Err(AppError::PathTaken { .. })),
            "a path already in the library is refused"
        );
        drop(receiver);
    }

    #[test]
    fn rescan_restores_entries_when_files_come_back() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("rescan-restore");
        let sink = RecordingSink::default();
        let document = import_copy(&mut conn, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        let original = PathBuf::from(&document.path);
        let hidden = temp.path().join("hidden.pdf");
        fs::rename(&original, &hidden).unwrap();
        assert_eq!(
            rescan(&mut conn, &sink, &queue, true)
                .unwrap()
                .missing_found,
            1
        );
        fs::rename(&hidden, &original).unwrap();
        let result = rescan(&mut conn, &sink, &queue, false).unwrap();
        assert_eq!(result.restored, 1);
        assert_eq!(result.missing_found, 0);
        assert!(
            !get_document(&conn, &queue.dir, document.id)
                .unwrap()
                .missing
        );
        drop(receiver);
    }

    #[test]
    fn title_source_transitions_gate_relink_re_derivation() {
        // metadata-editing.md: `auto` on import, `user` on any manual edit;
        // only `auto` titles follow a relink.
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("title-source");
        let sink = RecordingSink::default();
        let auto = import_copy(&mut conn, &temp, "info-none.pdf", &sink);
        assert_eq!(auto.title, "info-none");
        assert_eq!(auto.title_source, "auto");

        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        // A relink of an untouched `auto` entry re-derives from the filename.
        let renamed = temp.path().join("renamed-file.pdf");
        fs::rename(&auto.path, &renamed).unwrap();
        let relinked = relink_document(
            &mut conn,
            &sink,
            &queue,
            auto.id,
            &renamed.to_string_lossy(),
        )
        .unwrap();
        assert_eq!(relinked.title, "renamed-file");
        assert_eq!(relinked.title_source, "auto");

        // Manual edit flips to `user` and survives a later relink.
        let edited = update_document(
            &mut conn,
            &sink,
            &queue.dir,
            auto.id,
            &DocumentEdit {
                title: "My Kept Title",
                author: "",
                notes: "",
                favorite: false,
                category_ids: &[],
            },
        )
        .unwrap();
        assert_eq!(edited.title_source, "user");
        let moved_again = temp.path().join("moved-again.pdf");
        fs::rename(&renamed, &moved_again).unwrap();
        let relinked = relink_document(
            &mut conn,
            &sink,
            &queue,
            auto.id,
            &moved_again.to_string_lossy(),
        )
        .unwrap();
        assert_eq!(relinked.title, "My Kept Title", "user titles are preserved");
        assert_eq!(relinked.title_source, "user");

        // Saving the same title does NOT flip the flag.
        let same = update_document(
            &mut conn,
            &sink,
            &queue.dir,
            auto.id,
            &DocumentEdit {
                title: "My Kept Title",
                author: "later author",
                notes: "",
                favorite: false,
                category_ids: &[],
            },
        )
        .unwrap();
        assert_eq!(same.author, "later author");
        drop(receiver);
    }

    #[test]
    fn update_rejects_empty_title_at_the_service_boundary() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("empty-title");
        let sink = RecordingSink::default();
        let document = import_copy(&mut conn, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let result = update_document(
            &mut conn,
            &sink,
            &queue.dir,
            document.id,
            &DocumentEdit {
                title: "   ",
                author: "",
                notes: "",
                favorite: false,
                category_ids: &[],
            },
        );
        assert!(matches!(result, Err(AppError::TitleEmpty)));
        drop(receiver);
    }

    #[test]
    fn every_mutation_emits_matching_status_counts() {
        // status-feedback.md: counts match fixture state after each mutation.
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("status");
        let sink = RecordingSink::default();
        let first = import_copy(&mut conn, &temp, "info-none.pdf", &sink);
        let second = import_copy(&mut conn, &temp, "info-title.pdf", &sink);

        set_favorite(&conn, &sink, &temp.path().join("covers"), first.id, true).unwrap();
        update_document(
            &mut conn,
            &sink,
            temp.path(),
            second.id,
            &DocumentEdit {
                title: "edited",
                author: "",
                notes: "",
                favorite: true,
                category_ids: &[],
            },
        )
        .unwrap();
        delete_documents(
            &mut conn,
            &sink,
            &queue_for(&temp, &temp.path().join("covers")),
            &[first.id],
            false,
        )
        .unwrap();

        // One event per mutation, each matching the DB state at that point.
        let expected = [
            CountsDto {
                total: 1,
                favorites: 0,
                missing: 0,
            }, // import 1
            CountsDto {
                total: 2,
                favorites: 0,
                missing: 0,
            }, // import 2
            CountsDto {
                total: 2,
                favorites: 1,
                missing: 0,
            }, // favorite
            CountsDto {
                total: 2,
                favorites: 2,
                missing: 0,
            }, // favorite via edit
            CountsDto {
                total: 1,
                favorites: 1,
                missing: 0,
            }, // delete
        ];
        assert_eq!(sink.statuses(), expected.to_vec());
        assert_eq!(get_counts(&conn).unwrap(), *expected.last().unwrap());
    }

    #[test]
    fn import_progress_events_cover_the_whole_batch() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("progress");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = (1..=2500)
            .map(|i| fixture_doc(i).to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        import_paths(&mut conn, &sink, &queue, &paths, &[]).unwrap();
        drop(receiver);
        let progress = sink.progress();
        assert!(!progress.is_empty());
        let last = progress.last().unwrap();
        assert_eq!(
            (last.kind.as_str(), last.processed, last.total),
            ("import", 2500, 2500)
        );
    }

    #[test]
    fn settings_carry_secondary_sort_and_grid_override() {
        let conn = open_in_memory().unwrap();
        // Defaults with nothing written: no secondary key (FR-13), auto columns (UI-08).
        let fresh = get_settings(&conn).unwrap();
        assert_eq!(
            (fresh.sort_secondary.as_str(), fresh.grid_columns.as_str()),
            ("none", "auto")
        );

        set_setting(&conn, "sort_secondary", "size").unwrap();
        set_setting(&conn, "grid_columns", "4").unwrap();
        let stored = get_settings(&conn).unwrap();
        assert_eq!(
            (stored.sort_secondary.as_str(), stored.grid_columns.as_str()),
            ("size", "4")
        );

        // Out-of-range values are refused, so the clamp the UI offers is the range stored.
        for (key, value) in [
            ("sort_secondary", "bogus"),
            ("grid_columns", "11"),
            ("grid_columns", "1"),
            ("grid_columns", "-3"),
            ("grid_columns", "4.5"),
        ] {
            assert!(
                matches!(set_setting(&conn, key, value), Err(AppError::Validation(_))),
                "{key}={value} should be rejected"
            );
        }

        // A corrupt row (written outside this boundary) falls back to the default.
        db::set_setting(&conn, "sort_secondary", "garbage").unwrap();
        db::set_setting(&conn, "grid_columns", "99").unwrap();
        let repaired = get_settings(&conn).unwrap();
        assert_eq!(
            (
                repaired.sort_secondary.as_str(),
                repaired.grid_columns.as_str()
            ),
            ("none", "auto")
        );
    }

    #[test]
    fn last_filter_grammar_accepts_the_new_form_and_the_legacy_one() {
        let conn = open_in_memory().unwrap();
        for value in [
            "all",
            "favorites",
            "missing",
            "all&cats=7",
            "favorites&cats=1,2",
            "missing&cats=3,4,5",
            "cat:5", // written by v0.0.1: readable, never dropped by the upgrade
        ] {
            set_setting(&conn, "last_filter", value)
                .unwrap_or_else(|error| panic!("{value} must be accepted: {error:?}"));
            assert_eq!(get_settings(&conn).unwrap().last_filter, value);
        }
        for value in [
            "",
            "bogus",
            "favorites&cats=",
            "favorites&cats=1,,2",
            "favorites&cats=x",
            "all&cats=1,2&cats=3",
            "cat:",
            "cat:1,2",
        ] {
            assert!(
                matches!(
                    set_setting(&conn, "last_filter", value),
                    Err(AppError::Validation(_))
                ),
                "{value} should be rejected"
            );
        }
    }

    /// The document row a stored path belongs to. Tests MUST NOT rely on
    /// `last_insert_rowid` once a write touches another rowid table.
    fn document_id_for(conn: &Connection, path: &str) -> i64 {
        conn.query_row(
            "SELECT id FROM documents WHERE path = ?1",
            rusqlite::params![normalize_path(path)],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn import_assigns_every_active_category() {
        let mut conn = open_in_memory().unwrap();
        let temp = TempDir::new("assign-cats");
        let sink = RecordingSink::default();
        let (queue, _receiver) = covers::test_queue(temp.path().join("covers"));
        let alpha = categories_create(&conn, "Alpha").unwrap();
        let beta = categories_create(&conn, "Beta").unwrap();

        // FR-10 as modified (DR-82): one import, every active category.
        let first = fixture_doc(1).to_string_lossy().into_owned();
        import_paths(
            &mut conn,
            &sink,
            &queue,
            std::slice::from_ref(&first),
            &[alpha.id, beta.id],
        )
        .unwrap();
        let filed = get_document(&conn, &queue.dir, document_id_for(&conn, &first)).unwrap();
        assert_eq!(
            filed.categories,
            vec!["Alpha".to_string(), "Beta".to_string()]
        );

        // No active category: nothing is assigned.
        let second = fixture_doc(2).to_string_lossy().into_owned();
        import_paths(&mut conn, &sink, &queue, std::slice::from_ref(&second), &[]).unwrap();
        let unfiled = get_document(&conn, &queue.dir, document_id_for(&conn, &second)).unwrap();
        assert!(unfiled.categories.is_empty());

        // An unknown id in the set is refused before any row is written.
        let third = fixture_doc(3).to_string_lossy().into_owned();
        let rejected = import_paths(&mut conn, &sink, &queue, &[third], &[alpha.id, 999]);
        assert!(matches!(
            rejected,
            Err(AppError::CategoryNotFound { id: 999 })
        ));
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(total, 2, "a rejected import writes nothing");
    }
}
