# Missing files & relinking — technical reference

**Since v0.0.1** · Requirements: FR-11, FR-12, UI-02 · User guide: [features/missing-files-relinking.md](../features/missing-files-relinking.md) · Spec: [SPEC-v0.0.1-missing-files-relinking.md](../../specs/SPEC-v0.0.1-missing-files-relinking.md)

## Detection (`src-tauri/src/library/service.rs::rescan`)

- Runs at startup and on the manual **Rescan** command only (DR-13) — no background timer, no watcher.
- For every row: file gone → `UPDATE documents SET missing = 1`; file present → flag cleared, `size`/`mtime` refreshed, cover job re-enqueued when the file identity changed (covers.md).
- Result reported as `RescanOutcome { missing_found, found_again }` → toast "N missing file(s) found" / "N file(s) found again".
- Opening a missing document fails with a typed `AppError` → error toast carrying the **Relink…** action (R4.6).

## Relink (`relink_document`)

- UI: `RelinkDialog.svelte`, a global singleton keyed by `feedback.relinkTargetId` — opened from the error toast action, the row's relink action, or the editor's **Relink…** button (which closes the editor first, since its snapshot would go stale). New path chosen via `tauri-plugin-dialog` native file picker.
- Command: `library_relink(id, new_path)` — verifies the file exists and parses as PDF, updates `path`/`size`/`mtime`, clears `missing`, re-enqueues the cover.
- Title re-derivation is gated by `documents.title_source` (metadata-editing.md): `auto` → new title from the new filename; `user` → manual title survives the relink.

## UI state

- `data-missing` attribute on row/card drives the visual flag; the missing count chip comes from `status_updated` (status-feedback.md).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | rescan sets/clears the flag, refreshes size/mtime, outcome counts; relink validates the file, clears the flag, title_source gating |
| `scripts/ui-smoke.mjs` | Rescan toast; row flagged missing; failed open produces a toast with the Relink… action; toast action opens the relink dialog; editor Relink… opens the same dialog; Esc closes the innermost overlay; Rescan finds the file again and clears the flag |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-missing-files-relinking.md, corrected to the verified code: editor Relink… entry point added during verification (UI-02); dialog is a singleton keyed by `relinkTargetId`.
