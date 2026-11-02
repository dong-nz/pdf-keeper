# Feature spec: Open & delete — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `opening-and-deleting` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

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
- Otherwise delegate to the OS default handler for `.pdf` via the Tauri shell opener — platform-neutral, no viewer bundled (DR-04).

### Delete (FR-09)

Two distinct commands, chosen in the UI every time:
- `library_delete_document(id | ids)` — removes the row; join rows cascade; cover cache file deleted; disk file untouched.
- `library_delete_document_and_file(id | ids)` — same, plus `std::fs::remove_file` after the transaction commits; file-system errors map to `AppError` and leave the row intact (retriable). UI shows a confirmation step before calling.

Bulk delete uses the same two commands with id lists — single transaction per call.

### Invariants

- No delete path may remove a disk file without the confirmation flow (FR-09).
- Row removal and cache cleanup are in one code path so a document cannot leave an orphan cover.

### Tests / acceptance

- AC-04: "library only" leaves the file on disk (assert file exists after); "delete file" removes it through the confirmed flow; bulk variants.

## Cross-references

User guide: `docs/released/features/opening-and-deleting.md`.
