# Feature spec: Metadata extraction & editing — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `metadata-editing` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-05 | **Metadata auto-extraction.** On import, attempt to read title and author from the PDF's internal info dictionary. If unreadable (encrypted, compressed object streams, malformed), fall back to the filename (without `.pdf`). Extracted or derived title is always editable afterwards. | **AGREED** (DR-07) |
| FR-06 | **Metadata editing.** User can edit title, author, and free-text notes of any indexed document at any time; these fields are searchable (FR-03). | **AGREED** (DR-07, "always editable") |

## Interface items

| ID | Requirement | Status |
|---|---|---|
| UI-02 | Document editor modal: title, author, notes, category checkboxes, favorite toggle, relink button (when missing), delete actions. | **AGREED** (DR-16) |

Depends on: parent §6 (`lopdf` for Info dictionary, graceful fallback). Interacts with: SPEC-v0.0.1-missing-files-relinking.md (title re-derivation on relink), SPEC-v0.0.1-searching.md (fields are indexed).

## Technical design
### Extraction (`src-tauri/src/pdfmeta/`)

- `lopdf` reads the PDF **Info dictionary** (DR-14): `/Title` → title, `/Author` → author.
- Failure modes handled by fallback, never by error: encrypted files, compressed object streams, malformed xref/trailer (FR-05).
- Fallback rule: title = filename minus `.pdf`; author = empty.
- `documents.title_source`: `auto` | `user` — set `auto` on import, `user` on any manual edit. This flag gates relink title-following behavior (see missing-files-relinking.md).
- Extraction runs at import per file; a failed extraction NEVER fails the import batch.

### Editing

- `library_get_document(id)` / `library_update_document(id, title, author, notes, favorite, category_ids[])` — single transaction; FTS triggers reindex automatically (see searching.md).
- Title is required (NOT NULL); empty user input is rejected at the command layer with a typed `AppError`.
- Editing title/author/notes changes only the library entry — the file on disk is never renamed (FR-01).
- Notes are free text with no structure and no length cap in v1; they are fully searchable (FR-03/FR-06).

### Editor modal (UI-02)

Title, author, notes, category checkboxes, favorite toggle, relink button (visible only when `missing`), delete actions.

### Tests / acceptance

- Unit tests over fixture PDFs: Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions.

## Cross-references

User guide: `docs/released/features/metadata-editing.md`.
