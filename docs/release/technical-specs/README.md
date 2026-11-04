# Technical Specs — Released Developer Reference

Deep technical documentation **of released features only**: design, modules, data model, invariants, and test mapping as they were shipped. For developers and coding agents; end users read `docs/release/features/` instead.

One document per feature, same slug as its user-guide page. The binding requirement text always lives in the release specs (`docs/specs/INDEX.md`); the **development-time technical design lives in the current (not yet released) spec and its feature specs** — never here. A document in this directory appears only at the release Ship commit, migrated from the design sections of the spec that shipped the feature (DR-39), and carries a per-release change history.

## Feature map

Populated at Ship commits. **v0.0.1 shipped 2026-11-03**, **v0.0.2 shipped 2026-11-04**, **v0.0.3 shipped 2026-11-04**. A document marked *updated in v0.0.x* carries a dated change-history entry and design sections matching the code as it shipped in that release. The technical design of the in-development release lives in `docs/specs/SPEC-v<version>*.md`, never here.

| Technical doc | Released since | Last updated | User guide page | Requirements |
|---|---|---|---|---|
| [importing-pdfs.md](importing-pdfs.md) | v0.0.1 | v0.0.3 | [importing-pdfs](../features/importing-pdfs.md) | FR-10 (MODIFIED in v0.0.2), FR-11, UI-14 (v0.0.3) |
| [categories.md](categories.md) | v0.0.1 | v0.0.3 | [categories](../features/categories.md) | FR-02 (MODIFIED in v0.0.2), FR-07, UI-03 (MODIFIED in v0.0.3) |
| [browsing-and-filtering.md](browsing-and-filtering.md) | v0.0.2 | v0.0.3 | [browsing-and-filtering](../features/browsing-and-filtering.md) | UI-01 (MODIFIED in v0.0.2 and v0.0.3), UI-09 (ADDED v0.0.2, MODIFIED v0.0.3), FR-15 (placement, v0.0.3) |
| [the-app-window.md](the-app-window.md) | v0.0.2 | v0.0.3 | [the-app-window](../features/the-app-window.md) | UI-07, UI-11 (MODIFIED in v0.0.3), UI-12 (MODIFIED in v0.0.3), UI-13 (v0.0.3), defect D2 (fixed in v0.0.3) |
| [searching.md](searching.md) | v0.0.1 | v0.0.3 | [searching](../features/searching.md) | FR-03, UI-16 (v0.0.3) |
| [metadata-editing.md](metadata-editing.md) | v0.0.1 | v0.0.3 | [metadata-editing](../features/metadata-editing.md) | FR-05, FR-06, UI-02, UI-06 |
| [favorites.md](favorites.md) | v0.0.1 | v0.0.3 | [favorites](../features/favorites.md) | FR-04, FR-13 |
| [sorting-and-views.md](sorting-and-views.md) | v0.0.1 | v0.0.3 | [sorting-and-views](../features/sorting-and-views.md) | FR-02, FR-04, FR-13 (MODIFIED in v0.0.2), UI-04, UI-08 (ADDED v0.0.2, MODIFIED v0.0.3) |
| [covers.md](covers.md) | v0.0.1 | v0.0.3 | [covers](../features/covers.md) | FR-16, UI-04 |
| [opening-and-deleting.md](opening-and-deleting.md) | v0.0.1 | v0.0.3 | [opening-and-deleting](../features/opening-and-deleting.md) | FR-08, FR-09, UI-03 (MODIFIED in v0.0.3), UI-05 |
| [selecting-documents.md](selecting-documents.md) | v0.0.3 | — | [selecting-documents](../features/selecting-documents.md) | UI-18, UI-03 (selection semantics), §5.2 (Escape) |
| [settings-and-appearance.md](settings-and-appearance.md) | v0.0.3 (About since v0.0.2) | — | [settings-and-appearance](../features/settings-and-appearance.md) | UI-13, UI-17, UI-12 (v0.0.2), UI-08/UI-15 (dialog sections) |
| [missing-files-relinking.md](missing-files-relinking.md) | v0.0.1 | v0.0.3 | [missing-files-relinking](../features/missing-files-relinking.md) | FR-11, FR-12, UI-02 |
| [status-feedback.md](status-feedback.md) | v0.0.1 | v0.0.3 | [status-feedback](../features/status-feedback.md) | FR-15 (depends on parent UI-01), UI-15 (v0.0.3) |

## Creation & maintenance rules (AGENTS §2a, RULES R8.5/R8.6)

- A document is **created in the Ship commit** of the release that first ships the capability: content migrated from that release spec's feature-spec "Technical design" section (cross-cutting features: parent §5.1/§5.2), corrected to match the code **as released and verified**, marked "Since vX.Y.Z".
- Every later release that touches the feature appends a dated change-history entry ("v0.1.0: …") and updates the design sections to match the code as released.
- Documents are never deleted; removed features stay with a "Removed in v…" marker.
- Current specs MUST NOT link into this directory — they carry their own design sections; this directory describes only what has shipped.

## Cross-references

- Requirements authority + development-time design: `docs/specs/SPEC-v*.md` (via INDEX)
- User-facing behavior: `docs/release/features/`
- What each release changed: `docs/release/notes/`
- Code rules: `RULES.md`
