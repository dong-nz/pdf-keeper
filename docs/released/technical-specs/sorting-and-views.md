# Sorting & views — technical reference

**Since v0.0.1** · Requirements: FR-02, FR-04, FR-13, UI-04 · User guide: [features/sorting-and-views.md](../features/sorting-and-views.md) · Spec: [SPEC-v0.0.1-sorting-and-views.md](../../specs/SPEC-v0.0.1-sorting-and-views.md)

## Query composition (`src-tauri/src/library/query.rs`)

- `parse_sort(sort, dir)` whitelists the sort parameters — `"title"` (default), `"date_added"`, `"size"`, direction `asc|desc`; nothing user-supplied reaches SQL as a string (no injection surface).
- Every list query (search, like-fallback, ids, favorites, category filters) composes one shared ORDER: `ORDER BY d.favorite DESC, <sort_column> <dir>, d.id ASC` — favorites pinned (FR-04/FR-13), title compared `COLLATE NOCASE`, `d.id` tiebreak makes the order total and stable.
- Title/author/notes/filename search and the LIKE fallback are specified in searching.md; category/favorites filters in categories.md / favorites.md — all share this builder.

## Views (UI-04)

- List (virtualized rows, `ui/src/lib/virtual.ts`) and grid (cards, 220×311 cover aspect) render the same `DocumentDto` stream; switching view does not re-query.
- Virtualization renders only the visible window — off-screen rows are not in the DOM (a fact the UI smoke harness must respect).

## Persistence (DR-44)

- View mode, sort key/direction and last filter persist in the `settings` table via `app_get_settings` / `app_set_setting`; the UI store (`ui/src/lib/state/settings.svelte.ts`) reads once at startup and writes debounced. Restored on next launch (startup gate in `lib.rs` ensures the first `status_updated` is delivered).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | pinning under every sort key × direction, stable tiebreak, whitelist mapping incl. unknown values falling back to defaults |
| `scripts/ui-smoke.mjs` | grid/list switch renders the same library with covers; controls keyboard-reachable |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-sorting-and-views.md; verified as designed (single ORDER builder, whitelisted sort keys, settings persistence through SQLite).
