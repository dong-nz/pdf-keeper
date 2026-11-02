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

### Tests / acceptance

- Service test: pinning holds under every sort key/direction; combination with category+search filters (AND semantics).

## Cross-references

User guide: `docs/released/features/favorites.md`.
