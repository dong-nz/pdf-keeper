# Import — technical reference

**Since v0.0.1** · Requirements: FR-10, FR-11 (parent FR-01, NFR-02, NFR-07) · User guide: [features/importing-pdfs.md](../features/importing-pdfs.md) · Spec: [SPEC-v0.0.1-importing-pdfs.md](../../specs/SPEC-v0.0.1-importing-pdfs.md)

## Commands (Tauri)

| Command | Signature | Behavior |
|---|---|---|
| `library_import_paths` | `(paths: Vec<String>, category_id: Option<i64>) -> ImportResult` | Imports the given `.pdf` paths; non-`.pdf` and directories are reported as skipped (`not_pdf`), never silently dropped |
| `library_import_folder` | `(dir: String, category_id: Option<i64>) -> ImportResult` | Walks `dir` for `*.pdf` (`std::fs::read_dir`, one-time bulk; nothing is watched) |

`ImportResult { imported: u32, skipped: Vec<Skipped> }` where `Skipped` is typed (`already_in_library` | `not_pdf`). Progress is streamed on the `library_job_progress` event (`{kind: "import", processed, total, done}`); the command returns once rows are committed — cover generation is queued separately (covers.md), so import never waits for rendering (NFR-02).

## Pipeline (`src-tauri/src/library/service.rs`)

1. Filter paths to `.pdf`; each entry: `normalize_path` → metadata (size/mtime) → INSERT inside one transaction.
2. **Duplicates (FR-11):** `documents.path UNIQUE` + `INSERT OR IGNORE` — ignored rows are collected as `already_in_library` skips. No content hashing in v0.0.1.
3. **Metadata extraction** (metadata-editing.md): title/author from the PDF Info dictionary via `lopdf`; fallback = filename minus `.pdf`; `title_source` recorded (`auto` | `user`). A per-file extraction failure falls back silently — it never fails the batch.
4. **Auto-assignment (FR-10):** when `category_id` is present, the join rows are written in the same transaction as the documents.
5. Cover jobs enqueued to the cover queue (covers.md) after commit.

## UI (`ui/src/`)

- `components/ImportButton.svelte` — split control: primary opens the native multi-select picker (`tauri-plugin-dialog`), caret opens a hand-written menu with "Import folder…" (product chrome, not kit). While a job runs (`feedback.job !== null`) both halves are disabled and the primary label reads "Importing…" (implemented 2026-11-03, see Change history).
- `App.svelte` subscribes to `tauri://drag-enter` / `drag-leave` / `drag-drop` (real FS paths; `drag-over` is not subscribed — enter/leave is sufficient for the overlay) and renders the full-window drop overlay; the second line names the selected category (FR-10).
- `lib/importFlow.ts` — picker calls; `state/library.svelte.ts#importPaths` — invoke + result reporting: toast "Imported N PDFs" plus, when `skipped` is non-empty, a second toast "M files skipped (already in library)". The spec's single-toast-with-expandable-body detail was not built; two plain toasts carry the same information (deviation recorded here per Rule 7).
- `ProgressBar` in the status bar renders `library_job_progress`; the busy gate (Rescan and Import disabled) stays closed until the cover queue drains (FR-15; verified: gate opens only after covers complete).

## Invariants

- Import never copies/moves/renames user files (FR-01).
- A failed per-file metadata step never fails the batch (fallback path).
- The same path cannot exist twice in `documents` (UNIQUE).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/service.rs` tests | import pipeline, duplicate skip + typed skips, auto-assignment, folder walk, 10 000-file batch with < 30 s timing assertion (AC-01 service part) |
| `scripts/ui-smoke.mjs` | drag-drop reaches the pipeline end-to-end; 10 000 documents listed via the app with timing < 30 s (AC-01 UI part); duplicate import skipped with notice; import result toast reports the batch; busy gate opens only after the cover queue drains |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-importing-pdfs.md, corrected to the verified code: two result toasts instead of one expandable toast; no `drag-over` subscription; ImportButton busy state ("Importing…" + disabled) implemented during stage-4 verification.
