# Feature spec: Import — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `importing-pdfs` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-10 | **Import.** Manual import via: file picker (multi-select), drag-and-drop onto the window, and a one-time "Import folder…" action (adds all PDFs in a chosen directory; not watched). Importing while a category is selected auto-assigns the imported documents to it; with no category selected, nothing is assigned. No watched/auto-import (see parent §2). | **AGREED** (DR-13a, DR-15) |
| FR-11 | **Duplicate handling.** Importing a path already in the library is skipped with a notice. No content-hash dedup in v1. | **AGREED** (DR-15) |

Depends on: parent FR-01 (reference-in-place: import never copies/moves/renames), NFR-02 (10 000 imports < 30 s, covers queued). Interacts with: SPEC-v0.0.1-metadata-editing.md (auto-extraction at import), SPEC-v0.0.1-covers.md (cover jobs enqueued), SPEC-v0.0.1-categories.md (auto-assignment).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-01 | Import 10 000 generated fixture PDFs (picker/folder/drag-drop paths exercised); all listed; duplicates skipped with notice; whole import completes < 30 s (NFR-02) | Automated service + UI test with timing assertion |

## Technical design
### Entry points → commands

- File picker (multi-select) and drag-and-drop → `library_import_paths(paths, category_id?)`
- "Import folder…" (one-time bulk, not watched) → `library_import_folder(dir, category_id?)` — walks the directory for `*.pdf`
- `category_id` = currently selected sidebar category; when present, imported documents are auto-assigned in the same transaction (FR-10). No selection → no assignment.

### Pipeline (per batch)

1. Filter to `.pdf` files; reject directories and non-PDF drops.
2. **Duplicate check (FR-11):** `documents.path` has a UNIQUE constraint; INSERT OR IGNORE counts skipped paths — returned as a notice in the command result (no content-hash dedup in v1).
3. Insert rows in one transaction: path, filename, size, mtime, added_at.
4. **Metadata extraction** (FR-05, see metadata-editing.md): title/author from PDF Info dictionary, fallback filename-minus-`.pdf`; `title_source` recorded.
5. **Cover jobs** enqueued to the background generation queue (see covers.md) — import command returns as soon as rows are committed; UI stays responsive (NFR-02: 10 000 imports < 30 s; NFR-07: nothing blocking the UI thread).
6. Result payload: imported/skipped counts → toast (FR-15) + status-bar refresh.

### Invariants

- Import never copies, moves, or renames the user's files (FR-01).
- A failed per-file step (unreadable metadata) MUST NOT fail the batch — fallback path applies.

### Tests / acceptance

- AC-01: 10 000 fixture PDFs through all three entry points; duplicates skipped with notice; service-level test on the import pipeline asserts the batch completes < 30 s (NFR-02 budget); UI test for drag-drop.

## Cross-references

User guide: `docs/released/features/importing-pdfs.md`.
