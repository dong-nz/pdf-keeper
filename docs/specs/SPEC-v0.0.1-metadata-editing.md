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

### UI — editor modal (UI-02, parent §5.3)

**DetailsModal.svelte** (560px), opened by the row's Edit action, `Enter` on the Edit action, or the row context menu; one document at a time.

- **Header**: the document title as the modal title; the stored path below it in 12px mono, selectable and wrapping rather than truncated mid-path. A favorite toggle sits at the header's right.
- **Fields in order**: **Title** (required — saving an empty value shows an inline field error from the command's `AppError` and keeps the modal open), **Author**, **Notes** (`<textarea>` auto-growing from 84px, no cap, FR-06). While `title_source = auto` the title field carries a quiet "from filename" hint; it disappears on the first edit — it explains provenance, it is not an error.
- **Categories**: full checkbox list plus the inline new-category field; Save sends the complete set through `library_set_document_categories`.
- **Relink…** button is rendered only when `missing` (see missing-files-relinking.md).
- **Footer**: left — "Remove from library" and "Delete file…" (both hand off to the delete flow, FR-09); right — Cancel / **Save** (primary). Save closes the modal only after the command resolves: no optimistic write (§5.3.4 rule 1).
- `Esc` with unsaved changes opens a discard-confirmation step; the modal traps focus and returns it to the row that opened it (R4.4).

### Tests / acceptance

- Unit tests over fixture PDFs: Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions.

## Cross-references

User guide: `docs/released/features/metadata-editing.md`.

---

## Build ledger

Retrofitted 2026-11-03 per DR-71 (one-time exception to the frozen-spec rule; recorded in `SPEC-v0.0.2.md`). Status reflects the verified state at the implementation/Ship commit `af70f77`.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-05 | Rust core | ✅ | af70f77 | `pdfmeta` tests (Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions) |
| FR-06 | commands + UI | ✅ | af70f77 | `library/service` tests (update_document single transaction, empty-title rejection, relink re-derivation gating); smoke flowMetadata |
| UI-02 | UI | ✅ | af70f77 | smoke flowMetadata (details modal edit round-trip incl. DR-50 modal-close fix) |
