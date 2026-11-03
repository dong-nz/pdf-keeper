//! Database open + additive migrations behind `user_version` (RULES R2.1).

use std::path::Path;

use rusqlite::Connection;

use crate::error::AppError;

/// Migration v1 — the complete v0.0.1 schema (spec §6).
const SCHEMA_V1: &str = r#"
CREATE TABLE documents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    path         TEXT NOT NULL UNIQUE,
    filename     TEXT NOT NULL,
    title        TEXT NOT NULL,
    author       TEXT NOT NULL DEFAULT '',
    notes        TEXT NOT NULL DEFAULT '',
    favorite     INTEGER NOT NULL DEFAULT 0,
    size         INTEGER NOT NULL,
    mtime        INTEGER NOT NULL,
    added_at     INTEGER NOT NULL,
    missing      INTEGER NOT NULL DEFAULT 0,
    title_source TEXT NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto', 'user'))
);

CREATE TABLE categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE document_categories (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, category_id)
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIRTUAL TABLE documents_fts USING fts5(
    title, filename, author, notes,
    content='documents', content_rowid='id', prefix='1'
);

CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, filename, author, notes)
    VALUES (new.id, new.title, new.filename, new.author, new.notes);
END;

CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, filename, author, notes)
    VALUES ('delete', old.id, old.title, old.filename, old.author, old.notes);
END;

CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, filename, author, notes)
    VALUES ('delete', old.id, old.title, old.filename, old.author, old.notes);
    INSERT INTO documents_fts(rowid, title, filename, author, notes)
    VALUES (new.id, new.title, new.filename, new.author, new.notes);
END;
"#;

/// Open the library database in the per-user data directory (RULES R8.4) and
/// bring the schema up to date. `foreign_keys` is always ON (RULES R2.4).
pub fn open(app_data_dir: &Path) -> Result<Connection, AppError> {
    let db_path = app_data_dir.join("library.db");
    let conn = Connection::open(&db_path).map_err(|e| AppError::Io {
        path: db_path.display().to_string(),
        message: e.to_string(),
    })?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

/// Open an in-memory database with the current schema (tests).
pub fn open_in_memory() -> Result<Connection, AppError> {
    let conn = Connection::open_in_memory()?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), AppError> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 1 {
        conn.execute_batch(SCHEMA_V1)?;
        conn.pragma_update(None, "user_version", 1)?;
    }
    // Future releases append `if version < 2 { … }` blocks here — additive
    // only, never rewriting earlier migrations (RULES R2.1).
    Ok(())
}

pub fn user_version(conn: &Connection) -> Result<i64, AppError> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map([key], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(value) => Ok(Some(value?)),
        None => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_database_migrates_to_current_version() {
        let conn = open_in_memory().unwrap();
        assert_eq!(user_version(&conn).unwrap(), 1);
    }

    #[test]
    fn migration_is_idempotent_and_keeps_data() {
        let conn = open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO documents (path, filename, title, size, mtime, added_at) VALUES ('/a.pdf', 'a.pdf', 'A', 1, 1, 1)",
            [],
        )
        .unwrap();
        // Re-running migrate() on an already-current schema must not fail or wipe data.
        migrate(&conn).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(user_version(&conn).unwrap(), 1);
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let conn = open_in_memory().unwrap();
        let result = conn.execute(
            "INSERT INTO document_categories (document_id, category_id) VALUES (1, 1)",
            [],
        );
        assert!(result.is_err(), "FK constraint must be active (RULES R2.4)");
    }

    #[test]
    fn fts_triggers_keep_index_in_sync_with_every_mutation() {
        let conn = open_in_memory().unwrap();
        let matches = |conn: &Connection, term: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM documents_fts WHERE documents_fts MATCH ?1",
                [term],
                |row| row.get(0),
            )
            .unwrap()
        };

        conn.execute(
            "INSERT INTO documents (path, filename, title, author, notes, size, mtime, added_at) VALUES ('/x.pdf', 'x.pdf', 'Quarterly Report', 'Ada', 'planning', 1, 1, 1)",
            [],
        )
        .unwrap();
        assert_eq!(matches(&conn, "report"), 1);

        conn.execute(
            "UPDATE documents SET title = 'Zebra Summary' WHERE id = 1",
            [],
        )
        .unwrap();
        assert_eq!(matches(&conn, "report"), 0);
        assert_eq!(matches(&conn, "zebra"), 1);

        conn.execute("DELETE FROM documents WHERE id = 1", [])
            .unwrap();
        assert_eq!(matches(&conn, "zebra"), 0);
    }

    #[test]
    fn settings_round_trip_and_overwrite() {
        let conn = open_in_memory().unwrap();
        assert_eq!(get_setting(&conn, "view").unwrap(), None);
        set_setting(&conn, "view", "grid").unwrap();
        assert_eq!(get_setting(&conn, "view").unwrap().as_deref(), Some("grid"));
        set_setting(&conn, "view", "list").unwrap();
        assert_eq!(get_setting(&conn, "view").unwrap().as_deref(), Some("list"));
    }
}
