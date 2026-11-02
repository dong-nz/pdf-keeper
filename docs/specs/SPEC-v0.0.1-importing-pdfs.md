# Feature spec: Import — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `importing-pdfs` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-10 | **Import.** Manual import via: file picker (multi-select), drag-and-drop onto the window, and a one-time "Import folder…" action (adds all PDFs in a chosen directory; not watched). Importing while a category is selected auto-assigns the imported documents to it; with no category selected, nothing is assigned. No watched/auto-import (see parent §2). | **AGREED** (DR-13a, DR-15) |
| FR-11 | **Duplicate handling.** Importing a path already in the library is skipped with a notice. No content-hash dedup in v1. | **AGREED** (DR-15) |

Depends on: parent FR-01 (reference-in-place: import never copies/moves/renames), NFR-02 (10 000 imports < 30 s, covers queued). Interacts with: SPEC-v0.0.1-metadata-editing.md (auto-extraction at import), SPEC-v0.0.1-covers.md (cover jobs enqueued), SPEC-v0.0.1-categories.md (auto-assignment).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-01 | Import 10 000 generated fixture PDFs (picker/folder/drag-drop paths exercised); all listed; duplicates skipped with notice | Automated service + UI test |

## Cross-references

Implementation design: `docs/released/technical-specs/importing-pdfs.md` · User guide: `docs/released/features/importing-pdfs.md`.
