# Feature spec: Favorites — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `favorites` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-04 | **Favorites.** Star/unstar a document. Favorited documents sort to the top of every list. A "Favorites" filter entry exists in the sidebar. | **AGREED** (DR-08) |

Depends on: parent UI-01 (sidebar), FR-13 (sort pinning interaction — see SPEC-v0.0.1-sorting-and-views.md).

## Technical design
### Model

- `documents.favorite INTEGER NOT NULL DEFAULT 0` (0/1).
- `library_set_favorite(id, value)` — single-row update; also reachable from the editor modal via `library_update_document`.

### Ordering invariant (FR-04, FR-13)

Every list/search query uses `ORDER BY favorite DESC, <current sort>` — favorited documents are pinned first regardless of sort key and view. Enforced in one shared query-builder helper in `src-tauri/src/library/` so no query path can forget it.

### Sidebar

"Favorites" is a virtual filter (`favorites_only=true` on `library_search`), not a category row. Count comes from the same status-bar aggregate query (FR-15).

### UI (parent §5.3)

- **StarButton.svelte** in rows and cards: 20px, outline when off, filled in `--accent` when on → `library_set_favorite(id, value)`. Only that row's component re-renders (§5.3.5).
- **No mid-scroll jump**: after a star toggle the row stays where it is; the new pinned position takes effect when the query is next re-run (filter/sort change, or returning to the top and re-slicing). Re-sorting the list under the user's cursor on every star would move rows out from under the pointer for no benefit.
- Sidebar **"Favorites"** row with its count from `status_updated`: visually a filter row like a category row but carrying the star glyph instead of a tag — it is a virtual filter (`favorites_only=true`), not a category.
- The editor modal exposes the same toggle (UI-02). No extra "pinned" styling beyond ordering: favorites lead every list in both views (FR-04).

### Tests / acceptance

- Service test: pinning holds under every sort key/direction; combination with category+search filters (AND semantics).

## Cross-references

User guide: `docs/released/features/favorites.md`.

---

## Build ledger

Retrofitted 2026-11-03 per DR-71 (one-time exception to the frozen-spec rule; recorded in `SPEC-v0.0.2.md`). Status reflects the verified state at the implementation/Ship commit `af70f77`.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-04 | Rust core + commands + UI | ✅ | af70f77 | `library` tests (pinning under every sort key/direction, `favorites_only` filter, AND-combination with category/search filters); smoke flowFavorites |
