# Import pipeline — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-10, FR-11; AC-01; budgets NFR-02). Not implemented.

## Entry points → commands

- File picker (multi-select) and drag-and-drop → `library_import_paths(paths, category_id?)`
- "Import folder…" (one-time bulk, not watched) → `library_import_folder(dir, category_id?)` — walks the directory for `*.pdf`
- `category_id` = currently selected sidebar category; when present, imported documents are auto-assigned in the same transaction (FR-10). No selection → no assignment.

## Pipeline (per batch)

1. Filter to `.pdf` files; reject directories and non-PDF drops.
2. **Duplicate check (FR-11):** `documents.path` has a UNIQUE constraint; INSERT OR IGNORE counts skipped paths — returned as a notice in the command result (no content-hash dedup in v1).
3. Insert rows in one transaction: path, filename, size, mtime, added_at.
4. **Metadata extraction** (FR-05, see metadata-editing.md): title/author from PDF Info dictionary, fallback filename-minus-`.pdf`; `title_source` recorded.
5. **Cover jobs** enqueued to the background generation queue (see covers.md) — import command returns as soon as rows are committed; UI stays responsive (NFR-02: 10 000 imports < 30 s; NFR-07: nothing blocking the UI thread).
6. Result payload: imported/skipped counts → toast (FR-15) + status-bar refresh.

## Invariants

- Import never copies, moves, or renames the user's files (FR-01).
- A failed per-file step (unreadable metadata) MUST NOT fail the batch — fallback path applies.

## Tests / acceptance

- AC-01: 10 000 fixture PDFs through all three entry points; duplicates skipped with notice. Service-level test on the import pipeline + UI test for drag-drop.

## Change history
- v0.0.1 (planned): introduced.
