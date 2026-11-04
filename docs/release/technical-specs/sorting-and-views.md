# Sorting & views — technical reference

**Since v0.0.1 · design updated in v0.0.2** · Requirements: FR-02, FR-04, FR-13 (MODIFIED in v0.0.2, DR-81), UI-04, UI-08 · User guide: [features/sorting-and-views.md](../features/sorting-and-views.md) · Specs: [SPEC-v0.0.1-sorting-and-views.md](../../specs/SPEC-v0.0.1-sorting-and-views.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (FR-13), §3.4 (UI-08), §3.5

## Query composition (`src-tauri/src/library/query.rs`)

- `parse_sort(sort, dir)` whitelists the primary sort parameters — `"title"` (default), `"date_added"`, `"size"`, direction `asc|desc`; `parse_sort_secondary(key)` whitelists the **secondary key** (FR-13 as modified in v0.0.2): `"title" | "date_added" | "size"` map to a `SortKey`, `"none"` and any unknown value map to `None`. Nothing user-supplied reaches SQL as a string (no injection surface, R2.2).
- Every list query (search, like-fallback, ids, favorites, category filters) composes one shared ORDER: `ORDER BY d.favorite DESC, <primary> <dir>[, <secondary> <dir>], d.id ASC` — favorites pinned (FR-04/FR-13), title compared `COLLATE NOCASE`, the secondary key **in the primary's direction** (DR-81: one direction control, not two), `d.id` last so the order is total and stable. With no secondary key the clause is byte-identical to v0.0.1 (AC-09's "byte-identical to v0.0.1 ordering" check).
- Title/author/notes/filename search and the LIKE fallback are specified in searching.md; category/favorites filters in categories.md / favorites.md — all share this builder.

## Views (UI-04, UI-08)

- List (virtualized rows, `ui/src/lib/virtual.ts`) and grid (cards, 220×311 cover aspect) render the same `DocumentDto` stream; switching view does not re-query.
- **v0.0.2: `ViewToggle.svelte` is deleted.** `components/ViewMenu.svelte` is one dropdown: *List view* / *Grid view* (current mode checked, `aria-checked`), separator, then a **Columns** control — *Auto* (checked when the setting is `"auto"`) and a `−` / count / `+` row. Per DR-86 the row shows **the count in effect** (the Auto count while Auto) and `−` / `+` step from it, disabled only at the bounds `GRID_COLUMNS_MIN = 2` / `GRID_COLUMNS_MAX = 10`, so the control is reachable from the shipped default. Choosing a count sets `settings.gridColumns`; choosing *Auto* clears it.
- `gridLayout(containerWidth, override)` (`lib/virtual.ts`): Auto computes `max(1, floor((width + gap) / (cardWidth + gap)))`; a manual override is clamped to 2–10 **and then to what the width can hold** (`floor((width + gap) / (MIN_CARD_WIDTH + gap))`), and the card width is derived from the resulting column count and clamped to `MIN_CARD_WIDTH`. The clamp is a pure function, so the same value applies at every window width and is unit-testable (AC-10).
- `lib/state/layout.svelte.ts` (new, DR-86) owns the measured document-area width and the derived Auto count (`areaWidth`, `autoColumns = gridLayout(areaWidth, null).columns`); `DocumentArea` measures into it via a resize effect instead of holding a local `containerWidth`, which is what lets the View menu display the effective count.
- Virtualization renders only the visible window — off-screen rows are not in the DOM (a fact the UI smoke harness must respect).

## Persistence (DR-44)

- View mode, grid column override, sort key/direction/secondary key and last filter persist in the `settings` table via `app_get_settings` / `app_set_setting`; the UI store (`ui/src/lib/state/settings.svelte.ts`) reads once at startup and writes debounced. Restored on next launch (startup gate in `lib.rs` ensures the first `status_updated` is delivered). Settings keys: `view`, `grid_columns` (`"auto"` or `2..=10`, validated by `is_valid_grid_columns`), `sort`, `dir`, `sort_secondary` (`none|title|date_added|size`), `last_filter` (grammar in categories.md). An invalid stored value is rejected by `set_setting` as `AppError::Validation`, and a corrupt stored value falls back to the default on read.
- **Writes are batched, not per-key (AC-09 fix):** one trailing-edge `debounce` (300 ms) collects every changed key into a `Map<key, value>` and flushes each distinct key once with its last value. A separate debounced function per key silently dropped all but the last write of a tick — changing sort plus secondary plus filter in one action persisted only the last key. Regression test: `ui/src/lib/state/settings.test.ts` (fails against the per-key form, passes against the batch).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | pinning under every sort key × direction **× secondary ∈ {none, title, size}** ("pinning broken for …" assertion), stable tiebreak, whitelist mapping incl. unknown values falling back to defaults; **v0.0.2:** `secondary_whitelist_maps_keys_and_treats_none_as_unset`, `order_clause` composition asserted as strings (no secondary → the v0.0.1 clause; with secondary → the extra column in the primary's direction before `d.id`), `secondary_key_resolves_primary_ties_deterministically` (AC-09: exact ordering primary→secondary→id) |
| `ui/src/lib/virtual.test.ts` | Auto column computation; manual override clamped to 2–10 and to the width's capacity; card width derivation; **v0.0.2:** mixed-height row offsets (see metadata-editing.md) |
| `ui/src/lib/state/settings.test.ts` | **v0.0.2 (AC-09):** a multi-key change in one tick persists every key with its last value |
| `scripts/ui-smoke.mjs` | grid/list switch renders the same library with covers; controls keyboard-reachable. **v0.0.2:** `flowSortSecondary` (secondary key changes the order of tied titles, persists, `None` restores the v0.0.1 order) and `flowViewColumns` (Auto reproduces the width-computed count, a manual count changes the card width and column count, `−`/`+` clamp at 2 and 10, the choice survives a restart) |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-sorting-and-views.md; verified as designed (single ORDER builder, whitelisted sort keys, settings persistence through SQLite).
- 2026-11-04 (v0.0.2 — FR-13 MODIFIED, UI-08 ADDED; DR-81, DR-86) — **Secondary sort key** (`Then by…`): whitelisted `parse_sort_secondary`, inserted into the one shared ORDER clause in the primary's direction, `d.id` still last; with `none` the emitted SQL is byte-identical to v0.0.1. **The two-button view toggle was replaced by one View menu** with a grid column override (Auto or a manual 2–10 count, clamped to what the width fits), the counter showing the count in effect so it is reachable from Auto (DR-86), and `lib/state/layout.svelte.ts` as the single owner of the measured area width. **Settings writes became a batched flush** after AC-09 failed in the real app: the per-key trailing-edge debounce dropped every write but the last of a tick (`settings.test.ts` is the failing-before/passing-after regression test). Verified by the `query.rs` order tests, `virtual.test.ts`, `settings.test.ts` and the smoke flows `flowSortSecondary` / `flowViewColumns`.
