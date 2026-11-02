# Technical Specs — Developer Reference

Deep technical documentation for each feature: design, modules, data model, invariants, and test mapping. For developers and coding agents; end users read `docs/released/features/` instead.

One document per feature, same slug as its user-guide page. The binding requirement text always lives in the release specs (`docs/specs/INDEX.md`); these documents describe **how each feature is implemented** and carry a per-release change history.

## Feature map

Authoritative requirement→feature mapping is the parent spec's feature index (`docs/specs/SPEC-v0.0.1.md` §3); this table mirrors it.

| Technical doc | Feature spec | User guide page | Requirements | Status |
|---|---|---|---|---|
| [getting-started.md](getting-started.md) | — (parent §4/§5) | [getting-started](../features/getting-started.md) | FR-01, NFR-01…05, UI-01, AC-07 | Planned v0.0.1 |
| [importing-pdfs.md](importing-pdfs.md) | [SPEC-v0.0.1-importing-pdfs.md](../../specs/SPEC-v0.0.1-importing-pdfs.md) | [importing-pdfs](../features/importing-pdfs.md) | FR-10, FR-11, AC-01 | Planned v0.0.1 |
| [categories.md](categories.md) | [SPEC-v0.0.1-categories.md](../../specs/SPEC-v0.0.1-categories.md) | [categories](../features/categories.md) | FR-02, FR-07, AC-03 | Planned v0.0.1 |
| [searching.md](searching.md) | [SPEC-v0.0.1-searching.md](../../specs/SPEC-v0.0.1-searching.md) | [searching](../features/searching.md) | FR-03, AC-02 | Planned v0.0.1 |
| [metadata-editing.md](metadata-editing.md) | [SPEC-v0.0.1-metadata-editing.md](../../specs/SPEC-v0.0.1-metadata-editing.md) | [metadata-editing](../features/metadata-editing.md) | FR-05, FR-06, UI-02 | Planned v0.0.1 |
| [favorites.md](favorites.md) | [SPEC-v0.0.1-favorites.md](../../specs/SPEC-v0.0.1-favorites.md) | [favorites](../features/favorites.md) | FR-04 | Planned v0.0.1 |
| [sorting-and-views.md](sorting-and-views.md) | [SPEC-v0.0.1-sorting-and-views.md](../../specs/SPEC-v0.0.1-sorting-and-views.md) | [sorting-and-views](../features/sorting-and-views.md) | FR-13, FR-14, UI-03, UI-04 | Planned v0.0.1 |
| [covers.md](covers.md) | [SPEC-v0.0.1-covers.md](../../specs/SPEC-v0.0.1-covers.md) | [covers](../features/covers.md) | FR-16, AC-06 | Planned v0.0.1 |
| [opening-and-deleting.md](opening-and-deleting.md) | [SPEC-v0.0.1-opening-and-deleting.md](../../specs/SPEC-v0.0.1-opening-and-deleting.md) | [opening-and-deleting](../features/opening-and-deleting.md) | FR-08, FR-09, AC-04 | Planned v0.0.1 |
| [missing-files-relinking.md](missing-files-relinking.md) | [SPEC-v0.0.1-missing-files-relinking.md](../../specs/SPEC-v0.0.1-missing-files-relinking.md) | [missing-files-relinking](../features/missing-files-relinking.md) | FR-12, AC-05 | Planned v0.0.1 |
| [status-feedback.md](status-feedback.md) | [SPEC-v0.0.1-status-feedback.md](../../specs/SPEC-v0.0.1-status-feedback.md) | [status-feedback](../features/status-feedback.md) | FR-15 | Planned v0.0.1 |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | — (parent NFR-06) | [keyboard-shortcuts](../features/keyboard-shortcuts.md) | NFR-06 | Planned v0.0.1 |

"Planned vX.Y.Z" = specced, not implemented. A document flips to *Since vX.Y.Z* only at the release Ship commit (AGENTS workflow 5), which also appends its change-history entry.

## Maintenance rules (AGENTS §2a, RULES R8.6)

- A document is created when its feature enters an APPROVED feature-release spec — content derived from the spec and the agreed architecture (spec §6, RULES.md). Never from guesses.
- Every release that touches a feature appends a dated change-history entry ("v0.1.0: …") and updates the design sections to match the code as released.
- Documents are never deleted; removed features stay with a "Removed in v…" marker.

## Cross-references

- Requirements authority: `docs/specs/SPEC-v*.md` (via INDEX)
- User-facing behavior: `docs/released/features/`
- Code rules: `RULES.md`
