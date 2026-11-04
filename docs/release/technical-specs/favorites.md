# Favorites — technical reference

**Since v0.0.1** · Requirements: FR-04 (interacts FR-13) · User guide: [features/favorites.md](../features/favorites.md) · Spec: [SPEC-v0.0.1-favorites.md](../../specs/SPEC-v0.0.1-favorites.md)

## Model

- `documents.favorite INTEGER NOT NULL DEFAULT 0`.
- `library_set_favorite(id, value)` — single-row update; also reachable through `library_update_document` from the editor.
- Favorites view = `favorites_only=true` on `library_search` (a virtual filter, not a category). Count comes from the status aggregate (`status_updated`, FR-15).

## Ordering invariant (FR-04, FR-13)

Every list query in `library/query.rs` composes `ORDER BY d.favorite DESC, <sort> <dir>, d.id ASC` — one shared query builder, so no query path can forget it (verified for every sort key/direction in service tests).

## UI (`ui/src/`)

- `StarButton.svelte` — since v0.0.3 it is one entry of the row's hover/focus-revealed actions line (`RowActions`, `ROW_ACTION_IDS` includes `favorite`), not a permanent element of the row or card (UI-03 as modified, opening-and-deleting.md). Same component, same kit Switch, same global `.star` chrome per DR-56; also in the editor; calls `library_set_favorite`, then `#applyRow` updates the row in place. Consequence stated in the requirement rather than hidden: a favorited document carries no persistent marker in either view; favorite state is visible through the Favorites view, through Details, and through the star's own state whenever the line is shown.
- Agreed no-mid-scroll-jump behavior: after a star toggle the row stays where it is; the new pinned position takes effect when the query next re-runs (filter/view change). This is deliberate design, not an omission.
- The sidebar "Favorites" row was deleted with the sidebar (v0.0.2) and the status-bar favorites chip with the conditional status bar (v0.0.3, UI-15). The count now appears as trailing text on the Browse menu's *Favorites* item and in the Settings dialog's Library section, both from the same `status_updated` payload.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | pinning under every sort key/direction, AND-combination with category/search filters, favorites_only filter |
| `scripts/ui-smoke.mjs` | starring updates the counts; the row does not jump mid-scroll; the Favorites view shows exactly the starred document; the pinned position appears on the next query; unstarring clears the count; **v0.0.3:** the star is present in the actions line and hidden at rest (`flowRowDesign`), the BulkBar's favorite action applies to a selection and lifts it again in Select mode (`flowSelectMode`), and the *Favorites* item carries the count as a checked item (`flowFavorites`, `flowCategoriesMulti`) |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-favorites.md; behavior verified as designed (no-jump rule honored; verified end-to-end in the app).
- 2026-11-04 (v0.0.3 — presentation only) — The star moved from a permanent row element into the hover/focus actions line, and the favorites count moved from the status bar to the Browse menu and the Settings dialog (UI-03, UI-15). **The model is untouched**: `documents.favorite`, `library_set_favorite`, the pinning clause and the no-jump rule are the v0.0.1 behavior, and the Rust tests here are unchanged. Verified by `flowFavorites`, `flowRowDesign` and `flowSelectMode` (bulk favorite on a selection, both directions).
