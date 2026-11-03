# Favorites — technical reference

**Since v0.0.1** · Requirements: FR-04 (interacts FR-13) · User guide: [features/favorites.md](../features/favorites.md) · Spec: [SPEC-v0.0.1-favorites.md](../../specs/SPEC-v0.0.1-favorites.md)

## Model

- `documents.favorite INTEGER NOT NULL DEFAULT 0`.
- `library_set_favorite(id, value)` — single-row update; also reachable through `library_update_document` from the editor.
- Favorites view = `favorites_only=true` on `library_search` (a virtual filter, not a category). Count comes from the status aggregate (`status_updated`, FR-15).

## Ordering invariant (FR-04, FR-13)

Every list query in `library/query.rs` composes `ORDER BY d.favorite DESC, <sort> <dir>, d.id ASC` — one shared query builder, so no query path can forget it (verified for every sort key/direction in service tests).

## UI (`ui/src/`)

- `StarButton.svelte` in rows/cards (kit Switch, global `.star` chrome per DR-56) and in the editor; calls `library_set_favorite`, then `#applyRow` updates the row in place.
- Agreed no-mid-scroll-jump behavior: after a star toggle the row stays where it is; the new pinned position takes effect when the query next re-runs (filter/view change). This is deliberate design, not an omission.
- Sidebar "Favorites" row (virtual filter) with live count; status-bar favorites chip.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | pinning under every sort key/direction, AND-combination with category/search filters, favorites_only filter |
| `scripts/ui-smoke.mjs` | starring updates the counts; the row does not jump mid-scroll; the Favorites view shows exactly the starred document; the pinned position appears on the next query; unstarring clears the count |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-favorites.md; behavior verified as designed (no-jump rule honored; verified end-to-end in the app).
