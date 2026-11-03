# Feature spec: Missing files & relink — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `missing-files-relinking` (user guide page: docs/release/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-12 | **Missing-file handling.** The app checks indexed paths on **startup and on manual "Rescan"** only (no background scanning). Vanished files are marked **missing** in the UI and never auto-removed. A **relink** action points the entry at a new path. | **AGREED** (DR-13b) |

Interacts with: SPEC-v0.0.1-opening-and-deleting.md (open-missing toast), SPEC-v0.0.1-metadata-editing.md (title re-derivation on relink when auto-titled), SPEC-v0.0.1-covers.md (cover regeneration on rescan).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-05 | Moving a file outside the app → Rescan marks it missing → relink restores it; missing activation shows toast with Relink… | Automated test |

## Technical design
### Detection

- Checks run at **startup and on manual Rescan only** — no background watcher (DR-13b).
- `library_rescan()` / startup task: iterate `documents`, `fs::metadata` each path; on failure set `missing=1`; on success refresh `size`/`mtime` and enqueue a cover job when the mtime changed (FR-16).
- Runs in batches off the UI thread; progress and results surface via toast + status-bar counts (FR-15).
- Missing entries are NEVER auto-removed (FR-12).

### Missing state in queries

- `missing` badge in rows (UI-03); status-bar count query; opening a missing document short-circuits to the toast (see opening-and-deleting.md).

### Relink

- `library_relink_document(id, new_path)`: validate new_path is a `.pdf` and not already owned by another document (path UNIQUE). Update path, clear `missing`, re-stat size/mtime.
- If `title_source = auto`, the title is re-derived from the new filename (FR-12); user-edited titles are preserved (see metadata-editing.md).
- A cover job is enqueued for the new path.

### UI (parent §5.3)

- **MissingBadge.svelte**: a `--warning` chip labeled "Missing" in rows and an overlay badge on card covers. The title stays readable and the tooltip shows the stored path — a missing entry is kept visible, not hidden or dimmed away (FR-12).
- The status-bar **Missing count is a filter control**: clicking it sets `missing_only=true` so the broken entries can be worked through one by one; the number itself stays library-wide (FR-15).
- **Rescan control**: a "Rescan" button on the right of the status bar; `library_job_progress {kind: rescan}` drives the progress bar and the run ends with a result toast "N missing · M restored". The startup rescan stays silent unless it finds something.
- **RelinkDialog.svelte** (420px): shows the old path, then the new one after the native file picker (`tauri-plugin-dialog`, DR-44) or after a file is dropped onto the dialog. Validation errors are inline and the picker reopens — not a `.pdf`, or already owned by another entry (path UNIQUE) — never a bare toast (AC-05). On success the badge clears, the row is re-statted, a cover job is enqueued, and an auto-titled document re-derives its title from the new filename (metadata-editing.md); user-edited titles are untouched.

### Tests / acceptance

- AC-05: move fixture outside app → rescan marks missing → relink restores (path updated, flag cleared); activation of a missing fixture produces the Relink toast.

## Cross-references

User guide: `docs/release/features/missing-files-relinking.md`.

---

## Build ledger

Retrofitted 2026-11-03 per DR-71 (one-time exception to the frozen-spec rule; recorded in `SPEC-v0.0.2.md`). Status reflects the verified state at the implementation/Ship commit `af70f77`.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-12 | Rust core + commands + UI | ✅ | af70f77 | `library` tests (rescan sets/clears flag, refreshes size/mtime, outcome counts; relink validates file, clears flag, `title_source` gating); smoke flowMissingAndRelink |
| AC-05 | Rust core + UI | ✅ | af70f77 | smoke flowMissingAndRelink (move fixture out → rescan marks missing → relink restores; missing activation → Relink toast) |
