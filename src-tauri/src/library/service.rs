//! Service operations. Every fallible path returns `AppError` (RULES R3.2);
//! multi-table writes run in transactions (RULES R2.4); every mutation path
//! emits `status_updated` (FR-15 invariant).

use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, params, params_from_iter, types::Value as SqlValue};

use crate::covers::{self, CoverJob, CoverQueue};
use crate::db;
use crate::error::{AppError, is_unique_violation};
use crate::pdf;
use crate::Db;

use super::query::{self, Query};
use super::{
    CountsDto, DocumentDto, EventSink, ImportResult, JobProgress, RescanResult, SETTINGS_KEYS,
    SearchPage, SettingsDto, TagDto, filename_of, is_pdf_path, normalize_path, title_from_filename,
};

/// Chunk bound of the import/rescan pipeline (DR-233 as revised by DR-279):
/// the user's Phase-B report of 2026-11-10 showed that a 25-file step makes
/// the bar jump for any import of 25 files or fewer ("it is gone for one
/// shot"). 5 files keeps the bar visibly incremental for ordinary imports
/// while each write transaction stays a short lock hold; the 10 000-file
/// budget test (NFR-02) bounds the per-transaction overhead.
const CHUNK: usize = 5;

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
    // One pass, no cached counters (FR-15); the Reading count rides the same
    // pass (FR-19 / UI-43, DR-265).
    Ok(conn.query_row(
        "SELECT COUNT(*), COALESCE(SUM(favorite), 0), COALESCE(SUM(missing), 0), COALESCE(SUM(reading), 0) FROM documents",
        [],
        |row| {
            Ok(CountsDto {
                total: row.get(0)?,
                favorites: row.get(1)?,
                missing: row.get(2)?,
                reading: row.get(3)?,
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

/// Resolve a document's file (FR-08): a missing document short-circuits to
/// `MissingFile` and no open is attempted. The filename travels with the
/// path because the reader window's title is the document filename (DR-140);
/// the stored password travels too (FR-20, DR-266) — every render path
/// passes it to the loader and only the row holds it. An empty column is
/// `None`: no password is known.
pub struct OpenTarget {
    pub path: String,
    pub filename: String,
    pub password: Option<String>,
}

pub fn open_target(conn: &Connection, id: i64) -> Result<OpenTarget, AppError> {
    let result = conn.query_row(
        "SELECT path, filename, missing, pdf_password FROM documents WHERE id = ?1",
        params![id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get::<_, String>(3)?,
            ))
        },
    );
    match result {
        Ok((path, _, true, _)) => Err(AppError::MissingFile {
            path,
            document_id: id,
        }),
        Ok((path, filename, false, password)) => Ok(OpenTarget {
            path,
            filename,
            password: (!password.is_empty()).then_some(password),
        }),
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

/// FR-19 (AC-121/AC-102): the ONLY writer of the `reading` flag — opening a
/// document never touches it (the manual-only rule, OQ-48 closed as B).
/// Single ids and batches go through the same path; every updated row is
/// returned so the store updates the selection in place (DR-266), and the
/// mutation emits the status counts like every other one (FR-15).
pub fn set_reading(
    conn: &Connection,
    sink: &dyn EventSink,
    covers_dir: &Path,
    ids: &[i64],
    value: bool,
) -> Result<Vec<DocumentDto>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let changed = conn.execute(
        &format!("UPDATE documents SET reading = ?1 WHERE id IN ({placeholders})"),
        params_from_iter(
            std::iter::once(SqlValue::Integer(value as i64))
                .chain(ids.iter().map(|id| SqlValue::Integer(*id))),
        ),
    )?;
    if changed == 0 {
        let mut stmt = conn.prepare(&format!(
            "SELECT COUNT(*) FROM documents WHERE id IN ({placeholders})"
        ))?;
        let present: i64 = stmt.query_row(params_from_iter(ids.iter()), |row| row.get(0))?;
        if present == 0 {
            return Err(AppError::DocumentNotFound { id: ids[0] });
        }
    }
    emit_status(conn, sink)?;
    let mut docs = Vec::with_capacity(ids.len());
    for id in ids {
        docs.push(get_document(conn, covers_dir, *id)?);
    }
    Ok(docs)
}

/// The editable fields of one document, grouped so the service signature
/// stays small (RULES R7).
pub struct DocumentEdit<'a> {
    pub title: &'a str,
    pub author: &'a str,
    pub notes: &'a str,
    pub favorite: bool,
    pub tag_ids: &'a [i64],
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
    validate_tags(conn, edit.tag_ids)?;

    let tx = conn.transaction()?;
    // title_source flips to 'user' only when the title value itself changes;
    // that flag gates relink title re-derivation (metadata-editing.md).
    tx.execute(
        "UPDATE documents SET title = ?2, author = ?3, notes = ?4, favorite = ?5,
         title_source = CASE WHEN ?2 = title THEN title_source ELSE 'user' END
         WHERE id = ?1",
        params![id, title, edit.author, edit.notes, edit.favorite as i64],
    )?;
    replace_document_tags(&tx, id, edit.tag_ids)?;
    tx.commit()?;
    emit_status(conn, sink)?;
    get_document(conn, covers_dir, id)
}

pub fn set_document_tags(
    conn: &mut Connection,
    sink: &dyn EventSink,
    document_id: i64,
    tag_ids: &[i64],
) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE id = ?1",
        params![document_id],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::DocumentNotFound { id: document_id });
    }
    validate_tags(conn, tag_ids)?;
    let tx = conn.transaction()?;
    replace_document_tags(&tx, document_id, tag_ids)?;
    tx.commit()?;
    emit_status(conn, sink)
}

fn replace_document_tags(
    tx: &rusqlite::Transaction<'_>,
    document_id: i64,
    tag_ids: &[i64],
) -> Result<(), AppError> {
    tx.execute(
        "DELETE FROM document_tags WHERE document_id = ?1",
        params![document_id],
    )?;
    for tag_id in tag_ids {
        tx.execute(
            "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            params![document_id, tag_id],
        )?;
    }
    Ok(())
}

fn validate_tags(conn: &Connection, tag_ids: &[i64]) -> Result<(), AppError> {
    for tag_id in tag_ids {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tags WHERE id = ?1",
            params![tag_id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::TagNotFound { id: *tag_id });
        }
    }
    Ok(())
}

// ------------------------------------------------------------------ import

/// Import pipeline (importing-pdfs.md): filter to `.pdf`, stat, insert in
/// short per-chunk transactions with duplicate skip (FR-11), metadata
/// extraction with filename fallback (FR-05), tag auto-assignment
/// (FR-10), cover jobs enqueued after each commit — the command returns as
/// soon as the rows are committed. The lock discipline is the pipeline's own
/// (DR-233): extraction runs with no connection held, the connection is
/// acquired only for the short transactions, and the progress events make
/// the import visible from start to completion for imports of any size.
pub fn import_paths(
    db: &Db,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    paths: &[String],
    tag_ids: &[i64],
) -> Result<ImportResult, AppError> {
    // FR-10 as modified (DR-82): every active tag receives the import; an
    // empty set assigns nothing. All ids are validated before any write
    // (UI-42 vocabulary per OQ-50 answer B).
    db.with_raw(|conn| validate_tags(&*conn, tag_ids))?;

    // Plan: filesystem only — no connection is held here.
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
    // The bar appears before any per-file work (DR-233): an import of any
    // size, a single file included, is visible from its first moment.
    if total > 0 {
        sink.progress(&JobProgress {
            kind: "import".into(),
            processed: 0,
            total,
        });
    }

    let mut imported = 0i64;
    let mut processed = 0i64;
    for chunk in candidates.chunks(CHUNK) {
        // Extraction is the slow stage (M3): it runs with no connection
        // held, so every other command keeps answering while an import does.
        let prepared: Vec<(String, i64, i64, crate::pdfmeta::Extracted)> = chunk
            .iter()
            .map(|(path, size, mtime)| {
                (path.clone(), *size, *mtime, crate::pdfmeta::extract(path))
            })
            .collect();
        let (added, jobs, duplicates) = db.with_raw(|conn| import_chunk(conn, &prepared, tag_ids))?;
        skipped.extend(duplicates);
        for job in jobs {
            covers_queue.enqueue(job);
        }
        imported += added;
        processed += chunk.len() as i64;
        sink.progress(&JobProgress {
            kind: "import".into(),
            processed,
            total,
        });
    }

    db.with_raw(|conn| emit_status(conn, sink))?;
    Ok(ImportResult { imported, skipped })
}

/// One candidate chunk inside one short transaction (DR-233). The insertion
/// semantics are the released ones unchanged: `INSERT OR IGNORE` carries the
/// duplicate skip (FR-11) exactly as the released tests assert it.
fn import_chunk(
    conn: &mut Connection,
    prepared: &[(String, i64, i64, crate::pdfmeta::Extracted)],
    tag_ids: &[i64],
) -> Result<(i64, Vec<CoverJob>, Vec<String>), AppError> {
    let tx = conn.transaction()?;
    let mut imported = 0i64;
    let mut jobs: Vec<CoverJob> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let added_at = now_secs();
    for (path, size, mtime, extracted) in prepared {
        let filename = filename_of(path);
        let title = extracted
            .title
            .clone()
            .unwrap_or_else(|| title_from_filename(&filename));
        let author = extracted.author.clone().unwrap_or_default();
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
        for tag_id in tag_ids {
            tx.execute(
                "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
                params![document_id, tag_id],
            )?;
        }
        imported += 1;
        // A freshly imported document has no stored password (FR-20): a
        // protected file gets the glyph cover until an unlock stores one
        // (AC-106).
        jobs.push(CoverJob {
            doc_id: document_id,
            path: path.clone(),
            size: *size,
            mtime: *mtime,
            password: None,
        });
    }
    tx.commit()?;
    Ok((imported, jobs, skipped))
}

/// One-time folder import: recursive walk for `*.pdf` (DR-50a) — the walk
/// is filesystem-only and happens before any connection is acquired
/// (DR-233) — then the same pipeline.
pub fn import_folder(
    db: &Db,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    dir: &str,
    tag_ids: &[i64],
) -> Result<ImportResult, AppError> {
    let mut paths: Vec<String> = Vec::new();
    collect_pdfs(Path::new(dir), &mut paths);
    import_paths(db, sink, covers_queue, &paths, tag_ids)
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
/// it finds something — the status counts still update). The lock discipline
/// is the import pipeline's (DR-233): the rows are read in one short
/// transaction, the filesystem answers are collected with no connection
/// held, and the updates run in short per-chunk transactions.
pub fn rescan(
    db: &Db,
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
        password: Option<String>,
    }
    let entries: Vec<Entry> = db.with_raw(|conn| {
        let mut entries: Vec<Entry> = Vec::new();
        let mut stmt = conn.prepare(
            "SELECT id, path, size, mtime, missing, pdf_password FROM documents ORDER BY id",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Entry {
                id: row.get(0)?,
                path: row.get(1)?,
                size: row.get(2)?,
                mtime: row.get(3)?,
                missing: row.get::<_, i64>(4)? != 0,
                password: {
                    let value = row.get::<_, String>(5)?;
                    (!value.is_empty()).then_some(value)
                },
            })
        })?;
        for entry in rows {
            entries.push(entry?);
        }
        Ok(entries)
    })?;

    let total = entries.len() as i64;
    let mut result = RescanResult {
        missing_found: 0,
        restored: 0,
    };
    let mut changed = false;
    let mut processed = 0i64;
    if !quiet && total > 0 {
        sink.progress(&JobProgress {
            kind: "rescan".into(),
            processed: 0,
            total,
        });
    }

    for chunk in entries.chunks(CHUNK) {
        // Filesystem answers first, with no connection held (DR-233).
        let checked: Vec<(&Entry, Option<fs::Metadata>)> = chunk
            .iter()
            .map(|entry| (entry, fs::metadata(&entry.path).ok()))
            .collect();
        let (partial, jobs) = db.with_raw(|conn| {
            let tx = conn.transaction()?;
            let mut missing_found = 0i64;
            let mut restored = 0i64;
            let mut chunk_changed = false;
            let mut jobs: Vec<CoverJob> = Vec::new();
            for (entry, metadata) in &checked {
                match metadata {
                    None => {
                        if !entry.missing {
                            tx.execute(
                                "UPDATE documents SET missing = 1 WHERE id = ?1",
                                params![entry.id],
                            )?;
                            missing_found += 1;
                            chunk_changed = true;
                        }
                    }
                    Some(metadata) => {
                        let size = metadata.len() as i64;
                        let mtime = mtime_secs(metadata);
                        let changed_row = if entry.missing {
                            tx.execute(
                                "UPDATE documents SET missing = 0, size = ?2, mtime = ?3 WHERE id = ?1",
                                params![entry.id, size, mtime],
                            )?;
                            restored += 1;
                            true
                        } else if size != entry.size || mtime != entry.mtime {
                            tx.execute(
                                "UPDATE documents SET size = ?2, mtime = ?3 WHERE id = ?1",
                                params![entry.id, size, mtime],
                            )?;
                            true
                        } else {
                            false
                        };
                        if changed_row {
                            chunk_changed = true;
                            jobs.push(CoverJob {
                                doc_id: entry.id,
                                path: entry.path.clone(),
                                size,
                                mtime,
                                password: entry.password.clone(),
                            });
                        }
                    }
                }
            }
            tx.commit()?;
            Ok(((missing_found, restored, chunk_changed), jobs))
        })?;
        result.missing_found += partial.0;
        result.restored += partial.1;
        changed |= partial.2;
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
        db.with_raw(|conn| emit_status(conn, sink))?;
    }
    Ok(result)
}

// ------------------------------------------------------------------ delete

/// FR-09 / DR-50b: for the with-file variant, `remove_file` runs BEFORE the
/// row transaction so a failure leaves every row intact and the operation is
/// retriable (a file already gone counts as deleted). Cover-cache cleanup
/// happens after the commit; no document can leave an orphan cover. The
/// reader page cache is session state of the document too: it goes with the
/// row (AC-62, SPEC-v0.0.6 §3.2), beside the cover-cache cleanup.
pub fn delete_documents(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    ids: &[i64],
    delete_files: bool,
    reader_dir: &Path,
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

    for id in ids {
        pdf::remove_document_cache(reader_dir, *id);
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
        password: stored_password(conn, id)?,
    });
    emit_status(conn, sink)?;
    get_document(conn, &covers_queue.dir, id)
}

// ------------------------------------------------------------- password (FR-20)

/// The row's stored password; an empty column is `None` (no password known).
fn stored_password(conn: &Connection, id: i64) -> Result<Option<String>, AppError> {
    let value = conn.query_row(
        "SELECT pdf_password FROM documents WHERE id = ?1",
        params![id],
        |row| row.get::<_, String>(0),
    )?;
    Ok((!value.is_empty()).then_some(value))
}

/// FR-20 / DR-266: the ONLY writer of `pdf_password`. The reader calls this
/// on every unlock attempt — session values included — and clears the column
/// at window close when *Remember this password* was left unchecked (the
/// clear is the same call with an empty value, R5.3: a failed clear never
/// fails the close). An empty value is *Remove password*. Every non-empty
/// store re-enqueues the cover with the new password so a real render can
/// replace the glyph (AC-106); clearing leaves the existing cover in place —
/// the cache key never mentions the password.
pub fn set_password(
    conn: &Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    id: i64,
    password: &str,
) -> Result<(), AppError> {
    let changed = conn.execute(
        "UPDATE documents SET pdf_password = ?2 WHERE id = ?1",
        params![id, password],
    )?;
    if changed == 0 {
        return Err(AppError::DocumentNotFound { id });
    }
    if !password.is_empty() {
        let (path, size, mtime) = conn.query_row(
            "SELECT path, size, mtime FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
        )?;
        covers_queue.enqueue(CoverJob {
            doc_id: id,
            path,
            size,
            mtime,
            password: Some(password.to_string()),
        });
    }
    emit_status(conn, sink)
}

// ------------------------------------------------------------- rename (FR-21)

/// FR-21 (AC-107…AC-110): rename the file on disk in place and move the
/// record with it. The document keeps its identity — tags, favorite state,
/// notes, Reading membership and the stored password belong to the row, not
/// the name. Validation per DR-266(d): the name is used exactly as entered
/// (leading/trailing whitespace is a rejection, not a trim); renaming to the
/// same name is a no-op success. A failed DB write renames the file back —
/// record and disk stay consistent (spec §3.4 step 4).
pub fn rename_document(
    conn: &mut Connection,
    sink: &dyn EventSink,
    covers_queue: &CoverQueue,
    id: i64,
    new_name: &str,
) -> Result<DocumentDto, AppError> {
    let row = conn.query_row(
        "SELECT path, filename, title_source, size, mtime, pdf_password FROM documents WHERE id = ?1",
        params![id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
            ))
        },
    );
    let (path, old_filename, title_source, size, mtime, password) = match row {
        Ok(values) => values,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(AppError::DocumentNotFound { id })
        }
        Err(error) => return Err(error.into()),
    };
    // The UI offers *Rename…* only when the file exists; the service
    // enforces the same rule with a fresh on-disk check (the stored
    // `missing` flag is rescan state and can be stale) and the same typed
    // error the open path uses.
    if fs::metadata(&path).is_err() {
        return Err(AppError::MissingFile {
            path,
            document_id: id,
        });
    }

    // §3.4 step 1 (DR-266(d)): reserved characters `<>:"/\|?*`, control
    // characters, path separators, leading/trailing whitespace, trailing dot.
    let rejected = new_name.is_empty()
        || new_name != new_name.trim()
        || new_name.contains('/')
        || new_name.contains('\\')
        || new_name.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        || new_name.chars().any(|c| c < ' ')
        || new_name.ends_with('.')
        || new_name.ends_with(' ');
    if rejected {
        return Err(AppError::InvalidName(new_name.to_string()));
    }

    // Same name: no-op success, the row returned unchanged (DR-266(d)).
    if new_name == old_filename {
        return get_document(conn, &covers_queue.dir, id);
    }

    let parent = Path::new(&path)
        .parent()
        .ok_or_else(|| AppError::InvalidName(new_name.to_string()))?;
    let new_path = normalize_path(&parent.join(new_name).to_string_lossy());

    // §3.4 step 2: collision with another library row, or an existing file
    // at the target. On case-insensitive filesystems a case-only rename
    // resolves to the file itself — the documented accepted `name_conflict`.
    let taken_by_row: i64 = conn.query_row(
        "SELECT COUNT(*) FROM documents WHERE path = ?1 AND id != ?2",
        params![new_path, id],
        |row| row.get(0),
    )?;
    if taken_by_row > 0 || fs::metadata(&new_path).is_ok() {
        return Err(AppError::NameConflict { path: new_path });
    }

    // §3.4 step 3.
    fs::rename(&path, &new_path).map_err(|error| AppError::Io {
        path: path.clone(),
        message: error.to_string(),
    })?;

    // §3.4 step 4: the record follows; `auto` titles re-derive from the new
    // filename, `user` titles are untouched (AC-109 — the same title_source
    // gate the released relink uses). On failure: compensating rename back.
    let update = conn.transaction().and_then(|tx| {
        let statement = if title_source == "auto" {
            tx.execute(
                "UPDATE documents SET path = ?2, filename = ?3, title = ?4 WHERE id = ?1",
                params![id, new_path, new_name, title_from_filename(new_name)],
            )
        } else {
            tx.execute(
                "UPDATE documents SET path = ?2, filename = ?3 WHERE id = ?1",
                params![id, new_path, new_name],
            )
        }?;
        tx.commit()?;
        Ok(statement)
    });
    if let Err(error) = update {
        let _ = fs::rename(&new_path, &path); // compensating rename (spec §3.4)
        return Err(error.into());
    }

    // §3.4 step 5: the cover is enqueued for the new identity; the stale
    // cache entry is removed by the existing orphan sweep (AC-110). The
    // password travels with the row.
    covers_queue.enqueue(CoverJob {
        doc_id: id,
        path: new_path,
        size,
        mtime,
        password: (!password.is_empty()).then_some(password),
    });
    emit_status(conn, sink)?;
    get_document(conn, &covers_queue.dir, id)
}

// --------------------------------------------------------------------- tags

pub fn tags_list(conn: &Connection) -> Result<Vec<TagDto>, AppError> {
    // Live counts computed in SQL, never cached client-side (tags.md, the
    // released categories.md mechanism — UI-42 renamed it, not changed it).
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, COUNT(dt.document_id)
         FROM tags t
         LEFT JOIN document_tags dt ON dt.tag_id = t.id
         GROUP BY t.id, t.name
         ORDER BY t.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TagDto {
            id: row.get(0)?,
            name: row.get(1)?,
            count: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn tags_create(conn: &Connection, name: &str) -> Result<TagDto, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Tag name cannot be empty".into()));
    }
    let inserted = conn.execute("INSERT INTO tags (name) VALUES (?1)", params![name]);
    let id = match inserted {
        Ok(_) => conn.last_insert_rowid(),
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::TagNameDuplicate { name: name.into() });
        }
        Err(error) => return Err(error.into()),
    };
    Ok(TagDto {
        id,
        name: name.into(),
        count: 0,
    })
}

pub fn tags_rename(conn: &Connection, id: i64, name: &str) -> Result<TagDto, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Tag name cannot be empty".into()));
    }
    let updated = conn.execute("UPDATE tags SET name = ?2 WHERE id = ?1", params![id, name]);
    match updated {
        Ok(0) => return Err(AppError::TagNotFound { id }),
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(AppError::TagNameDuplicate { name: name.into() });
        }
        Err(error) => return Err(error.into()),
    }
    // Membership is untouched (FR-02 invariant).
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM document_tags WHERE tag_id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(TagDto {
        id,
        name: name.into(),
        count,
    })
}

pub fn tags_delete(conn: &Connection, id: i64) -> Result<(), AppError> {
    // Join rows cascade; documents are never touched (FR-02).
    let deleted = conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::TagNotFound { id });
    }
    Ok(())
}

/// FR-07: add and/or remove tags over a multi-selection in ONE transaction /
/// one command call.
pub fn bulk_tags(
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
    validate_tags(conn, add)?;
    validate_tags(conn, remove)?;

    let tx = conn.transaction()?;
    for document_id in document_ids {
        for tag_id in add {
            tx.execute(
                "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
                params![document_id, tag_id],
            )?;
        }
        for tag_id in remove {
            tx.execute(
                "DELETE FROM document_tags WHERE document_id = ?1 AND tag_id = ?2",
                params![document_id, tag_id],
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
        theme: db::get_setting(conn, "theme")?
            .filter(|v| is_valid_theme(v))
            .unwrap_or_else(|| "system".into()),
        last_filter: db::get_setting(conn, "last_filter")?
            .filter(|v| is_valid_filter(v))
            .unwrap_or_else(|| "all".into()),
    })
}

/// `last_filter` grammar (spec §3.2, extended by FR-19 and UI-42): a mode,
/// optionally followed by `&tags=<id>(,<id>)*`. The v0.0.1 form `cat:<id>`
/// and the v0.0.7 token `cats=` stay valid input so an existing saved
/// filter survives the upgrade instead of being dropped; new values are
/// written as `&tags=` (settings.svelte.ts, AC-113).
fn is_valid_filter(value: &str) -> bool {
    if let Some(id) = value.strip_prefix("cat:") {
        // v0.0.1 wrote exactly one id in this position; anything else is a
        // corrupt row, not a tag list.
        return !id.is_empty()
            && id.chars().all(|c| c.is_ascii_digit())
            && id.parse::<i64>().is_ok();
    }
    let (mode, tags) = match value.split_once("&tags=").or(value.split_once("&cats=")) {
        Some((mode, ids)) => (mode, Some(ids)),
        None => (value, None),
    };
    matches!(
        mode,
        "all" | "favorites" | "missing" | "reading"
    ) && tags.is_none_or(is_valid_id_list)
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

/// Color ramp override (UI-17): `system` follows the OS, `light` and `dark`
/// override it. Anything else is a corrupt row, never a theme.
fn is_valid_theme(value: &str) -> bool {
    matches!(value, "system" | "light" | "dark")
}

pub fn set_setting(
    conn: &Connection,
    sink: &dyn EventSink,
    key: &str,
    value: &str,
) -> Result<(), AppError> {
    if !SETTINGS_KEYS.contains(&key) {
        return Err(AppError::Validation(format!("Unknown setting: {key}")));
    }
    let valid = match key {
        "view" => value == "list" || value == "grid",
        "sort" => matches!(value, "title" | "date_added" | "size"),
        "dir" => value == "asc" || value == "desc",
        "sort_secondary" => matches!(value, "none" | "title" | "date_added" | "size"),
        "grid_columns" => is_valid_grid_columns(value),
        "theme" => is_valid_theme(value),
        "last_filter" => is_valid_filter(value),
        _ => false,
    };
    if !valid {
        return Err(AppError::Validation(format!("Invalid value for {key}")));
    }
    db::set_setting(conn, key, value)?;
    // DR-230: the save is the single choke point — every window learns the
    // new value from this event, only after the value is durably stored.
    sink.settings_changed(key, value);
    Ok(())
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
            tag_ids: Vec::new(),
            favorites_only: false,
            missing_only: false,
            reading_only: false,
            sort: SortKey::Title,
            sort_dir: SortDir::Asc,
            sort_secondary: None,
        }
    }

    /// Wrap a prepared connection in the shared library type so pipeline
    /// tests run through the real short-transaction path (DR-233).
    fn test_db(conn: Connection) -> Db {
        Db::for_tests(conn)
    }

    /// Run a non-pipeline call or assertion against the test library.
    fn on<T>(db: &Db, f: impl FnOnce(&mut Connection) -> T) -> T {
        db.with_raw(|conn| Ok(f(conn))).unwrap()
    }

    /// Import a copied fixture so mutation tests never touch the shared tree.
    fn import_copy(db: &Db, temp: &TempDir, name: &str, sink: &dyn EventSink) -> DocumentDto {
        let path = temp.copy_fixture(name).to_string_lossy().into_owned();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let result =
            import_paths(db, sink, &queue, std::slice::from_ref(&path), &[]).expect("import");
        assert_eq!(result.imported, 1, "fixture must import: {path}");
        let id = on(db, |conn| conn.last_insert_rowid());
        drop(receiver);
        on(db, |conn| get_document(conn, &queue.dir, id).expect("imported document"))
    }

    #[test]
    fn import_extracts_info_titles_and_falls_back_to_filename() {
        let db = test_db(open_in_memory().unwrap());
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
        let result = import_paths(&db, &sink, &queue, &paths, &[]).unwrap();
        drop(receiver);

        assert_eq!(result.imported, 4);
        assert_eq!(
            result.skipped,
            vec![paths[4].clone()],
            "non-PDF is skipped with notice"
        );

        let rows = on(&db, |conn| {
            search_document(conn, &queue.dir, &list_query(""), 0, 100)
                .unwrap()
                .rows
        });
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
    fn import_skips_duplicates_and_auto_assigns_the_selected_tag() {
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("import-dup");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let path = temp
            .copy_fixture("info-title.pdf")
            .to_string_lossy()
            .into_owned();

        let tag = on(&db, |conn| tags_create(conn, "Reading")).unwrap();
        let first = import_paths(
            &db,
            &sink,
            &queue,
            std::slice::from_ref(&path),
            &[tag.id],
        )
        .unwrap();
        assert_eq!(first.imported, 1);

        let second = import_paths(
            &db,
            &sink,
            &queue,
            std::slice::from_ref(&path),
            &[tag.id],
        )
        .unwrap();
        assert_eq!(second.imported, 0);
        assert_eq!(
            second.skipped,
            vec![path.clone()],
            "duplicate path is skipped with notice"
        );

        // FR-01 (DR-13a): import auto-assigns the currently selected tag.
        let document = on(&db, |conn| get_document(conn, &queue.dir, 1)).unwrap();
        assert_eq!(document.tags, vec!["Reading".to_string()]);

        let unknown = import_paths(
            &db,
            &sink,
            &queue,
            &["z:/nope.pdf".to_string()],
            &[999],
        );
        assert!(matches!(
            unknown,
            Err(AppError::TagNotFound { id: 999 })
        ));
        drop(receiver);
    }

    #[test]
    fn import_of_ten_thousand_fixtures_stays_within_budget() {
        // AC-01 + NFR-02 (DR-42): the batch completes in under 30 s.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("import-10k");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = (1..=10_000)
            .map(|i| fixture_doc(i).to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        let started = Instant::now();
        let result = import_paths(&db, &sink, &queue, &paths, &[]).unwrap();
        let elapsed = started.elapsed();

        assert_eq!(result.imported, 10_000);
        assert_eq!(result.skipped, Vec::<String>::new());
        let counts = on(&db, |conn| get_counts(conn)).unwrap();
        assert_eq!(counts.total, 10_000);
        // Titles come from the fixtures' Info dictionaries end to end.
        let page = on(&db, |conn| {
            search_document(conn, &queue.dir, &list_query("Fixture Doc doc00042"), 0, 10)
        })
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
    fn tags_membership_bulk_edit_and_delete_cascade() {
        // AC-03: many-to-many, bulk add/remove in one call, delete cascades
        // the join rows only (FR-02).
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("tags");
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
        let result = import_paths(&db, &sink, &queue, &paths, &[]).unwrap();
        assert_eq!(result.imported, 2);

        let a = on(&db, |conn| tags_create(conn, "A")).unwrap();
        let b = on(&db, |conn| tags_create(conn, "B")).unwrap();
        let c = on(&db, |conn| tags_create(conn, "C")).unwrap();
        assert!(
            matches!(
                on(&db, |conn| tags_create(conn, "a")),
                Err(AppError::TagNameDuplicate { .. })
            ),
            "names are unique case-insensitively"
        );

        on(&db, |conn| set_document_tags(conn, &sink, 1, &[a.id, b.id])).unwrap();
        let document = on(&db, |conn| get_document(conn, &queue.dir, 1)).unwrap();
        assert_eq!(document.tags, vec!["A".to_string(), "B".to_string()]);

        // One call, multiple documents: add C to both, remove A from doc 1.
        on(&db, |conn| bulk_tags(conn, &sink, &[1, 2], &[c.id], &[a.id])).unwrap();
        let listed = on(&db, |conn| tags_list(conn)).unwrap();
        let counts = |name: &str| {
            listed
                .iter()
                .find(|tag| tag.name == name)
                .map(|tag| tag.count)
        };
        assert_eq!(counts("A"), Some(0));
        assert_eq!(counts("B"), Some(1));
        assert_eq!(counts("C"), Some(2));

        // Deleting a tag never deletes documents (FR-02).
        on(&db, |conn| tags_delete(conn, b.id)).unwrap();
        let document = on(&db, |conn| get_document(conn, &queue.dir, 1)).unwrap();
        assert_eq!(document.tags, vec!["C".to_string()]);
        let counts = on(&db, |conn| get_counts(conn)).unwrap();
        assert_eq!(counts.total, 2);
    }

    #[test]
    fn reading_membership_single_and_bulk_with_view_and_counts() {
        // AC-121/AC-103 (FR-19): the toggle works per document and across a
        // selection, the Reading view lists exactly the members, and the
        // status counts follow every change.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("reading");
        let sink = RecordingSink::default();
        let (queue, _receiver) = covers::test_queue(temp.path().join("covers"));
        let first = import_copy(&db, &temp, "info-none.pdf", &sink);
        let second = import_copy(&db, &temp, "info-title.pdf", &sink);

        // Single toggle: resolves to the updated rows so the store updates in
        // place (DR-266 e).
        let updated = on(&db, |conn| {
            set_reading(conn, &sink, &queue.dir, &[first.id], true)
        })
        .unwrap();
        assert_eq!(updated.len(), 1);
        assert!(updated[0].reading);

        // Bulk toggle across a selection (AC-121).
        let bulk = on(&db, |conn| {
            set_reading(conn, &sink, &queue.dir, &[first.id, second.id], true)
        })
        .unwrap();
        assert_eq!(bulk.len(), 2);
        assert!(bulk.iter().all(|document| document.reading));

        // The view lists exactly the members (AC-102).
        let mut query = list_query("");
        query.reading_only = true;
        let page = on(&db, |conn| search_document(conn, &queue.dir, &query, 0, 100)).unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.rows.len(), 2);
        assert!(page.rows.iter().all(|document| document.reading));

        // Membership is reversible; the stored flag rides into every read path.
        on(&db, |conn| set_reading(conn, &sink, &queue.dir, &[second.id], false)).unwrap();
        let page = on(&db, |conn| search_document(conn, &queue.dir, &query, 0, 100)).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.rows[0].id, first.id);
        let document = on(&db, |conn| get_document(conn, &queue.dir, first.id)).unwrap();
        assert!(document.reading);

        // The status-bar count is live (AC-103's data source).
        let counts = on(&db, |conn| get_counts(conn)).unwrap();
        assert_eq!((counts.total, counts.reading), (2, 1));

        // Unknown ids are refused like every other mutation.
        assert!(matches!(
            on(&db, |conn| set_reading(conn, &sink, &queue.dir, &[999], true)),
            Err(AppError::DocumentNotFound { id: 999 })
        ));
    }

    #[test]
    fn reading_view_combines_with_search_favorites_tags_and_missing() {
        // AC-103: the Reading predicate composes with every other filter
        // under the same AND rule (spec §3.2).
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("reading-combine");
        let sink = RecordingSink::default();
        let (queue, _receiver) = covers::test_queue(temp.path().join("covers"));
        let plain = import_copy(&db, &temp, "info-none.pdf", &sink);
        let titled = import_copy(&db, &temp, "info-title.pdf", &sink);

        let tag = on(&db, |conn| tags_create(conn, "Novels")).unwrap();
        on(&db, |conn| set_document_tags(conn, &sink, plain.id, &[tag.id])).unwrap();
        on(&db, |conn| {
            set_favorite(conn, &sink, &queue.dir, titled.id, true)
        })
        .unwrap();
        on(&db, |conn| {
            set_reading(conn, &sink, &queue.dir, &[plain.id, titled.id], true)
        })
        .unwrap();

        let ids_of = |query: &Query| -> Vec<i64> {
            on(&db, |conn| search_document(conn, &queue.dir, query, 0, 100))
                .unwrap()
                .rows
                .iter()
                .map(|document| document.id)
                .collect()
        };
        let mut query = list_query("");
        query.reading_only = true;

        // Reading + tag: only the document that carries both.
        query.tag_ids = vec![tag.id];
        assert_eq!(ids_of(&query), vec![plain.id]);
        query.tag_ids = Vec::new();

        // Reading + favorites: only the starred member.
        query.favorites_only = true;
        assert_eq!(ids_of(&query), vec![titled.id]);
        query.favorites_only = false;

        // Reading + query: the search narrows the members (UI-01 unchanged).
        query.q = "Real Info".to_string();
        assert_eq!(ids_of(&query), vec![titled.id]);
        query.q = String::new();

        // Reading + missing: both files are present, so the view is empty.
        query.missing_only = true;
        assert_eq!(ids_of(&query), Vec::<i64>::new());
        query.missing_only = false;

        // Reading off: the full library again (the view is the filter, not a mode).
        query.reading_only = false;
        let all = ids_of(&query);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn opening_relinking_and_rescan_never_change_reading_membership() {
        // AC-102 (FR-19, the manual-only rule, OQ-48 closed as B): the
        // `reading` flag is written only by the Reading action. The paths an
        // opened or repaired document takes — rescan, relink, an edited
        // record — leave membership exactly as it was; opening itself writes
        // nothing (no service function is involved in an open).
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("reading-untouched");
        let sink = RecordingSink::default();
        let document = import_copy(&db, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        on(&db, |conn| {
            set_reading(conn, &sink, &queue.dir, &[document.id], true)
        })
        .unwrap();

        // Rescan marks a moved file missing — the member stays a member.
        let old_path = PathBuf::from(&document.path);
        let new_path = temp.path().join("moved-later.pdf");
        fs::rename(&old_path, &new_path).unwrap();
        rescan(&db, &sink, &queue, false).unwrap();
        assert!(on(&db, |conn| get_document(conn, &queue.dir, document.id))
            .unwrap()
            .reading);

        // Relink restores the entry — membership survives the path change,
        // and the view still lists exactly this member.
        on(&db, |conn| {
            relink_document(conn, &sink, &queue, document.id, &new_path.to_string_lossy())
        })
        .unwrap();
        assert!(on(&db, |conn| get_document(conn, &queue.dir, document.id))
            .unwrap()
            .reading);
        let mut query = list_query("");
        query.reading_only = true;
        let ids: Vec<i64> = on(&db, |conn| search_document(conn, &queue.dir, &query, 0, 100))
            .unwrap()
            .rows
            .iter()
            .map(|row| row.id)
            .collect();
        assert_eq!(ids, vec![document.id]);

        // An edited record (the Details save) changes content, not membership.
        let edit = DocumentEdit {
            title: "Renamed By Hand",
            author: "",
            notes: "",
            favorite: false,
            tag_ids: &[],
        };
        on(&db, |conn| update_document(conn, &sink, &queue.dir, document.id, &edit)).unwrap();
        assert!(on(&db, |conn| get_document(conn, &queue.dir, document.id))
            .unwrap()
            .reading);

        // The badge count the Reading view carries still reports the member.
        assert_eq!(on(&db, |conn| get_counts(conn)).unwrap().reading, 1);
        drop(receiver);
    }

    #[test]
    fn stored_password_round_trips_and_requeues_the_cover() {
        // AC-105 (FR-20, DR-266 a): store, overwrite, clear; every non-empty
        // store re-enqueues the cover with the new password; clearing is
        // *Remove password* and re-renders nothing.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("password");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");
        let (queue, receiver) = covers::test_queue(covers_dir.clone());
        let document = import_copy_with(&db, &temp, "protected.pdf", &sink, &covers_dir);

        // Store: the row is the only channel (DR-266 a), and the cover job
        // carries the password (AC-106's render half lives in the covers tests).
        on(&db, |conn| set_password(conn, &sink, &queue, document.id, "sesame")).unwrap();
        let job = receiver.try_recv().expect("a store re-enqueues the cover");
        assert_eq!(job.doc_id, document.id);
        assert_eq!(job.password.as_deref(), Some("sesame"));

        // The stored value is what every open path presents (FR-20).
        let target = on(&db, |conn| open_target(conn, document.id)).unwrap();
        assert_eq!(target.password.as_deref(), Some("sesame"));

        // Overwriting is the same call; a session unlock updates the row too.
        on(&db, |conn| set_password(conn, &sink, &queue, document.id, "session-value")).unwrap();
        let job = receiver.try_recv().expect("every non-empty store re-enqueues");
        assert_eq!(job.password.as_deref(), Some("session-value"));

        // Clearing empties the column and leaves the existing cover in place.
        on(&db, |conn| set_password(conn, &sink, &queue, document.id, "")).unwrap();
        assert!(
            receiver.try_recv().is_err(),
            "clearing must not re-render the cover"
        );
        let target = on(&db, |conn| open_target(conn, document.id)).unwrap();
        assert_eq!(target.password, None);

        // The password is never a DTO field (FR-20): the row reads back with
        // its other fields unchanged.
        let listed = on(&db, |conn| get_document(conn, &covers_dir, document.id)).unwrap();
        assert_eq!(listed.id, document.id);
        assert_eq!(listed.filename, document.filename);

        // Unknown documents are refused like every other mutation.
        assert!(matches!(
            on(&db, |conn| set_password(conn, &sink, &queue, 999, "x")),
            Err(AppError::DocumentNotFound { id: 999 })
        ));
    }

    #[test]
    fn rename_moves_the_file_and_the_record_and_preserves_identity() {
        // AC-107/AC-109 (FR-21): file and record move together; tags,
        // favorite, notes, Reading membership and the stored password belong
        // to the row, not the name; relink and missing detection then work
        // against the new path.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("rename");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");
        let (queue, receiver) = covers::test_queue(covers_dir.clone());
        let auto = import_copy_with(&db, &temp, "info-none.pdf", &sink, &covers_dir);

        let tag = on(&db, |conn| tags_create(conn, "Keep")).unwrap();
        on(&db, |conn| set_document_tags(conn, &sink, auto.id, &[tag.id])).unwrap();
        on(&db, |conn| {
            set_favorite(conn, &sink, &covers_dir, auto.id, true)
        })
        .unwrap();
        on(&db, |conn| set_reading(conn, &sink, &covers_dir, &[auto.id], true)).unwrap();
        // Metadata edit with the title value unchanged: title_source flips
        // only when the title itself changes, so the row stays auto-sourced
        // and the rename below proves AC-109's auto branch (the user branch
        // has its own test).
        let current = on(&db, |conn| get_document(conn, &covers_dir, auto.id)).unwrap();
        on(&db, |conn| update_document(
            conn,
            &sink,
            temp.path(),
            auto.id,
            &DocumentEdit {
                title: &current.title,
                author: "A. Writer",
                notes: "kept notes",
                favorite: true,
                tag_ids: &[tag.id],
            },
        ))
        .unwrap();
        on(&db, |conn| set_password(conn, &sink, &queue, auto.id, "sesame")).unwrap();
        let _ = receiver.try_recv(); // the password store's re-enqueue

        let renamed = on(&db, |conn| {
            rename_document(conn, &sink, &queue, auto.id, "Renamed Chapter.pdf")
        })
        .unwrap();

        // AC-107: the file moved in place — same folder, new name, old gone.
        assert_eq!(renamed.filename, "Renamed Chapter.pdf");
        assert_eq!(Path::new(&renamed.path).parent(), Path::new(&auto.path).parent());
        assert!(fs::exists(&renamed.path).unwrap());
        assert!(!fs::exists(&auto.path).unwrap());

        // AC-109: an auto title re-derives from the new filename.
        assert_eq!(renamed.title, "Renamed Chapter");
        assert_eq!(renamed.title_source, "auto");

        // AC-107: identity survives — same row, same tags, favorite, Reading,
        // notes and stored password.
        assert_eq!(renamed.id, auto.id);
        assert_eq!(renamed.tags, vec!["Keep".to_string()]);
        assert!(renamed.favorite && renamed.reading);
        assert_eq!(renamed.notes, "kept notes");
        assert_eq!(renamed.size, auto.size);
        let target = on(&db, |conn| open_target(conn, auto.id)).unwrap();
        assert_eq!(target.path, renamed.path);
        assert_eq!(target.password.as_deref(), Some("sesame"));

        // AC-110 (first half): the cover is enqueued for the new identity,
        // with the row's password (the render-and-sweep half is the covers
        // test of the same AC).
        let job = receiver.try_recv().expect("a rename re-enqueues the cover");
        assert_eq!(job.doc_id, auto.id);
        assert_eq!(job.path, renamed.path);
        assert_eq!(job.password.as_deref(), Some("sesame"));

        // Renaming to the same name is a no-op success (DR-266 d).
        let same = on(&db, |conn| {
            rename_document(conn, &sink, &queue, auto.id, "Renamed Chapter.pdf")
        })
        .unwrap();
        assert_eq!(same.path, renamed.path);
        assert!(receiver.try_recv().is_err(), "a no-op enqueues nothing");

        // AC-107 (second half): missing detection and relink resolve by the
        // new path. The file was just removed, so the rescan finds exactly
        // this one row missing (first detection).
        let bytes = fs::read(&renamed.path).unwrap();
        fs::remove_file(&renamed.path).unwrap();
        let rescan = rescan(&db, &sink, &queue, false).unwrap();
        assert_eq!((rescan.missing_found, rescan.restored), (1, 0));
        let missing = on(&db, |conn| get_document(conn, &covers_dir, auto.id)).unwrap();
        assert!(missing.missing);
        // The relink dialog hands the service a path where the file exists;
        // re-creating it at the renamed path proves the row resolves by the
        // new path, not the original one.
        fs::write(&renamed.path, bytes).unwrap();
        let restored = on(&db, |conn| {
            relink_document(conn, &sink, &queue, auto.id, &renamed.path)
        })
        .unwrap();
        assert!(!restored.missing);
        assert_eq!(restored.path, renamed.path);
    }

    #[test]
    fn a_user_title_survives_the_rename_an_auto_title_re_derives() {
        // AC-109: `title_source = 'user'` is unchanged by a rename; the
        // extracted (auto) title follows the new filename — the same gate
        // the released relink uses.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("rename-title");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");
        let (queue, _receiver) = covers::test_queue(covers_dir.clone());
        let extracted = import_copy_with(&db, &temp, "info-title.pdf", &sink, &covers_dir);
        assert_eq!(extracted.title, "Real Info Title");
        assert_eq!(extracted.title_source, "auto");

        // A user edit pins the title (the released FR-06 rule).
        on(&db, |conn| {
            update_document(
                conn,
                &sink,
                temp.path(),
                extracted.id,
                &DocumentEdit {
                    title: "Chosen Title",
                    author: "",
                    notes: "",
                    favorite: false,
                    tag_ids: &[],
                },
            )
        })
        .unwrap();
        let renamed = on(&db, |conn| {
            rename_document(conn, &sink, &queue, extracted.id, "New File Name.pdf")
        })
        .unwrap();
        assert_eq!(renamed.title, "Chosen Title");
        assert_eq!(renamed.title_source, "user");

        // Without a user edit the auto title re-derives from the filename.
        let plain = import_copy_with(&db, &temp, "info-title.pdf", &sink, &covers_dir);
        let renamed = on(&db, |conn| {
            rename_document(conn, &sink, &queue, plain.id, "Second Name.pdf")
        })
        .unwrap();
        assert_eq!(renamed.title, "Second Name");
        assert_eq!(renamed.title_source, "auto");
    }

    #[test]
    fn rename_rejects_invalid_and_colliding_names_and_changes_nothing() {
        // AC-108 (FR-21, DR-266 d): typed rejections happen before any file
        // or row moves.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("rename-reject");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");
        let (queue, receiver) = covers::test_queue(covers_dir.clone());
        let first = import_copy_with(&db, &temp, "info-none.pdf", &sink, &covers_dir);
        let second = import_copy_with(&db, &temp, "info-title.pdf", &sink, &covers_dir);
        fs::write(temp.path().join("occupied.pdf"), "not in the library").unwrap();

        // Invalid names (DR-266 d): empty, whitespace-padded, separators,
        // reserved characters, control characters, trailing dot or space.
        for name in [
            "",
            "   ",
            "a/b.pdf",
            "a\\b.pdf",
            "a:b.pdf",
            "a<b.pdf",
            "a>b.pdf",
            "a\"b.pdf",
            "a|b.pdf",
            "a?b.pdf",
            "a*b.pdf",
            "a\u{1}b.pdf",
            "trailing dot.",
            "trailing space .pdf ",
        ] {
            let result = on(&db, |conn| rename_document(conn, &sink, &queue, first.id, name));
            assert!(
                matches!(result, Err(AppError::InvalidName(_))),
                "{name:?} must be rejected as invalid"
            );
        }

        // Collisions: another library document's name, or a file already on
        // disk in the same folder.
        let collision = on(&db, |conn| {
            rename_document(conn, &sink, &queue, first.id, "info-title.pdf")
        });
        assert!(
            matches!(collision, Err(AppError::NameConflict { .. })),
            "a library path collision is rejected"
        );
        let occupied = on(&db, |conn| {
            rename_document(conn, &sink, &queue, first.id, "occupied.pdf")
        });
        assert!(
            matches!(occupied, Err(AppError::NameConflict { .. })),
            "an existing file at the target is rejected"
        );

        // A case-only rename resolves to the file itself on case-insensitive
        // filesystems — the documented accepted `name_conflict` (DR-266 d).
        let case_probe = fs::metadata(temp.path().join("info-none.PDF")).is_ok();
        let case_only = on(&db, |conn| {
            rename_document(conn, &sink, &queue, first.id, "INFO-NONE.PDF")
        });
        if case_probe {
            assert!(
                matches!(case_only, Err(AppError::NameConflict { .. })),
                "on a case-insensitive filesystem a case-only rename is a conflict"
            );
        } else {
            assert!(case_only.is_ok(), "on a case-sensitive filesystem it is a rename");
        }

        // Nothing moved: both files and both records are untouched, and no
        // cover was enqueued by any of the rejected attempts.
        assert!(fs::exists(&first.path).unwrap() && fs::exists(&second.path).unwrap());
        let first_row = on(&db, |conn| get_document(conn, &covers_dir, first.id)).unwrap();
        assert_eq!(first_row.filename, "info-none.pdf");
        let second_row = on(&db, |conn| get_document(conn, &covers_dir, second.id)).unwrap();
        assert_eq!(second_row.filename, "info-title.pdf");
        assert!(receiver.try_recv().is_err(), "rejected renames enqueue nothing");

        // A missing document cannot be renamed (AC-108's dialog only offers
        // the action when the file exists; the service enforces it too).
        fs::remove_file(&second.path).unwrap();
        let missing = on(&db, |conn| {
            rename_document(conn, &sink, &queue, second.id, "never.pdf")
        });
        assert!(
            matches!(missing, Err(AppError::MissingFile { .. })),
            "a missing document cannot be renamed"
        );
    }
    #[test]
    fn delete_library_only_keeps_the_file_delete_with_file_removes_it_and_its_cover() {
        // AC-04 + R5.2, and AC-62's delete half: the reader page cache of
        // a document goes with the row, other documents' caches untouched.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("delete");
        let sink = RecordingSink::default();
        let covers_dir = temp.path().join("covers");
        let reader_dir = temp.path().join("reader");

        let kept = import_copy_with(&db, &temp, "info-none.pdf", &sink, &covers_dir);
        let removed = import_copy_with(&db, &temp, "info-title.pdf", &sink, &covers_dir);

        // Fake cache entries so removal can be observed without rendering.
        fs::create_dir_all(&covers_dir).unwrap();
        fs::create_dir_all(reader_dir.join(kept.id.to_string())).unwrap();
        fs::create_dir_all(reader_dir.join(removed.id.to_string())).unwrap();
        fs::write(reader_dir.join(format!("{}/3-1600.png", kept.id)), "png").unwrap();
        fs::write(reader_dir.join(format!("{}/1-800.png", removed.id)), "png").unwrap();
        let kept_mtime = mtime_secs(&fs::metadata(&kept.path).unwrap());
        let removed_mtime = mtime_secs(&fs::metadata(&removed.path).unwrap());
        let kept_cover = covers::cache_path(&covers_dir, &kept.path, kept.size, kept_mtime);
        let removed_cover =
            covers::cache_path(&covers_dir, &removed.path, removed.size, removed_mtime);
        fs::write(&kept_cover, "png").unwrap();
        fs::write(&removed_cover, "png").unwrap();

        let queue = queue_for(&temp, &covers_dir);
        on(
            &db,
            |conn| {
                delete_documents(conn, &sink, &queue, &[kept.id], false, &reader_dir)
            },
        )
        .unwrap();
        assert!(
            fs::exists(&kept.path).unwrap(),
            "library-only delete leaves the file (FR-09)"
        );
        assert!(
            !fs::exists(&kept_cover).unwrap(),
            "R5.2: cache entry goes with the entry"
        );
        assert!(
            !reader_dir.join(kept.id.to_string()).exists(),
            "AC-62: the reader page cache goes with the row"
        );
        assert!(
            fs::exists(&removed_cover).unwrap(),
            "other entries are untouched"
        );
        assert!(
            reader_dir.join(removed.id.to_string()).exists(),
            "other documents keep their reader cache"
        );

        on(
            &db,
            |conn| {
                delete_documents(conn, &sink, &queue, &[removed.id], true, &reader_dir)
            },
        )
        .unwrap();
        assert!(
            !fs::exists(&removed.path).unwrap(),
            "delete-with-file removes it (FR-11)"
        );
        assert!(!fs::exists(&removed_cover).unwrap());
        assert!(!reader_dir.join(removed.id.to_string()).exists());

        let counts = on(&db, |conn| get_counts(conn)).unwrap();
        assert_eq!(counts.total, 0);
    }

    fn queue_for(temp: &TempDir, covers_dir: &Path) -> covers::CoverQueue {
        let _ = temp;
        let (queue, _receiver) = covers::test_queue(covers_dir.to_path_buf());
        queue
    }

    fn import_copy_with(
        db: &Db,
        temp: &TempDir,
        name: &str,
        sink: &dyn EventSink,
        covers_dir: &Path,
    ) -> DocumentDto {
        let path = temp.copy_fixture(name).to_string_lossy().into_owned();
        let (queue, receiver) = covers::test_queue(covers_dir.to_path_buf());
        import_paths(db, sink, &queue, &[path], &[]).unwrap();
        drop(receiver);
        on(db, |conn| {
            let id = conn.last_insert_rowid();
            get_document(conn, covers_dir, id)
        })
        .unwrap()
    }

    #[test]
    fn rescan_marks_missing_and_relink_restores_the_entry() {
        // AC-05: move outside → rescan marks missing → relink restores.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("relink");
        let sink = RecordingSink::default();
        let document = import_copy(&db, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        let old_path = PathBuf::from(&document.path);
        let new_path = temp.path().join("moved-here.pdf");
        fs::rename(&old_path, &new_path).unwrap();

        let result = rescan(&db, &sink, &queue, false).unwrap();
        assert_eq!(result.missing_found, 1);
        assert_eq!(result.restored, 0);
        let marked = on(&db, |conn| get_document(conn, &queue.dir, document.id)).unwrap();
        assert!(marked.missing);
        assert_eq!(on(&db, |conn| get_counts(conn)).unwrap().missing, 1);

        let restored = on(&db, |conn| {
            relink_document(conn, &sink, &queue, document.id, &new_path.to_string_lossy())
        })
        .unwrap();
        assert!(!restored.missing);
        assert_eq!(restored.path, new_path.to_string_lossy());
        assert_eq!(on(&db, |conn| get_counts(conn)).unwrap().missing, 0);

        // Typed validation for the Relink dialog (relinking.md).
        let not_pdf = on(&db, |conn| {
            relink_document(
                conn,
                &sink,
                &queue,
                document.id,
                &temp.path().join("x.txt").to_string_lossy(),
            )
        });
        assert!(matches!(not_pdf, Err(AppError::NotPdf { .. })));

        let other = temp.path().join("other.pdf");
        fs::copy(fixture("info-none.pdf"), &other).unwrap();
        import_paths(
            &db,
            &sink,
            &queue,
            &[other.to_string_lossy().into_owned()],
            &[],
        )
        .unwrap();
        let taken = on(&db, |conn| {
            relink_document(conn, &sink, &queue, document.id, &other.to_string_lossy())
        });
        assert!(
            matches!(taken, Err(AppError::PathTaken { .. })),
            "a path already in the library is refused"
        );
        drop(receiver);
    }

    #[test]
    fn rescan_restores_entries_when_files_come_back() {
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("rescan-restore");
        let sink = RecordingSink::default();
        let document = import_copy(&db, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        let original = PathBuf::from(&document.path);
        let hidden = temp.path().join("hidden.pdf");
        fs::rename(&original, &hidden).unwrap();
        assert_eq!(rescan(&db, &sink, &queue, true).unwrap().missing_found, 1);
        fs::rename(&hidden, &original).unwrap();
        let result = rescan(&db, &sink, &queue, false).unwrap();
        assert_eq!(result.restored, 1);
        assert_eq!(result.missing_found, 0);
        assert!(
            !on(&db, |conn| get_document(conn, &queue.dir, document.id))
                .unwrap()
                .missing
        );
        drop(receiver);
    }

    #[test]
    fn title_source_transitions_gate_relink_re_derivation() {
        // metadata-editing.md: `auto` on import, `user` on any manual edit;
        // only `auto` titles follow a relink.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("title-source");
        let sink = RecordingSink::default();
        let auto = import_copy(&db, &temp, "info-none.pdf", &sink);
        assert_eq!(auto.title, "info-none");
        assert_eq!(auto.title_source, "auto");

        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));

        // A relink of an untouched `auto` entry re-derives from the filename.
        let renamed = temp.path().join("renamed-file.pdf");
        fs::rename(&auto.path, &renamed).unwrap();
        let relinked = on(&db, |conn| {
            relink_document(conn, &sink, &queue, auto.id, &renamed.to_string_lossy())
        })
        .unwrap();
        assert_eq!(relinked.title, "renamed-file");
        assert_eq!(relinked.title_source, "auto");

        // Manual edit flips to `user` and survives a later relink.
        let edited = on(&db, |conn| {
            update_document(
                conn,
                &sink,
                &queue.dir,
                auto.id,
                &DocumentEdit {
                    title: "My Kept Title",
                    author: "",
                    notes: "",
                    favorite: false,
                    tag_ids: &[],
                },
            )
        })
        .unwrap();
        assert_eq!(edited.title_source, "user");
        let moved_again = temp.path().join("moved-again.pdf");
        fs::rename(&renamed, &moved_again).unwrap();
        let relinked = on(&db, |conn| {
            relink_document(conn, &sink, &queue, auto.id, &moved_again.to_string_lossy())
        })
        .unwrap();
        assert_eq!(relinked.title, "My Kept Title", "user titles are preserved");
        assert_eq!(relinked.title_source, "user");

        // Saving the same title does NOT flip the flag.
        let same = on(&db, |conn| {
            update_document(
                conn,
                &sink,
                &queue.dir,
                auto.id,
                &DocumentEdit {
                    title: "My Kept Title",
                    author: "later author",
                    notes: "",
                    favorite: false,
                    tag_ids: &[],
                },
            )
        })
        .unwrap();
        assert_eq!(same.author, "later author");
        drop(receiver);
    }

    #[test]
    fn update_rejects_empty_title_at_the_service_boundary() {
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("empty-title");
        let sink = RecordingSink::default();
        let document = import_copy(&db, &temp, "info-none.pdf", &sink);
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let result = on(&db, |conn| {
            update_document(
                conn,
                &sink,
                &queue.dir,
                document.id,
                &DocumentEdit {
                    title: "   ",
                    author: "",
                    notes: "",
                    favorite: false,
                    tag_ids: &[],
                },
            )
        });
        assert!(matches!(result, Err(AppError::TitleEmpty)));
        drop(receiver);
    }

    #[test]
    fn every_mutation_emits_matching_status_counts() {
        // status-feedback.md: counts match fixture state after each mutation.
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("status");
        let sink = RecordingSink::default();
        let first = import_copy(&db, &temp, "info-none.pdf", &sink);
        let second = import_copy(&db, &temp, "info-title.pdf", &sink);

        on(&db, |conn| {
            set_favorite(conn, &sink, &temp.path().join("covers"), first.id, true)
        })
        .unwrap();
        on(&db, |conn| {
            update_document(
                conn,
                &sink,
                temp.path(),
                second.id,
                &DocumentEdit {
                    title: "edited",
                    author: "",
                    notes: "",
                    favorite: true,
                    tag_ids: &[],
                },
            )
        })
        .unwrap();
        on(&db, |conn| {
            delete_documents(
                conn,
                &sink,
                &queue_for(&temp, &temp.path().join("covers")),
                &[first.id],
                false,
                &temp.path().join("reader"),
            )
        })
        .unwrap();

        // One event per mutation, each matching the DB state at that point.
        let expected = [
            CountsDto {
                total: 1,
                favorites: 0,
                missing: 0,
                reading: 0,
            }, // import 1
            CountsDto {
                total: 2,
                favorites: 0,
                missing: 0,
                reading: 0,
            }, // import 2
            CountsDto {
                total: 2,
                favorites: 1,
                missing: 0,
                reading: 0,
            }, // favorite
            CountsDto {
                total: 2,
                favorites: 2,
                missing: 0,
                reading: 0,
            }, // favorite via edit
            CountsDto {
                total: 1,
                favorites: 1,
                missing: 0,
                reading: 0,
            }, // delete
        ];
        assert_eq!(sink.statuses(), expected.to_vec());
        assert_eq!(on(&db, |conn| get_counts(conn)).unwrap(), *expected.last().unwrap());
    }

    #[test]
    fn import_progress_events_cover_the_whole_batch() {
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("progress");
        let sink = RecordingSink::default();
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = (1..=2500)
            .map(|i| fixture_doc(i).to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        import_paths(&db, &sink, &queue, &paths, &[]).unwrap();
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
        let sink = RecordingSink::default();
        // Defaults with nothing written: no secondary key (FR-13), auto columns (UI-08).
        let fresh = get_settings(&conn).unwrap();
        assert_eq!(
            (fresh.sort_secondary.as_str(), fresh.grid_columns.as_str()),
            ("none", "auto")
        );

        set_setting(&conn, &sink, "sort_secondary", "size").unwrap();
        set_setting(&conn, &sink, "grid_columns", "4").unwrap();
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
                matches!(set_setting(&conn, &sink, key, value), Err(AppError::Validation(_))),
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
    fn theme_defaults_to_system_and_accepts_only_the_three_states() {
        let conn = open_in_memory().unwrap();
        let sink = RecordingSink::default();
        // Nothing written: the app follows the OS, which is the released behavior (UI-17).
        assert_eq!(get_settings(&conn).unwrap().theme, "system");

        for value in ["light", "dark", "system"] {
            set_setting(&conn, &sink, "theme", value).unwrap();
            assert_eq!(get_settings(&conn).unwrap().theme, value);
        }

        for value in ["auto", "LIGHT", "light ", ""] {
            assert!(
                matches!(
                    set_setting(&conn, &sink, "theme", value),
                    Err(AppError::Validation(_))
                ),
                "theme={value} should be rejected"
            );
        }

        // A corrupt row written outside this boundary reads back as the default.
        db::set_setting(&conn, "theme", "midnight").unwrap();
        assert_eq!(get_settings(&conn).unwrap().theme, "system");

        // AC-99 (DR-230): every accepted save announces itself exactly once,
        // with the stored value; a rejected save announces nothing.
        assert_eq!(
            sink.settings(),
            [
                ("theme".to_string(), "light".to_string()),
                ("theme".to_string(), "dark".to_string()),
                ("theme".to_string(), "system".to_string()),
            ]
            .to_vec()
        );
    }

    #[test]
    fn last_filter_grammar_accepts_the_new_form_and_the_legacy_one() {
        // AC-113 (UI-42): `reading` is a mode; `&tags=` is the current list
        // form; `&cats=` and `cat:` keep their meaning for values a
        // pre-upgrade library stored.
        let conn = open_in_memory().unwrap();
        let sink = RecordingSink::default();
        for value in [
            "all",
            "favorites",
            "missing",
            "reading",
            "all&tags=7",
            "favorites&tags=1,2",
            "missing&tags=3,4,5",
            "reading&tags=3",
            "all&cats=7",
            "favorites&cats=1,2",
            "missing&cats=3,4,5",
            "cat:5", // written by v0.0.1: readable, never dropped by the upgrade
        ] {
            set_setting(&conn, &sink, "last_filter", value)
                .unwrap_or_else(|error| panic!("{value} must be accepted: {error:?}"));
            assert_eq!(get_settings(&conn).unwrap().last_filter, value);
        }
        for value in [
            "",
            "bogus",
            "favorites&tags=",
            "favorites&tags=1,,2",
            "favorites&tags=x",
            "all&tags=1,2&tags=3",
            "all&cats=1,2&cats=3",
            "all&tags=1&cats=2",
            "all&cats=1&tags=2",
            "cat:",
            "cat:1,2",
        ] {
            assert!(
                matches!(
                    set_setting(&conn, &sink, "last_filter", value),
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
    fn import_assigns_every_active_tag() {
        let db = test_db(open_in_memory().unwrap());
        let temp = TempDir::new("assign-tags");
        let sink = RecordingSink::default();
        let (queue, _receiver) = covers::test_queue(temp.path().join("covers"));
        let alpha = on(&db, |conn| tags_create(conn, "Alpha")).unwrap();
        let beta = on(&db, |conn| tags_create(conn, "Beta")).unwrap();

        // FR-10 as modified (DR-82): one import, every active tag.
        let first = fixture_doc(1).to_string_lossy().into_owned();
        import_paths(
            &db,
            &sink,
            &queue,
            std::slice::from_ref(&first),
            &[alpha.id, beta.id],
        )
        .unwrap();
        let filed = on(&db, |conn| {
            get_document(conn, &queue.dir, document_id_for(conn, &first))
        })
        .unwrap();
        assert_eq!(
            filed.tags,
            vec!["Alpha".to_string(), "Beta".to_string()]
        );

        // No active tag: nothing is assigned.
        let second = fixture_doc(2).to_string_lossy().into_owned();
        import_paths(&db, &sink, &queue, std::slice::from_ref(&second), &[]).unwrap();
        let unfiled = on(&db, |conn| {
            get_document(conn, &queue.dir, document_id_for(conn, &second))
        })
        .unwrap();
        assert!(unfiled.tags.is_empty());

        // An unknown id in the set is refused before any row is written.
        let third = fixture_doc(3).to_string_lossy().into_owned();
        let rejected = import_paths(&db, &sink, &queue, &[third], &[alpha.id, 999]);
        assert!(matches!(
            rejected,
            Err(AppError::TagNotFound { id: 999 })
        ));
        let total = on(&db, |conn| {
            conn.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get::<_, i64>(0))
                .unwrap()
        });
        assert_eq!(total, 2, "a rejected import writes nothing");
    }

    /// Recording sink with a lock probe (AC-101, DR-233): every progress
    /// event records whether the connection was free at the moment of the
    /// event — the pipeline must emit progress only outside a lock hold.
    struct ProbingSink {
        inner: RecordingSink,
        db: std::sync::Arc<Db>,
        lock_free: std::sync::Mutex<Vec<bool>>,
    }

    impl EventSink for ProbingSink {
        fn status(&self, counts: &CountsDto) {
            self.inner.status(counts);
        }
        fn progress(&self, job: &JobProgress) {
            let free = self.db.try_with_raw(|_| Ok(())).is_some();
            self.lock_free.lock().unwrap().push(free);
            <RecordingSink as EventSink>::progress(&self.inner, job);
        }
        fn settings_changed(&self, key: &str, value: &str) {
            self.inner.settings_changed(key, value);
        }
    }

    #[test]
    fn import_pipeline_events_cover_every_chunk_and_fire_outside_the_lock() {
        // AC-101 (DR-233, chunk bound revised to 5 by DR-279): the bar
        // appears before any file is processed, advances in steps of at most
        // CHUNK, covers the whole import, and is emitted while the connection
        // is free — never from inside a lock hold. 60 fixtures = twelve
        // full chunks of 5.
        let db = std::sync::Arc::new(test_db(open_in_memory().unwrap()));
        let temp = TempDir::new("progress-structure");
        let sink = ProbingSink {
            inner: RecordingSink::default(),
            db: std::sync::Arc::clone(&db),
            lock_free: std::sync::Mutex::new(Vec::new()),
        };
        let (queue, receiver) = covers::test_queue(temp.path().join("covers"));
        let paths = (1..=60)
            .map(|i| fixture_doc(i).to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        let result = import_paths(&db, &sink, &queue, &paths, &[]).unwrap();
        drop(receiver);
        assert_eq!(result.imported, 60);

        let progress = sink.inner.progress();
        // Opening event: the total is known before any file is processed.
        assert_eq!(progress.len(), 13, "opening event + one per chunk of 5");
        assert_eq!(
            (
                progress[0].kind.as_str(),
                progress[0].processed,
                progress[0].total
            ),
            ("import", 0, 60),
            "the bar appears before the first file is processed"
        );
        // Chunk events: the exact chunk boundaries of the pipeline (DR-279).
        let processed: Vec<i64> = progress.iter().map(|event| event.processed).collect();
        assert_eq!(
            processed,
            vec![0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
        );
        assert!(progress.iter().all(|event| event.kind == "import"));
        assert!(progress.iter().all(|event| event.total == 60));

        // Every progress event fired while the connection was free.
        let lock_free = sink.lock_free.lock().unwrap().clone();
        assert!(
            lock_free.iter().all(|free| *free),
            "progress events must fire outside the lock (DR-233)"
        );

        // Completion: the final status event matches the imported state.
        let last_status = *sink.inner.statuses().last().expect("status event");
        assert_eq!(last_status.total, 60);
    }
}
