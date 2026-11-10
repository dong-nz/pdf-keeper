//! Query composition for every list path (library view, search, favorites,
//! tag filter, reading filter, missing filter). ONE shared builder so the
//! favorites-first pinning (FR-04/FR-13) can never be forgotten in a query path.

use rusqlite::{Connection, Row, params_from_iter, types::Value as SqlValue};
use std::path::Path;

use crate::error::{AppError, is_fts_syntax_error};

use super::{DocumentDto, SearchPage};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortKey {
    Title,
    DateAdded,
    Size,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDir {
    Asc,
    Desc,
}

/// Whitelisted mapping of the command's sort parameters to SQL — no
/// free-form SQL from user input (FR-13, RULES R2.2).
pub fn parse_sort(sort: &str, dir: &str) -> (SortKey, SortDir) {
    let key = match sort {
        "date_added" => SortKey::DateAdded,
        "size" => SortKey::Size,
        _ => SortKey::Title,
    };
    let direction = match dir {
        "desc" => SortDir::Desc,
        _ => SortDir::Asc,
    };
    (key, direction)
}

fn sort_column(key: SortKey) -> &'static str {
    match key {
        SortKey::Title => "d.title COLLATE NOCASE",
        SortKey::DateAdded => "d.added_at",
        SortKey::Size => "d.size",
    }
}

fn sort_dir_sql(dir: SortDir) -> &'static str {
    match dir {
        SortDir::Asc => "ASC",
        SortDir::Desc => "DESC",
    }
}

/// Whitelisted mapping of the secondary key ("Then by…", FR-13). `"none"` and
/// any unknown value mean "no secondary key" — never raw SQL (RULES R2.2).
pub fn parse_sort_secondary(key: &str) -> Option<SortKey> {
    match key {
        "title" => Some(SortKey::Title),
        "date_added" => Some(SortKey::DateAdded),
        "size" => Some(SortKey::Size),
        _ => None,
    }
}

#[derive(Debug, Clone)]
pub struct Query {
    pub q: String,
    /// Active tag set (FR-02 as modified, DR-82; renamed by UI-42): a document
    /// matches when it carries at least one of them. Empty = no tag filter.
    pub tag_ids: Vec<i64>,
    pub favorites_only: bool,
    pub missing_only: bool,
    /// The Reading view predicate (FR-19): only collection members match.
    pub reading_only: bool,
    pub sort: SortKey,
    pub sort_dir: SortDir,
    /// Secondary key (FR-13). `None` = unset: `id` is then the only tiebreak,
    /// which is the shipped v0.0.1 ordering.
    pub sort_secondary: Option<SortKey>,
}

/// Split user input into search tokens: whitespace/control separate; every
/// other character (including `"` `%` `_`) stays inside the token — the FTS
/// quoting and the LIKE escaping below make those literals safe.
pub fn split_tokens(q: &str) -> Vec<String> {
    q.split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|token| !token.is_empty())
        .map(String::from)
        .collect()
}

/// Compile tokens to FTS5 prefix syntax: each token quoted (so FTS operators
/// can't leak in) and suffixed with `*` (prefix matching, FR-03); tokens are
/// AND-combined (FTS5 implicit AND). `None` = no terms = all rows.
pub fn compile_match(q: &str) -> Option<String> {
    let terms: Vec<String> = split_tokens(q)
        .into_iter()
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

fn escape_like(token: &str) -> String {
    let mut out = String::with_capacity(token.len() + 4);
    for c in token.chars() {
        if matches!(c, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

struct Filter {
    from: String,
    r#where: String,
    values: Vec<SqlValue>,
}

fn build_filter(query: &Query, matcher: Option<&str>) -> Filter {
    let mut filter = Filter {
        from: "FROM documents d".to_string(),
        r#where: " WHERE 1=1".to_string(),
        values: Vec::new(),
    };
    if let Some(matcher) = matcher {
        filter.from =
            "FROM documents d JOIN documents_fts ON documents_fts.rowid = d.id".to_string();
        filter.r#where += " AND documents_fts MATCH ?";
        filter.values.push(SqlValue::Text(matcher.to_string()));
    }
    if !query.tag_ids.is_empty() {
        // Union of the active set (FR-02, DR-82): one EXISTS with a bound IN
        // list — placeholders only, never interpolated ids (R2.2).
        let placeholders = query
            .tag_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        filter.r#where += &format!(
            " AND EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id AND dt.tag_id IN ({placeholders}))"
        );
        for tag_id in &query.tag_ids {
            filter.values.push(SqlValue::Integer(*tag_id));
        }
    }
    if query.favorites_only {
        filter.r#where += " AND d.favorite = 1";
    }
    if query.reading_only {
        // The Reading view behaves like the other special views (FR-19): a
        // plain predicate on the flag, composable with every other clause.
        filter.r#where += " AND d.reading = 1";
    }
    if query.missing_only {
        filter.r#where += " AND d.missing = 1";
    }
    filter
}

/// Favorites pinned first, then the whitelisted primary key, then the
/// whitelisted secondary key in the primary's direction (FR-13, DR-81), then
/// id as the final stable tiebreak (FR-04, FR-13). With no secondary key the
/// clause is exactly the shipped v0.0.1 one.
fn order_clause(query: &Query) -> String {
    let dir = sort_dir_sql(query.sort_dir);
    let mut order = format!(
        "ORDER BY d.favorite DESC, {} {}",
        sort_column(query.sort),
        dir
    );
    if let Some(secondary) = query.sort_secondary {
        order.push_str(&format!(", {} {}", sort_column(secondary), dir));
    }
    order.push_str(", d.id ASC");
    order
}

pub const ROW_COLUMNS: &str = concat!(
    "d.id, d.path, d.filename, d.title, d.author, d.notes, d.favorite, ",
    "d.size, d.mtime, d.added_at, d.missing, d.title_source, d.reading, ",
    "(SELECT group_concat(name, '\u{1f}') FROM (",
    "SELECT t.name AS name FROM document_tags dt ",
    "JOIN tags t ON t.id = dt.tag_id ",
    "WHERE dt.document_id = d.id ORDER BY t.name COLLATE NOCASE",
    ")) AS tags"
);

pub fn map_row(row: &Row, covers_dir: &Path) -> Result<DocumentDto, rusqlite::Error> {
    let tags: Option<String> = row.get("tags")?;
    let path: String = row.get("path")?;
    let size: i64 = row.get("size")?;
    let mtime: i64 = row.get("mtime")?;
    Ok(DocumentDto {
        id: row.get("id")?,
        filename: row.get("filename")?,
        title: row.get("title")?,
        author: row.get("author")?,
        notes: row.get("notes")?,
        favorite: row.get("favorite")?,
        size,
        added_at: row.get("added_at")?,
        missing: row.get("missing")?,
        title_source: row.get("title_source")?,
        reading: row.get("reading")?,
        tags: tags
            .map(|joined| joined.split('\u{1f}').map(String::from).collect())
            .unwrap_or_default(),
        // DR-51 as corrected by DR-237: the path is delivered only when the
        // cached cover exists — an empty path renders the glyph with no asset
        // request, and the cover job's completion re-query (DR-231) carries
        // the path empty→real so the open view flips. The UI's onerror
        // fallback (R5.3) stands as the safety net for a file removed
        // between query and render.
        cover_path: {
            let cached = crate::covers::cache_path(covers_dir, &path, size, mtime);
            if cached.exists() {
                cached.to_string_lossy().into_owned()
            } else {
                String::new()
            }
        },
        path,
    })
}

fn count_rows(conn: &Connection, filter: &Filter) -> Result<i64, AppError> {
    let sql = format!("SELECT COUNT(*) {}{}", filter.from, filter.r#where);
    let mut stmt = conn.prepare(&sql)?;
    Ok(stmt.query_row(params_from_iter(filter.values.iter()), |row| row.get(0))?)
}

/// Windowed rows (offset/limit) + total in one call (spec §5.3.4 rule 2).
pub fn search(
    conn: &Connection,
    query: &Query,
    offset: i64,
    limit: i64,
    covers_dir: &Path,
) -> Result<SearchPage, AppError> {
    match compile_match(&query.q) {
        Some(matcher) => {
            match search_with(conn, query, Some(&matcher), offset, limit, covers_dir) {
                // R2.3: LIKE only ever as a caught-error fallback for malformed queries.
                Err(AppError::Db { source }) if is_fts_syntax_error(&source) => {
                    search_like(conn, query, offset, limit, covers_dir)
                }
                other => other,
            }
        }
        None => search_with(conn, query, None, offset, limit, covers_dir),
    }
}

fn search_with(
    conn: &Connection,
    query: &Query,
    matcher: Option<&str>,
    offset: i64,
    limit: i64,
    covers_dir: &Path,
) -> Result<SearchPage, AppError> {
    let filter = build_filter(query, matcher);
    let total = count_rows(conn, &filter)?;
    let sql = format!(
        "SELECT {} {}{} {} LIMIT ? OFFSET ?",
        ROW_COLUMNS,
        filter.from,
        filter.r#where,
        order_clause(query)
    );
    let mut values = filter.values.clone();
    values.push(SqlValue::Integer(limit));
    values.push(SqlValue::Integer(offset));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            map_row(row, covers_dir)
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SearchPage { rows, total })
}

/// Fallback path for FTS-syntax failures (RULES R2.3): token AND, each token
/// matching any of the four indexed columns via escaped LIKE.
pub fn search_like(
    conn: &Connection,
    query: &Query,
    offset: i64,
    limit: i64,
    covers_dir: &Path,
) -> Result<SearchPage, AppError> {
    let tokens = split_tokens(&query.q);
    let mut filter = build_filter(query, None);
    for token in &tokens {
        let pattern = format!("%{}%", escape_like(token));
        filter.r#where += " AND (d.title LIKE ? ESCAPE '\\' OR d.filename LIKE ? ESCAPE '\\' OR d.author LIKE ? ESCAPE '\\' OR d.notes LIKE ? ESCAPE '\\')";
        for _ in 0..4 {
            filter.values.push(SqlValue::Text(pattern.clone()));
        }
    }
    let total = count_rows(conn, &filter)?;
    let sql = format!(
        "SELECT {} {}{} {} LIMIT ? OFFSET ?",
        ROW_COLUMNS,
        filter.from,
        filter.r#where,
        order_clause(query)
    );
    let mut values = filter.values.clone();
    values.push(SqlValue::Integer(limit));
    values.push(SqlValue::Integer(offset));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |row| {
            map_row(row, covers_dir)
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SearchPage { rows, total })
}

/// All matching ids, same filters and ordering (select-all, spec §5.3.4 rule 5).
pub fn ids(conn: &Connection, query: &Query) -> Result<Vec<i64>, AppError> {
    let matcher = compile_match(&query.q);
    let filter = build_filter(query, matcher.as_deref());
    let sql = format!(
        "SELECT d.id {}{} {}",
        filter.from,
        filter.r#where,
        order_clause(query)
    );
    let mut stmt = conn.prepare(&sql)?;
    let result = stmt
        .query_map(params_from_iter(filter.values.iter()), |row| {
            row.get::<_, i64>(0)
        })?
        .collect::<Result<Vec<_>, _>>();
    match result {
        Err(error) if is_fts_syntax_error(&error) => {
            // Rebuild without FTS and fall back to LIKE-scanned ids.
            let mut plain = build_filter(query, None);
            for token in split_tokens(&query.q) {
                let pattern = format!("%{}%", escape_like(&token));
                plain.r#where += " AND (d.title LIKE ? ESCAPE '\\' OR d.filename LIKE ? ESCAPE '\\' OR d.author LIKE ? ESCAPE '\\' OR d.notes LIKE ? ESCAPE '\\')";
                for _ in 0..4 {
                    plain.values.push(SqlValue::Text(pattern.clone()));
                }
            }
            let sql = format!(
                "SELECT d.id {}{} {}",
                plain.from,
                plain.r#where,
                order_clause(query)
            );
            let mut stmt = conn.prepare(&sql)?;
            Ok(stmt
                .query_map(params_from_iter(plain.values.iter()), |row| {
                    row.get::<_, i64>(0)
                })?
                .collect::<Result<Vec<_>, _>>()?)
        }
        other => Ok(other?),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    fn covers() -> std::path::PathBuf {
        std::path::PathBuf::from("test-covers")
    }

    // Positional seeding keeps each test row readable in one line.
    #[allow(clippy::too_many_arguments)]
    fn seed(
        conn: &Connection,
        path: &str,
        title: &str,
        author: &str,
        notes: &str,
        favorite: bool,
        size: i64,
        added_at: i64,
        missing: bool,
    ) -> i64 {
        conn.execute(
            "INSERT INTO documents (path, filename, title, author, notes, favorite, size, mtime, added_at, missing) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9)",
            rusqlite::params![path, path.rsplit('/').next().unwrap_or(path), title, author, notes, favorite as i64, size, added_at, missing as i64],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn query(q: &str) -> Query {
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

    #[test]
    fn compile_match_builds_quoted_prefix_tokens() {
        assert_eq!(compile_match("repo").as_deref(), Some("\"repo\"*"));
        assert_eq!(compile_match("re po").as_deref(), Some("\"re\"* \"po\"*"));
        assert_eq!(
            compile_match("order AND").as_deref(),
            Some("\"order\"* \"AND\"*")
        );
        assert_eq!(compile_match("a\"b").as_deref(), Some("\"a\"\"b\"*"));
        assert_eq!(compile_match("   "), None);
    }

    #[test]
    fn prefix_search_hits_all_four_fields() {
        let conn = open_in_memory().unwrap();
        seed(
            &conn,
            "/a.pdf",
            "Quarterly Report",
            "",
            "",
            false,
            10,
            1,
            false,
        ); // title hit
        seed(
            &conn,
            "/report.pdf",
            "untitled",
            "",
            "",
            false,
            10,
            2,
            false,
        ); // filename hit
        seed(&conn, "/b.pdf", "Memo", "Reportov", "", false, 10, 3, false); // author hit
        seed(
            &conn,
            "/c.pdf",
            "Note",
            "",
            "reporting details",
            false,
            10,
            4,
            false,
        ); // notes hit
        seed(
            &conn,
            "/d.pdf",
            "Unrelated",
            "Nobody",
            "nothing",
            false,
            10,
            5,
            false,
        );

        let page = search(&conn, &query("repo"), 0, 100, &covers()).unwrap();
        assert_eq!(page.total, 4);
    }

    #[test]
    fn filters_compose_with_and_semantics() {
        let conn = open_in_memory().unwrap();
        let tag = {
            conn.execute("INSERT INTO tags (name) VALUES ('Finance')", [])
                .unwrap();
            conn.last_insert_rowid()
        };
        let in_tag_fav = seed(&conn, "/x.pdf", "Alpha Target", "", "", true, 10, 1, false);
        conn.execute(
            "INSERT INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![in_tag_fav, tag],
        )
        .unwrap();
        seed(&conn, "/y.pdf", "Beta Target", "", "", true, 10, 2, false); // favorite, wrong tag
        seed(&conn, "/z.pdf", "Gamma Target", "", "", false, 10, 3, false); // tag? no, plain
        conn.execute(
            "INSERT INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![
                seed(&conn, "/w.pdf", "Delta Target", "", "", false, 10, 4, true),
                tag
            ],
        )
        .unwrap();

        let base = Query {
            q: "target".into(),
            tag_ids: vec![tag],
            favorites_only: true,
            missing_only: false,
            reading_only: false,
            sort: SortKey::Title,
            sort_dir: SortDir::Asc,
            sort_secondary: None,
        };
        assert_eq!(search(&conn, &base, 0, 100, &covers()).unwrap().total, 1);

        // AND across search ∧ tags ∧ favorites ∧ missing.
        let all = Query {
            missing_only: true,
            ..base
        };
        assert_eq!(search(&conn, &all, 0, 100, &covers()).unwrap().total, 0);

        // Tags ∧ missing (no favorites filter): the missing tagged doc matches.
        let missing_tag = Query {
            q: "target".into(),
            tag_ids: vec![tag],
            favorites_only: false,
            missing_only: true,
            ..base
        };
        let page = search(&conn, &missing_tag, 0, 100, &covers()).unwrap();
        assert_eq!(page.total, 1);
        assert!(page.rows[0].missing);
    }

    fn insert_tag(conn: &Connection, name: &str) -> i64 {
        conn.execute("INSERT INTO tags (name) VALUES (?1)", rusqlite::params![name])
            .unwrap();
        conn.last_insert_rowid()
    }

    fn assign_tag(conn: &Connection, document: i64, tag: i64) {
        conn.execute(
            "INSERT INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![document, tag],
        )
        .unwrap();
    }

    #[test]
    fn several_active_tags_select_the_union() {
        let conn = open_in_memory().unwrap();
        let a = insert_tag(&conn, "Alpha");
        let b = insert_tag(&conn, "Beta");
        let only_a = seed(&conn, "/a.pdf", "Only A", "", "", false, 10, 1, false);
        let only_b = seed(&conn, "/b.pdf", "Only B", "", "", false, 10, 2, false);
        let both = seed(&conn, "/c.pdf", "Both", "", "", false, 10, 3, false);
        seed(&conn, "/d.pdf", "Neither", "", "", false, 10, 4, false);
        let favorite_b = seed(&conn, "/e.pdf", "Favorite B", "", "", true, 10, 5, false);
        assign_tag(&conn, only_a, a);
        assign_tag(&conn, only_b, b);
        assign_tag(&conn, both, a);
        assign_tag(&conn, both, b);
        assign_tag(&conn, favorite_b, b);

        let titles_for = |tag_ids: Vec<i64>| -> Vec<String> {
            let q = Query {
                tag_ids,
                ..query("")
            };
            search(&conn, &q, 0, 100, &covers())
                .unwrap()
                .rows
                .into_iter()
                .map(|row| row.title)
                .collect()
        };

        // One tag: exactly the shipped single-category result.
        assert_eq!(titles_for(vec![a]), vec!["Both", "Only A"]);
        // Two: the union, the shared document counted once, unfiled absent.
        assert_eq!(
            titles_for(vec![a, b]),
            vec!["Favorite B", "Both", "Only A", "Only B"]
        );
        // The order of the active set changes nothing.
        assert_eq!(titles_for(vec![b, a]), titles_for(vec![a, b]));
        // An unknown id narrows nothing else (it adds no documents).
        assert_eq!(titles_for(vec![a, 999]), vec!["Both", "Only A"]);
        // Empty set = no tag clause: the whole library (favorites pinned).
        assert_eq!(
            titles_for(vec![]),
            vec!["Favorite B", "Both", "Neither", "Only A", "Only B"]
        );

        // The ids path agrees with the rows path (select-all consistency).
        let selected = ids(
            &conn,
            &Query {
                tag_ids: vec![a, b],
                ..query("")
            },
        )
        .unwrap();
        assert_eq!(selected, vec![favorite_b, both, only_a, only_b]);

        // Union AND saved-search mode: only the favorite inside the union.
        let mode_only = Query {
            tag_ids: vec![a, b],
            favorites_only: true,
            ..query("")
        };
        assert_eq!(
            search(&conn, &mode_only, 0, 100, &covers())
                .unwrap()
                .rows
                .iter()
                .map(|row| row.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Favorite B"]
        );
        // Union AND search terms.
        let with_terms = Query {
            q: "only".into(),
            tag_ids: vec![a, b],
            ..query("")
        };
        assert_eq!(
            search(&conn, &with_terms, 0, 100, &covers())
                .unwrap()
                .rows
                .iter()
                .map(|row| row.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Only A", "Only B"]
        );
    }

    // FR-19 (AC-121, Rust half): the Reading view predicate selects exactly
    // the members, composes with search like the other special views, and is
    // a plain flag filter — membership is written only by the flag UPDATE
    // (the manual-only rule is asserted in the service tests, AC-102).
    #[test]
    fn reading_view_selects_exactly_the_members() {
        let conn = open_in_memory().unwrap();
        let a = seed(&conn, "/a.pdf", "Alpha Read", "", "", false, 10, 1, false);
        let b = seed(&conn, "/b.pdf", "Beta Read", "", "", true, 10, 2, false);
        seed(&conn, "/c.pdf", "Gamma Plain", "", "", false, 10, 3, false);
        for id in [a, b] {
            conn.execute("UPDATE documents SET reading = 1 WHERE id = ?1", [id])
                .unwrap();
        }

        let titles_of = |q: &str| -> Vec<String> {
            search(
                &conn,
                &Query {
                    reading_only: true,
                    ..query(q)
                },
                0,
                100,
                &covers(),
            )
            .unwrap()
            .rows
            .iter()
            .map(|row| row.title.clone())
            .collect()
        };
        // Members only; the favorite pinning still applies inside the view.
        assert_eq!(titles_of(""), vec!["Beta Read", "Alpha Read"]);
        // Composes with search terms (the released filter-mode rule).
        assert_eq!(titles_of("alpha"), vec!["Alpha Read"]);
        assert_eq!(titles_of("gamma"), Vec::<String>::new());
        // The DTO carries the membership for the UI toggle state.
        let page = search(&conn, &query("read"), 0, 100, &covers()).unwrap();
        assert!(page.rows.iter().all(|row| row.reading));
        let all = search(&conn, &query(""), 0, 100, &covers()).unwrap();
        let flags: Vec<bool> = all.rows.iter().map(|row| row.reading).collect();
        // Unfiltered list: the favorite member pins first, then title order —
        // the non-member sorts among the rest, exactly like any document.
        assert_eq!(flags, vec![true, true, false]);
    }

    #[test]
    fn favorites_are_pinned_under_every_sort_key_and_direction() {
        let conn = open_in_memory().unwrap();
        // Two favorites deliberately LAST in every natural order.
        seed(&conn, "/a.pdf", "Zeta One", "Z", "z", true, 900, 900, false);
        seed(&conn, "/b.pdf", "Zeta Two", "Z", "z", true, 901, 901, false);
        seed(&conn, "/c.pdf", "Alpha", "A", "a", false, 100, 100, false);
        seed(&conn, "/d.pdf", "Mid", "M", "m", false, 500, 500, false);

        for key in [SortKey::Title, SortKey::DateAdded, SortKey::Size] {
            for dir in [SortDir::Asc, SortDir::Desc] {
                for secondary in [None, Some(SortKey::Title), Some(SortKey::Size)] {
                    let q = Query {
                        q: String::new(),
                        tag_ids: Vec::new(),
                        favorites_only: false,
                        missing_only: false,
                        reading_only: false,
                        sort: key,
                        sort_dir: dir,
                        sort_secondary: secondary,
                    };
                    let page = search(&conn, &q, 0, 100, &covers()).unwrap();
                    let flags: Vec<bool> = page.rows.iter().map(|row| row.favorite).collect();
                    assert_eq!(
                        flags,
                        vec![true, true, false, false],
                        "pinning broken for {key:?} {dir:?} secondary {secondary:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn sort_whitelist_maps_known_keys_and_defaults_to_title_asc() {
        assert_eq!(
            parse_sort("date_added", "desc"),
            (SortKey::DateAdded, SortDir::Desc)
        );
        assert_eq!(parse_sort("size", "asc"), (SortKey::Size, SortDir::Asc));
        // Unknown values fall back to the default (UI-04), never raw SQL.
        assert_eq!(
            parse_sort("title; DROP TABLE documents;--", "sideways"),
            (SortKey::Title, SortDir::Asc)
        );
    }

    #[test]
    fn secondary_whitelist_maps_keys_and_treats_none_as_unset() {
        assert_eq!(parse_sort_secondary("title"), Some(SortKey::Title));
        assert_eq!(parse_sort_secondary("date_added"), Some(SortKey::DateAdded));
        assert_eq!(parse_sort_secondary("size"), Some(SortKey::Size));
        // "none" is the default (FR-13); unknown values never reach SQL.
        assert_eq!(parse_sort_secondary("none"), None);
        assert_eq!(parse_sort_secondary(""), None);
        assert_eq!(parse_sort_secondary("size; DROP TABLE documents;--"), None);
    }

    #[test]
    fn order_clause_with_no_secondary_is_the_shipped_clause() {
        let plain = Query {
            sort: SortKey::Size,
            sort_dir: SortDir::Desc,
            ..query("")
        };
        assert_eq!(
            order_clause(&plain),
            "ORDER BY d.favorite DESC, d.size DESC, d.id ASC"
        );
        // With a secondary: same direction as the primary (DR-81), id still last.
        let composed = Query {
            sort_secondary: Some(SortKey::Title),
            ..plain
        };
        assert_eq!(
            order_clause(&composed),
            "ORDER BY d.favorite DESC, d.size DESC, d.title COLLATE NOCASE DESC, d.id ASC"
        );
    }

    #[test]
    fn secondary_key_resolves_primary_ties_deterministically() {
        let conn = open_in_memory().unwrap();
        // Deliberately tied on date_added: only a secondary key separates them.
        seed(&conn, "/a.pdf", "Bravo", "B", "b", false, 300, 100, false);
        seed(&conn, "/b.pdf", "Alpha", "A", "a", false, 100, 100, false);
        seed(&conn, "/c.pdf", "Charlie", "C", "c", false, 200, 50, false);

        let titles_of = |secondary: Option<SortKey>, dir: SortDir| -> Vec<String> {
            let q = Query {
                sort: SortKey::DateAdded,
                sort_dir: dir,
                sort_secondary: secondary,
                ..query("")
            };
            search(&conn, &q, 0, 100, &covers())
                .unwrap()
                .rows
                .into_iter()
                .map(|row| row.title)
                .collect()
        };

        // No secondary: the shipped id tiebreak keeps insertion order.
        assert_eq!(
            titles_of(None, SortDir::Asc),
            vec!["Charlie", "Bravo", "Alpha"]
        );
        // Secondary title resolves the tie A→Z.
        assert_eq!(
            titles_of(Some(SortKey::Title), SortDir::Asc),
            vec!["Charlie", "Alpha", "Bravo"]
        );
        // The secondary follows the primary's direction (DR-81): Z→A inside the tie.
        assert_eq!(
            titles_of(Some(SortKey::Title), SortDir::Desc),
            vec!["Bravo", "Alpha", "Charlie"]
        );
        // A different secondary key resolves the same tie by size.
        assert_eq!(
            titles_of(Some(SortKey::Size), SortDir::Asc),
            vec!["Charlie", "Alpha", "Bravo"]
        );
        // ...and the same key under a descending primary descends inside the tie.
        assert_eq!(
            titles_of(Some(SortKey::Size), SortDir::Desc),
            vec!["Bravo", "Alpha", "Charlie"]
        );
    }

    #[test]
    fn slices_partition_the_full_ordering_without_gaps_or_overlap() {
        let conn = open_in_memory().unwrap();
        for i in 0..25 {
            seed(
                &conn,
                &format!("/f{i:02}.pdf"),
                &format!("Doc {i:02}"),
                "",
                "",
                false,
                10,
                i,
                false,
            );
        }
        let q = query("");
        let full: Vec<String> = search(&conn, &q, 0, 100, &covers())
            .unwrap()
            .rows
            .into_iter()
            .map(|row| row.title)
            .collect();
        let mut windowed: Vec<String> = Vec::new();
        let mut offset = 0;
        while offset < full.len() as i64 {
            let page = search(&conn, &q, offset, 10, &covers()).unwrap();
            assert_eq!(page.total, 25);
            windowed.extend(page.rows.into_iter().map(|row| row.title));
            offset += 10;
        }
        assert_eq!(windowed, full);
    }

    #[test]
    fn malformed_fts_query_triggers_the_like_fallback() {
        let conn = open_in_memory().unwrap();
        seed(
            &conn,
            "/a.pdf",
            "Quarterly Report",
            "",
            "",
            false,
            10,
            1,
            false,
        );
        // A bare operator is an FTS5 syntax error…
        let broken = search_with(&conn, &query("report"), Some("AND"), 0, 100, &covers());
        assert!(matches!(broken, Err(AppError::Db { .. })));
        // …and the permitted fallback returns the row via LIKE (R2.3).
        let page = search_like(&conn, &query("repo"), 0, 100, &covers()).unwrap();
        assert_eq!(page.total, 1);
    }

    #[test]
    fn like_fallback_escapes_wildcards_so_tokens_stay_literal() {
        let conn = open_in_memory().unwrap();
        seed(&conn, "/a.pdf", "100% done", "", "", false, 10, 1, false);
        seed(&conn, "/b.pdf", "100x done", "", "", false, 10, 2, false);
        let page = search_like(&conn, &query("100%"), 0, 100, &covers()).unwrap();
        assert_eq!(page.total, 1);
    }

    #[test]
    fn ids_query_returns_the_full_matching_set_in_list_order() {
        let conn = open_in_memory().unwrap();
        for i in 0..25 {
            seed(
                &conn,
                &format!("/f{i:02}.pdf"),
                &format!("Doc {i:02}"),
                "",
                "",
                i % 5 == 0,
                10,
                i,
                false,
            );
        }
        let all = ids(&conn, &query("doc")).unwrap();
        assert_eq!(all.len(), 25);
        let full_page = search(&conn, &query("doc"), 0, 100, &covers()).unwrap();
        assert_eq!(
            all,
            full_page.rows.iter().map(|row| row.id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn tag_names_travel_with_rows_for_badges() {
        let conn = open_in_memory().unwrap();
        conn.execute("INSERT INTO tags (name) VALUES ('beta')", [])
            .unwrap();
        conn.execute("INSERT INTO tags (name) VALUES ('Alpha')", [])
            .unwrap();
        let doc = seed(&conn, "/a.pdf", "Titled", "", "", false, 10, 1, false);
        for name in ["beta", "Alpha"] {
            let tag: i64 = conn
                .query_row("SELECT id FROM tags WHERE name = ?1", [name], |row| row.get(0))
                .unwrap();
            conn.execute(
                "INSERT INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![doc, tag],
            )
            .unwrap();
        }
        let page = search(&conn, &query("titled"), 0, 100, &covers()).unwrap();
        assert_eq!(page.rows[0].tags, vec!["Alpha", "beta"]);
    }

    // DR-237 (AC-100): `map_row` delivers `cover_path` only when the cached
    // cover exists — an unprepared row carries no path (glyph, no request),
    // and the path appears with the file, which is what the completion
    // re-query (DR-231) then carries empty→real.
    #[test]
    fn cover_path_is_delivered_only_when_the_cache_file_exists() {
        use crate::testutil::TempDir;
        let conn = open_in_memory().unwrap();
        let temp = TempDir::new("query-cover-gate");
        let covers_dir = temp.path().join("covers");
        std::fs::create_dir(&covers_dir).unwrap();
        // `seed` sets mtime to the size (10); the cache key follows the row.
        seed(&conn, "/one.pdf", "One", "", "", false, 10, 1, false);
        let cached = crate::covers::cache_path(&covers_dir, "/one.pdf", 10, 10);

        let page = search(&conn, &query("one"), 0, 100, &covers_dir).unwrap();
        assert_eq!(page.rows[0].cover_path, "", "no cached cover yet — no path delivered");

        std::fs::write(&cached, b"png").unwrap();
        let page = search(&conn, &query("one"), 0, 100, &covers_dir).unwrap();
        assert_eq!(page.rows[0].cover_path, cached.to_string_lossy());
    }
}
