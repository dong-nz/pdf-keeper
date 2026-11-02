# Feature spec: Sorting & views — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `sorting-and-views` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-13 | **Sorting.** Sort library by title, date added, file size (asc/desc); default title A→Z; favorites always pinned first. | **AGREED** (DR-16) |
| FR-14 | **Views.** Table (list) view and card (grid) view, switchable by the user; both virtualized (NFR-01). | **AGREED** (DR-16) |

## Interface items

| ID | Requirement | Status |
|---|---|---|
| UI-03 | Row content: selection checkbox, favorite star, cover thumbnail, title, category badges, filename, size, date added, missing badge, action buttons. Grid cards show the cover as the card image. | **AGREED** (DR-16) |
| UI-04 | Default sort: title A→Z (favorites always first). | **AGREED** (DR-16) |

Depends on: parent NFR-01 (virtualization, bounded DOM), FR-04 (pinning), SPEC-v0.0.1-covers.md (thumbnails in rows/cards).

## Technical design
### Sorting

- Allowed keys: `title`, `date_added`, `size`; directions asc/desc. The command layer maps sort parameters through a **whitelist** — no free-form SQL, so no injection surface.
- Default: title A→Z (UI-04); favorites always first (see favorites.md).
- Choice persisted in app settings (user-data directory), restored at startup.

### Views (virtualization, NFR-01)

- **List:** table rows — checkbox, star, cover thumbnail, title, category badges, filename, size, date added, missing badge, actions (UI-03).
- **Grid:** cards, cover as card image.
- Both views render only the visible window plus a small overscan buffer; row height fixed per mode so the scroll window is computable. DOM node count stays bounded at tens of thousands of documents.
- Row data arrives as slices from `library_search` (offset/limit) — the client never loads the whole library.
- View choice persisted in app settings.

### Tests / acceptance

- Query-builder unit tests: whitelist mapping, ordering composition, slice correctness.
- Virtualization is proven in the UI smoke script (frame budget at fixture scale), not unit-tested.

## Cross-references

User guide: `docs/released/features/sorting-and-views.md`.
