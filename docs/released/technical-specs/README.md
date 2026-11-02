# Technical Specs — Developer Reference

Deep technical documentation for each feature: design, modules, data model, invariants, and test mapping. For developers and coding agents; end users read `docs/released/features/` instead.

One document per feature, same slug as its user-guide page. The binding requirement text always lives in the release specs (`docs/specs/INDEX.md`); these documents describe **how each feature is implemented** and carry a per-release change history.

## Feature map

| Technical doc | User guide page | Requirements | Status |
|---|---|---|---|
| [getting-started.md](getting-started.md) | getting-started | NFR-03/04/05, UI-01 | Planned v0.0.1 |
| [importing-pdfs.md](importing-pdfs.md) | importing-pdfs | FR-10, FR-11, AC-01 | Planned v0.0.1 |
| [categories.md](categories.md) | categories | FR-02, FR-07, AC-03 | Planned v0.0.1 |
| [searching.md](searching.md) | searching | FR-03, NFR-02/07, AC-02 | Planned v0.0.1 |
| [metadata-editing.md](metadata-editing.md) | metadata-editing | FR-05, FR-06 | Planned v0.0.1 |
| [favorites.md](favorites.md) | favorites | FR-04 | Planned v0.0.1 |
| [sorting-and-views.md](sorting-and-views.md) | sorting-and-views | FR-13, FR-14, NFR-01 | Planned v0.0.1 |
| [covers.md](covers.md) | covers | FR-16, AC-06 | Planned v0.0.1 |
| [opening-and-deleting.md](opening-and-deleting.md) | opening-and-deleting | FR-08, FR-09, AC-04 | Planned v0.0.1 |
| [missing-files-relinking.md](missing-files-relinking.md) | missing-files-relinking | FR-12, AC-05 | Planned v0.0.1 |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | keyboard-shortcuts | NFR-06 | Planned v0.0.1 |

"Planned vX.Y.Z" = specced, not implemented. A document flips to *Since vX.Y.Z* only at the release Ship commit (AGENTS workflow 5), which also appends its change-history entry.

## Maintenance rules (AGENTS §2a, RULES R8.6)

- A document is created when its feature enters an APPROVED feature-release spec — content derived from the spec and the agreed architecture (spec §6, RULES.md). Never from guesses.
- Every release that touches a feature appends a dated change-history entry ("v0.1.0: …") and updates the design sections to match the code as released.
- Documents are never deleted; removed features stay with a "Removed in v…" marker.

## Cross-references

- Requirements authority: `docs/specs/SPEC-v*.md` (via INDEX)
- User-facing behavior: `docs/released/features/`
- Code rules: `RULES.md`
