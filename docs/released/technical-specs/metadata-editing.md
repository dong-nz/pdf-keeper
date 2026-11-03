# Metadata extraction & editing — technical reference

**Since v0.0.1** · Requirements: FR-05, FR-06, UI-02 · User guide: [features/metadata-editing.md](../features/metadata-editing.md) · Spec: [SPEC-v0.0.1-metadata-editing.md](../../specs/SPEC-v0.0.1-metadata-editing.md)

## Extraction (`src-tauri/src/pdfmeta/`)

- `lopdf` reads the PDF Info dictionary: `/Title` → title, `/Author` → author. Encrypted files, compressed object streams, malformed xref/trailer — all handled by fallback, never by error (FR-05).
- Fallback: title = filename minus `.pdf`, author empty. A failed extraction never fails the import batch.
- `documents.title_source` (`auto` at import, `user` on any manual edit) gates relink title re-derivation (missing-files-relinking.md).

## Editing

- `library_get_document(id)` / `library_update_document(id, title, author, notes, favorite, category_ids[])` — single transaction; FTS triggers reindex automatically (searching.md).
- Title required (NOT NULL); empty input rejected at the command layer with a typed `AppError` and shown as an inline field error.
- No length caps on title/author/notes in either layer (FR-06: "no length cap in v1"); SQLite TEXT stores what is given.
- Editing changes only the library entry — the file on disk is never renamed (FR-01).

## Editor modal (`components/DetailsModal.svelte`, 560px; UI-02)

- Opened from the row/card Details action or the context menu; one document at a time; loads via `library_get_document`.
- Fields: Title (inline error on empty, modal stays open; while `title_source = auto` and the title is untouched the field carries a quiet "from filename" provenance hint that disappears on the first edit), Author, Notes (textarea auto-growing from 84px, min-height enforced in CSS), category checkbox list + inline new-category field, favorite toggle; stored path shown in mono under the header.
- Save closes the modal only after the command resolves — no optimistic write (§5.3.4).
- `Esc` with unsaved changes routes through an inline discard-confirm bar (Keep editing / Discard); focus is trapped by the kit and returns to the opener (DR-45, DR-57).
- Footer actions (completed during stage-4 verification to match UI-02): **Delete…** hands the document to the standard delete confirmation dialog — a completed deletion closes the editor, a cancel does not; **Relink…** (rendered only when `missing`) closes the editor and opens the relink dialog, since the editor's snapshot would go stale (missing-files-relinking.md).
- The "from filename" provenance hint described in the spec's UI section was not built; provenance is visible through the title content itself (deviation recorded per Rule 7).

## Invariants

- `title_source` transitions only auto → user (a manual edit never reverts to auto).
- Extraction failure is silent per file; only the batch result is reported (importing-pdfs.md).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/pdfmeta/` tests | Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions |
| `src-tauri/src/library/service.rs` tests | update_document single-transaction behavior, empty-title rejection, relink title re-derivation gated by `title_source` |
| `scripts/ui-smoke.mjs` | editor opens from the row menu; the auto-title provenance hint shows and disappears on the first edit; title edit saves and updates the row; the edited title is found by search; Delete… hands to the delete flow (cancel keeps the editor; completed delete removes the document and closes the editor); Relink… appears on a missing document and opens the relink dialog |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-metadata-editing.md, corrected to the verified code: editor Relink…/Delete… footer actions and the "from filename" provenance hint completed during verification (UI-02); notes field auto-grows from 84px; no field length caps (FR-06); delete confirmation title plural-aware ("Delete 1 document?" / "Delete N documents?").
