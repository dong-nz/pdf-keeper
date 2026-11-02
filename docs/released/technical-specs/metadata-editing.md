# Metadata extraction and editing — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-05, FR-06; UI-02). Not implemented.

## Extraction (`src-tauri/src/pdfmeta/`)

- `lopdf` reads the PDF **Info dictionary** (DR-14): `/Title` → title, `/Author` → author.
- Failure modes handled by fallback, never by error: encrypted files, compressed object streams, malformed xref/trailer (FR-05).
- Fallback rule: title = filename minus `.pdf`; author = empty.
- `documents.title_source`: `auto` | `user` — set `auto` on import, `user` on any manual edit. This flag gates relink title-following behavior (see missing-files-relinking.md).
- Extraction runs at import per file; a failed extraction NEVER fails the import batch.

## Editing

- `library_get_document(id)` / `library_update_document(id, title, author, notes, favorite, category_ids[])` — single transaction; FTS triggers reindex automatically (see searching.md).
- Title is required (NOT NULL); empty user input is rejected at the command layer with a typed `AppError`.
- Editing title/author/notes changes only the library entry — the file on disk is never renamed (FR-01).
- Notes are free text with no structure and no length cap in v1; they are fully searchable (FR-03/FR-06).

## Editor modal (UI-02)

Title, author, notes, category checkboxes, favorite toggle, relink button (visible only when `missing`), delete actions.

## Tests / acceptance

- Unit tests over fixture PDFs: Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions.

## Change history
- v0.0.1 (planned): introduced.
