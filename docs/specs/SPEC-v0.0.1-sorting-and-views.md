# Feature spec: Sorting & views — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `sorting-and-views` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

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

## Cross-references

Implementation design: `docs/released/technical-specs/sorting-and-views.md` · User guide: `docs/released/features/sorting-and-views.md`.
