# Search — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-03; NFR-01/02/07; AC-02). Not implemented.

## Index

- SQLite **FTS5** virtual table `documents_fts(title, filename, author, notes)` keyed to `documents(rowid)` (rusqlite bundled build, DR-14).
- Sync: INSERT/UPDATE/DELETE triggers on `documents` keep the FTS index consistent inside the same transaction as every mutation — no separate reindex step.
- Prefix matching: query tokens compiled to FTS5 prefix syntax (`tok*`) — `repo` matches "Report" (FR-03). Multiple tokens AND-combined.

## Query composition

`library_search(query, category_id?, favorites_only?, sort, page)`:
1. FTS MATCH on the compiled query (or all rows when query empty).
2. AND with category filter (join) and favorites filter.
3. ORDER: `favorite DESC, <sort column> <dir>` — favorites always pinned first (FR-13).
4. Windowed rows only (NFR-01): the UI requests slices as it scrolls.

## Latency budget (NFR-02)

- Search response < 100 ms at 10 000 documents — AC-02 asserts timing.
- UI debounces input ~150 ms (NFR-07) and cancels superseded in-flight queries.

## Out of scope

No content/full-text search of PDF bodies (DR-01); no fuzzy matching; no stemming beyond FTS5 defaults.

## Tests / acceptance

- AC-02: prefix hits across all four fields at 10 000 docs with timing assertion; filter-combination tests (category ∧ favorites ∧ query).

## Change history
- v0.0.1 (planned): introduced.
