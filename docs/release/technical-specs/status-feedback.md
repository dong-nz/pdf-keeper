# Status & feedback — technical reference

**Since v0.0.1 · updated in v0.0.3** · Requirements: FR-15 (depends on parent UI-01's status-bar region; UI-15 ADDED in v0.0.3) · User guide: [features/status-feedback.md](../features/status-feedback.md) · Spec: [SPEC-v0.0.1-status-feedback.md](../../specs/SPEC-v0.0.1-status-feedback.md); [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §2 (UI-15, FR-15 placement), §3.3 — decisions DR-94, DR-96

## Counts pipeline (FR-15)

- Single aggregate: `SELECT COUNT(*), COALESCE(SUM(favorite),0), COALESCE(SUM(missing),0) FROM documents` (`library/service.rs`) → `CountsDto { total, favorites, missing }`.
- Emitted as the `status_updated` Tauri event from every mutation (import, delete, relink, rescan, favorite/category changes) via `EventSink` (`src-tauri/src/lib.rs`). A startup gate holds the first emission until the UI's `listen()` has succeeded — otherwise the UI loses the startup counts to a race it usually loses.
- UI, as shipped in v0.0.3 (`components/StatusBar.svelte`): the bar is **conditional** (UI-15). It always renders one quiet document count — `formatCount(counts.total)`, `--text-tertiary`, 12 px, `tabular-nums` — and nothing else by default. The missing-file warning renders only when `counts.missing > 0`; the progress bar only while a job runs; the result count only while a filter or search is active. The three count chips and the Rescan button are deleted, and the `contentinfo` landmark is unchanged. The counts and the rescan control now live in the Browse menu (UI-09, [browsing-and-filtering.md](browsing-and-filtering.md)). The sidebar Favorites row count that v0.0.1 described is gone with the sidebar (v0.0.2). No component computes counts locally: every number on screen comes from the `status_updated` payload, and the frontend never caches or derives one.

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
| `scripts/ui-smoke.mjs` `flowStatusBar` | the bar is quiet (only the document count: no buttons, no chips, no progress, no warning) with nothing to say; while filtered the result count appears **and the document count stays the library-wide number**; while a job runs the progress bar appears and the bar is quiet again afterwards (three consecutive quiet reads); with a missing file the warning appears and stops appearing once nothing is missing |
| `scripts/ui-smoke.mjs` (import prefix, `flowMissingAndRelink`) | the progress bar is seen during the 10 000-file import; a failed command produces a toast carrying its action (Relink…); *Rescan files* is disabled until the job ends |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-status-feedback.md, corrected to the verified code: startup event gate, throttled cover progress, delete-retry toast action (DR-50b).
- 2026-11-04 (v0.0.2 — documentation correction, no behavior change) — The status bar, its counts and the toast rules are unchanged by this release; the AC-13 run re-confirmed that the counts stay library-wide while categories and modes filter the list. The header cited a `UI-06` that `SPEC-v0.0.1-status-feedback.md` never defined (v0.0.1 defines UI-01…UI-05 only); the citation is corrected to FR-15 with its dependency on parent UI-01, because `UI-06` is a v0.0.2 requirement ID (metadata display) and IDs are never reused (AGENTS Rule 5).
- 2026-11-04 (v0.0.3) — The bar became conditional (UI-15): three count chips and the Rescan button removed, a quiet document count as the default state, each other element gated on the condition it describes. FR-15's behavior is untouched — same aggregate query, same `status_updated` source, counts still never filter-dependent — only the placement changed: the counts and the rescan control moved into the Browse menu (DR-96, superseding DR-46's placement). `flowStatusBar` is new in the smoke suite and carries the five assertions above; the count-equality assertions in `flowCategoriesMulti` and `flowThemeAndSettings` (Browse menu ⇄ Settings dialog ⇄ status bar) are the cross-check that one payload feeds all three.
