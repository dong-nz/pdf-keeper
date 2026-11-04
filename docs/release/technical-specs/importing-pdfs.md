# Import — technical reference

**Since v0.0.1 · design updated in v0.0.2 and v0.0.3** · Requirements: FR-10 (MODIFIED in v0.0.2), FR-11 (parent FR-01, NFR-02, NFR-07), UI-14 (ADDED in v0.0.3) · User guide: [features/importing-pdfs.md](../features/importing-pdfs.md) · Specs: [SPEC-v0.0.1-importing-pdfs.md](../../specs/SPEC-v0.0.1-importing-pdfs.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (FR-10); [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §3.5 — decision DR-94

## Commands (Tauri)

| Command | Signature | Behavior |
|---|---|---|
| `library_import_paths` | `(paths: Vec<String>, category_ids: Vec<i64>) -> ImportResult` | Imports the given `.pdf` paths; non-`.pdf` and directories are reported as skipped (`not_pdf`), never silently dropped. `category_ids` is the whole active filter set (v0.0.2; was `category_id: Option<i64>`) — an empty vector assigns nothing |
| `library_import_folder` | `(dir: String, category_ids: Vec<i64>) -> ImportResult` | Walks `dir` for `*.pdf` (`std::fs::read_dir`, one-time bulk; nothing is watched) |

`ImportResult { imported: u32, skipped: Vec<Skipped> }` where `Skipped` is typed (`already_in_library` | `not_pdf`). Progress is streamed on the `library_job_progress` event (`{kind: "import", processed, total, done}`); the command returns once rows are committed — cover generation is queued separately (covers.md), so import never waits for rendering (NFR-02).

## Pipeline (`src-tauri/src/library/service.rs`)

1. Filter paths to `.pdf`; each entry: `normalize_path` → metadata (size/mtime) → INSERT inside one transaction.
2. **Duplicates (FR-11):** `documents.path UNIQUE` + `INSERT OR IGNORE` — ignored rows are collected as `already_in_library` skips. No content hashing in v0.0.1.
3. **Metadata extraction** (metadata-editing.md): title/author from the PDF Info dictionary via `lopdf`; fallback = filename minus `.pdf`; `title_source` recorded (`auto` | `user`). A per-file extraction failure falls back silently — it never fails the batch.
4. **Auto-assignment (FR-10, as modified in v0.0.2):** `import_paths(…, category_ids: &[i64])` validates **every** id before any write (`validate_categories` → `AppError::CategoryNotFound` for an unknown id), then writes the join rows for each active category inside the same transaction as the documents — one assignment set per import, never one per category call. An empty slice assigns nothing, exactly as the v0.0.1 "no category selected" path.
5. Cover jobs enqueued to the cover queue (covers.md) after commit.

## UI (`ui/src/`)

- `components/ImportButton.svelte` — **deleted in v0.0.3** (UI-14; R7.4). It was a split control: primary opened the native multi-select picker (`tauri-plugin-dialog`), the caret opened a hand-written menu with "Import folder…", and while a job ran both halves were disabled with the label "Importing…". Its whole role moved into the search field, below.
- `components/SearchBox.svelte` (v0.0.3, UI-14) — the field keeps its leading magnifier and carries, at its trailing end behind a 1px `--border-strong` divider, the import control: a plus icon button (`plus` path already in `components/icons.ts`; no new icon) with the accessible name and tooltip "Import". The clear button and the plus share that slot — clear while the field holds text, plus otherwise — so a control is never hidden by a state the user can't see. The plus opens a two-item menu, *Import files…* and *Import folder…*, reusing the shipped menu chrome, and both call the existing `importFlow` functions (`pickFilesAndImport`, `pickFolderAndImport`). `Ctrl+I` and the drag-and-drop path are untouched. The busy state moved with the control: the plus is disabled while `feedback.job !== null`.
- `App.svelte` subscribes to `tauri://drag-enter` / `drag-leave` / `drag-drop` (real FS paths; `drag-over` is not subscribed — enter/leave is sufficient for the overlay) and renders the full-window drop overlay. Since v0.0.2 its second line names **every active category** (`drop.toCategory` = "Adds to {categories}", built from `filter.category_ids`) — in v0.0.1 it named the single selected category.
- `lib/importFlow.ts` — picker calls; `state/library.svelte.ts#importPaths` — invoke + result reporting: toast "Imported N PDFs" plus, when `skipped` is non-empty, a second toast "M files skipped (already in library)". The spec's single-toast-with-expandable-body detail was not built; two plain toasts carry the same information (deviation recorded here per Rule 7).
- `ProgressBar` in the status bar renders `library_job_progress`; the busy gate (Rescan and Import disabled) stays closed until the cover queue drains (FR-15; verified: gate opens only after covers complete).

## Invariants

- Import never copies/moves/renames user files (FR-01).
- A failed per-file metadata step never fails the batch (fallback path).
- The same path cannot exist twice in `documents` (UNIQUE).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/service.rs` tests | import pipeline, duplicate skip + typed skips, auto-assignment, folder walk, 10 000-file batch with < 30 s timing assertion (AC-01 service part); **v0.0.2:** `import_assigns_every_active_category` (AC-18 — two active categories assign both, one document row, an empty slice assigns nothing) |
| `scripts/ui-smoke.mjs` | drag-drop reaches the pipeline end-to-end; 10 000 documents listed via the app with timing < 30 s (AC-01 UI part); duplicate import skipped with notice; import result toast reports the batch; busy gate opens only after the cover queue drains. **v0.0.2:** `flowImportAssign` imports with two categories active and asserts both assignments on the imported document |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-importing-pdfs.md, corrected to the verified code: two result toasts instead of one expandable toast; no `drag-over` subscription; ImportButton busy state ("Importing…" + disabled) implemented during stage-4 verification.
- 2026-11-04 (v0.0.2 — FR-10 MODIFIED) — **Auto-assignment follows the whole active filter set.** Both import commands take `category_ids: Vec<i64>` (the frontend passes `filter.category_ids` unchanged); `import_paths` validates every id up front and writes all join rows in the import transaction, so one import produces one assignment set rather than one per category. The drop overlay names the active set instead of a single category. Verified by `service.rs::import_assigns_every_active_category` and the smoke flow `flowImportAssign` (import with two active categories, both assignments observed on the imported document). Pipeline and duplicate semantics otherwise unchanged.
- 2026-11-04 (v0.0.3 — UI-14, entry point only) — The toolbar's Import button is gone: `ImportButton.svelte` was deleted and the control lives inside `SearchBox.svelte` as a plus icon behind a 1px divider at the field's trailing end, sharing that slot with the clear button (clear while the field holds text). Its two menu items call the same `pickFilesAndImport` / `pickFolderAndImport` paths; the busy gating is the same `feedback.job` condition. **No command, no pipeline change, no new icon, no new dependency** (the `plus` path already existed in `components/icons.ts`). `Ctrl+I` and drag-and-drop are unchanged. Verified by `flowSearchField` (field composition magnifier/input/divider/one named trailing control; the plus opens exactly the two items; both reach their picker with the PDF filter and `directory: true` — asserted on the request posted at the command boundary, not on a native dialog's answer) and by the unchanged import flows in the suite prefix and `flowImportAssign` (AC-21, AC-18).
