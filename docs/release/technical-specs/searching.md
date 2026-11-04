# Search — technical reference

**Since v0.0.1 · design updated in v0.0.2** · Requirements: FR-03 (parent NFR-01, NFR-02, NFR-07) · User guide: [features/searching.md](../features/searching.md) · Specs: [SPEC-v0.0.1-searching.md](../../specs/SPEC-v0.0.1-searching.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §3.2 (the shared builder's filter clause)

## Index (`src-tauri/src/library/`)

- SQLite **FTS5** virtual table `documents_fts(title, filename, author, notes)`, external-content keyed to `documents(rowid)` (rusqlite bundled, DR-14).
- INSERT/UPDATE/DELETE triggers on `documents` keep the index consistent inside the same transaction as every mutation — no reindex step.
- Query tokens compile to FTS5 prefix syntax (`tok*`); multiple tokens AND-combine (`library/query.rs`).

## Query composition — `library_search(query, category_ids, favorites_only, missing_only, sort, dir, sort_secondary, offset, limit)`

1. FTS MATCH on the compiled query, or all rows when the query is empty.
2. AND with the **category id set** (v0.0.2: `category_ids: Vec<i64>` → one `EXISTS (… dc.category_id IN (?, …))` clause, the union, no clause when the list is empty) and with the favorites/missing mode — filters combine with AND semantics: `(category A OR category B) AND mode AND terms` (categories.md, FR-02 as modified).
3. `ORDER BY d.favorite DESC, <whitelisted primary> <dir>[, <whitelisted secondary> <dir>], d.id ASC` — favorites pinned first under every sort (`query.rs::parse_sort` / `parse_sort_secondary` whitelist sort/dir/secondary; no free-form SQL from user input, R2.2; sorting-and-views.md).
4. Windowed slices only (NFR-01): the UI requests slices as it scrolls. `library_ids` carries the same filter and sort parameters (the bulk-selection id set must describe the same result set).

Latency: AC-02 asserts < 100 ms at 10 000 documents (`service.rs` test with timing assertion). Out of scope: PDF body/full-text, fuzzy matching, stemming beyond FTS5 defaults. Search semantics themselves are unchanged in v0.0.2 — only the shared builder's category clause and ORDER gained the second key.

## UI (`ui/src/`)

- `components/SearchBox.svelte` — input with immediate local echo; queries go through `lib/debounce.ts` (150 ms, NFR-07); a clear (×) button appears when non-empty; `Esc` while focused clears the search and stops propagation (innermost-consumer rule, §5.2); `Ctrl+F` focuses + selects via the global handler, and Ctrl+F *inside* the box selects the text locally (DR-57).
- `state/library.svelte.ts` — `#querySeq` stale-response guard: superseded query results are discarded, never rendered; a result set is assigned in one write (R4.3) and the scroll resets. Every filter change (search text, category set, mode, sort) goes through the single `setFilter` path that re-queries from offset 0.
- `components/FilterChips.svelte` — one removable chip per active condition. In v0.0.2 it is the visible state of the whole filter: a chip per active category id (label from the category list; a chip whose category no longer exists reads "That category no longer exists."), plus a chip for the Favorites/Missing mode; removing a chip calls the same `setFilter` path with that condition dropped. Status-bar counts stay library-wide regardless of filters (FR-15 invariant). No matched-term highlighting in v0.0.1 (needs backend match offsets).
- `EmptyState` variant "No documents match …" with a Clear action.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/query.rs` + `service.rs` tests | prefix hits on all four fields, token AND-combination, filter combinations (category ∧ favorites ∧ query), favorites pinning under every sort, < 100 ms at 10 000 docs (AC-02); **v0.0.2:** the union test and the composition tests `(A OR B) ∧ mode ∧ terms` live in `query.rs::several_active_categories_select_the_union` (categories.md), and the pinning matrix now runs over secondary keys too (sorting-and-views.md) |
| `ui/src/lib/debounce.test.ts` | a burst collapses to one trailing call with the last arguments; window restart; gap starts a new burst; `cancel()` (the burst-count assertion moved here from the UI script — DR-57) |
| `scripts/ui-smoke.mjs` | debounced search reaches the correct result set; stale responses never rendered; Esc clears the search and restores the full list; **v0.0.2:** `flowCategoriesMulti` asserts search ∧ several categories behaves as the union AND the terms |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-searching.md, corrected to the verified code: `missing_only` is part of the same query composition; SearchBox-local Ctrl+F select added (DR-57); debounce verification moved to the Vitest pure-logic scope (DR-57).
- 2026-11-04 (v0.0.2 — builder touched by FR-02 MODIFIED and FR-13 MODIFIED) — No change to search semantics or to the FTS index. The shared builder gained `category_ids: Vec<i64>` (one `EXISTS … IN (…)` union clause, absent when empty) and an optional whitelisted secondary key in the ORDER clause, and `FilterChips.svelte` became the visible state of the whole active filter rather than of the search text alone. Verified through the categories and sorting test mappings; `flowCategoriesMulti` covers search terms combined with two active categories.
