# Favorites — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-04). Not implemented.

## Model

- `documents.favorite INTEGER NOT NULL DEFAULT 0` (0/1).
- `library_set_favorite(id, value)` — single-row update; also reachable from the editor modal via `library_update_document`.

## Ordering invariant (FR-04, FR-13)

Every list/search query uses `ORDER BY favorite DESC, <current sort>` — favorited documents are pinned first regardless of sort key and view. Enforced in one shared query-builder helper in `src-tauri/src/library/` so no query path can forget it.

## Sidebar

"Favorites" is a virtual filter (`favorites_only=true` on `library_search`), not a category row. Count comes from the same status-bar aggregate query (FR-15).

## Tests / acceptance

- Service test: pinning holds under every sort key/direction; combination with category+search filters (AND semantics).

## Change history
- v0.0.1 (planned): introduced.
