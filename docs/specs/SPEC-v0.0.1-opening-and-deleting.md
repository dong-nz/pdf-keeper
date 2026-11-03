# Feature spec: Open & delete — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `opening-and-deleting` (user guide page: docs/release/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-08 | **Open externally.** Activating a document opens it with the OS default application for `.pdf`. Activating a **missing** document shows an error toast offering a **Relink…** action; no open is attempted. | **AGREED** (DR-04, DR-13c) |
| FR-09 | **Delete semantics.** Deleting offers both options per action: (a) remove from library only — disk file untouched; (b) delete file from disk — with confirmation. | **AGREED** (DR-06) |

Interacts with: SPEC-v0.0.1-missing-files-relinking.md (missing state, relink affordance).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-04 | Deleting via "library only" leaves the file on disk; "delete file" removes it (confirmed flow) | Automated test |

## Technical design
### Open (FR-08)

- `app_open_document(id)`: check `missing` flag first. If missing → typed `AppError(MissingFile)` → error toast with **Relink…** action; no open attempted (DR-13c).
- Otherwise delegate to the OS default handler for `.pdf` through `tauri-plugin-opener` (DR-44) — platform-neutral, no viewer bundled (DR-04).

### Delete (FR-09)

Two distinct commands, chosen in the UI every time:
- `library_delete_document(id | ids)` — removes the row; join rows cascade; cover cache file deleted; disk file untouched.
- `library_delete_document_and_file(id | ids)` — same, plus `std::fs::remove_file` after the transaction commits; file-system errors map to `AppError` and leave the row intact (retriable). UI shows a confirmation step before calling.

Bulk delete uses the same two commands with id lists — single transaction per call.

### Invariants

- No delete path may remove a disk file without the confirmation flow (FR-09).
- Row removal and cache cleanup are in one code path so a document cannot leave an orphan cover.

### UI (parent §5.3)

- **Activation** (FR-08): double-click on a row/card, `Enter` with the row focused, or the row's Open action (external-link glyph) — all three call `app_open_document`. The backend checks `missing` first; a `MissingFile` error renders as an error toast carrying a **Relink…** button that opens `RelinkDialog` for that document (R4.6, DR-13c). No dialog, no open attempt.
- **DeleteDialog.svelte** (420px) is the confirmation step for both variants, opened by the Delete key, the row action, the bulk bar, or the editor modal footer. It states exactly what will happen: single → the file path; bulk → "N documents (total size)" plus the list. Two explicit actions rather than one action plus a checkbox: **"Remove from library"** (secondary — disk untouched) and **"Delete file from disk"** (danger, `--danger`). Cancel/`Esc` is the focused default; nothing is deleted without this step (FR-09).
- A failed file deletion keeps the row and reports the offending path in the toast (retriable, per the Invariants above).

### Tests / acceptance

- AC-04: "library only" leaves the file on disk (assert file exists after); "delete file" removes it through the confirmed flow; bulk variants.

## Cross-references

User guide: `docs/release/features/opening-and-deleting.md`.

---

## Build ledger

Retrofitted 2026-11-03 per DR-71 (one-time exception to the frozen-spec rule; recorded in `SPEC-v0.0.2.md`). Status reflects the verified state at the implementation/Ship commit `af70f77`.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-08 | commands + UI | ✅ | af70f77 | `library` tests (open target resolution incl. missing → typed error, Relink toast); smoke flowOpen — note: shipped UI activated on single click against this spec's double-click text; deviation recorded as D1/DR-66 in `SPEC-v0.0.2.md` |
| FR-09 | commands + UI | ✅ | af70f77 | `library` tests (delete row-only vs delete-with-file; file-delete failure keeps rows); smoke flowDelete |
| AC-04 | commands + UI | ✅ | af70f77 | smoke flowDelete (file kept on disk in library-only mode; removed through confirmed flow; bulk variants) |
