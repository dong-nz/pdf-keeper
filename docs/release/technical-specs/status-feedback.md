# Status & feedback — technical reference

**Since v0.0.1** · Requirements: FR-15, UI-06 · User guide: [features/status-feedback.md](../features/status-feedback.md) · Spec: [SPEC-v0.0.1-status-feedback.md](../../specs/SPEC-v0.0.1-status-feedback.md)

## Counts pipeline (FR-15)

- Single aggregate: `SELECT COUNT(*), COALESCE(SUM(favorite),0), COALESCE(SUM(missing),0) FROM documents` (`library/service.rs`) → `CountsDto { total, favorites, missing }`.
- Emitted as the `status_updated` Tauri event from every mutation (import, delete, relink, rescan, favorite/category changes) via `EventSink` (`src-tauri/src/lib.rs`). A startup gate holds the first emission until the UI's `listen()` has succeeded — otherwise the UI loses the startup counts to a race it usually loses.
- UI: status-bar chips (library / favorites / missing) update from the event only; the sidebar Favorites row count uses the same state. No component computes counts locally.

## Job progress

- `library_job_progress` events carry `JobProgress` for import batches and the cover worker (throttled: every 25 completions + final drain) → import progress UI.

## Errors (`src-tauri/src/error.rs`)

- `AppError` variants (TitleEmpty, Validation, CategoryNameDuplicate, CategoryNotFound, DocumentNotFound, MissingFile, NotPdf, PathTaken, Io, Db, Internal) map to `AppErrorPayload { kind, message, document_id }` — typed, user-presentable, no raw strings across the boundary (R2.1).
- UI (`ui/src/lib/state/feedback.svelte.ts`): `reportError(payload, action?)` renders an error toast, optionally with an action button (Relink… on MissingFile, retry on a failed file deletion — opening-and-deleting.md). Field-level errors (empty title) render inline in the form instead.
- Success toasts are plural-aware (`notify(PluralBase, count)`, DR-55): "1 document imported" / "N documents imported".

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | counts aggregate correctness after each mutation kind |
| `src-tauri/src/router` tests | every command returns typed `AppErrorPayload`, never a raw error |
| `ui/src/lib/i18n` coverage test | every string used by components exists in `en.ts`; plural bases complete |
| `scripts/ui-smoke.mjs` | chips track import/delete/favorite/rescan mutations; failed command produces a toast with its action; import progress visible |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-status-feedback.md, corrected to the verified code: startup event gate, throttled cover progress, delete-retry toast action (DR-50b).
