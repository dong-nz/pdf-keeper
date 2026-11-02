# Feature spec: Metadata extraction & editing — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `metadata-editing` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

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

## Cross-references

Implementation design: `docs/released/technical-specs/metadata-editing.md` · User guide: `docs/released/features/metadata-editing.md`.
