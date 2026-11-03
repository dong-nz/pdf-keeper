# Search — technical reference

**Since v0.0.1** · Requirements: FR-03 (parent NFR-01, NFR-02, NFR-07) · User guide: [features/searching.md](../features/searching.md) · Spec: [SPEC-v0.0.1-searching.md](../../specs/SPEC-v0.0.1-searching.md)

## Index (`src-tauri/src/library/`)

- SQLite **FTS5** virtual table `documents_fts(title, filename, author, notes)`, external-content keyed to `documents(rowid)` (rusqlite bundled, DR-14).
- INSERT/UPDATE/DELETE triggers on `documents` keep the index consistent inside the same transaction as every mutation — no reindex step.
- Query tokens compile to FTS5 prefix syntax (`tok*`); multiple tokens AND-combine (`library/query.rs`).

## Query composition — `library_search(query, category_id, favorites_only, missing_only, sort, dir, offset, limit)`

1. FTS MATCH on the compiled query, or all rows when the query is empty.
2. AND with category (join) and favorites/missing filters — filters combine with AND semantics.
3. `ORDER BY d.favorite DESC, <whitelisted sort column> <dir>, d.id ASC` — favorites pinned first under every sort (`query.rs::parse_sort` whitelists sort/dir; no free-form SQL from user input, R2.2).
4. Windowed slices only (NFR-01): the UI requests slices as it scrolls.

Latency: AC-02 asserts < 100 ms at 10 000 documents (`service.rs` test with timing assertion). Out of scope: PDF body/full-text, fuzzy matching, stemming beyond FTS5 defaults.

## UI (`ui/src/`)

- `components/SearchBox.svelte` — input with immediate local echo; queries go through `lib/debounce.ts` (150 ms, NFR-07); a clear (×) button appears when non-empty; `Esc` while focused clears the search and stops propagation (innermost-consumer rule, §5.2); `Ctrl+F` focuses + selects via the global handler, and Ctrl+F *inside* the box selects the text locally (DR-57).
- `state/library.svelte.ts` — `#querySeq` stale-response guard: superseded query results are discarded, never rendered; a result set is assigned in one write (R4.3) and the scroll resets.
- `components/FilterChips.svelte` — one removable chip per active condition; status-bar counts stay library-wide regardless of filters (FR-15 invariant). No matched-term highlighting in v0.0.1 (needs backend match offsets).
- `EmptyState` variant "No documents match …" with a Clear action.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/query.rs` + `service.rs` tests | prefix hits on all four fields, token AND-combination, filter combinations (category ∧ favorites ∧ query), favorites pinning under every sort, < 100 ms at 10 000 docs (AC-02) |
| `ui/src/lib/debounce.test.ts` | a burst collapses to one trailing call with the last arguments; window restart; gap starts a new burst; `cancel()` (the burst-count assertion moved here from the UI script — DR-57) |
| `scripts/ui-smoke.mjs` | debounced search reaches the correct result set; stale responses never rendered; Esc clears the search and restores the full list |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-searching.md, corrected to the verified code: `missing_only` is part of the same query composition; SearchBox-local Ctrl+F select added (DR-57); debounce verification moved to the Vitest pure-logic scope (DR-57).
