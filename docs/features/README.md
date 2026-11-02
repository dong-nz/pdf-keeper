# PDF Manager — User Guide

Feature documentation written as a user guide. Each page covers one user-facing capability and maps to requirement IDs in the current spec (`docs/specs/INDEX.md`).

## Page status legend

| Marker | Meaning |
|---|---|
| 📝 **Draft** | Behavior agreed in the spec, but the application is not implemented yet — usage text is planned, not verified |
| ✅ **Shipped in v…** | Implemented and verified; text describes real, tested behavior |

**Current state: every page is Draft.** Implementation has not been approved. Pages flip to Shipped only at the Ship step (AGENTS.md workflow 5), where verified usage details and real limitations are added.

## Pages

| Page | Covers | Status |
|---|---|---|
| [getting-started.md](getting-started.md) | Install, first run, layout tour | 📝 Draft |
| [importing-pdfs.md](importing-pdfs.md) | FR-10, FR-11 | 📝 Draft |
| [categories.md](categories.md) | FR-02, FR-07 | 📝 Draft |
| [searching.md](searching.md) | FR-03 | 📝 Draft |
| [metadata-editing.md](metadata-editing.md) | FR-05, FR-06 | 📝 Draft |
| [favorites.md](favorites.md) | FR-04 | 📝 Draft |
| [sorting-and-views.md](sorting-and-views.md) | FR-13, FR-14 | 📝 Draft |
| [covers.md](covers.md) | FR-16 | 📝 Draft |
| [opening-and-deleting.md](opening-and-deleting.md) | FR-08, FR-09 | 📝 Draft |
| [missing-files-relinking.md](missing-files-relinking.md) | FR-12 | 📝 Draft |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | NFR-06 | 📝 Draft |

## Maintenance rules (AGENTS.md §2a)

- A page is created when its capability enters an approved spec/change — drafted from spec text, never invented.
- A page flips to Shipped only in the Ship commit, with verified behavior; shipped pages are amended by added "Amendment" notes, never rewritten.
- Capabilities removed from the product keep their page marked `REMOVED in v…`.
