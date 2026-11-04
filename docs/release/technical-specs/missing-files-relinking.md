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

- `data-missing` attribute on row/card drives the visual flag. The missing count moved with the rest of the status surface (status-feedback.md): the status bar exists only when there is something to report, so the count is carried by the Browse menu's *Missing files* item (with its **Rescan** action) and by the Settings dialog's Library section.
- The row's relink action is one entry of the hover/focus-revealed actions line (UI-03 as modified, opening-and-deleting.md): `ROW_ACTION_IDS` is `favorite, details, delete`, so relink is reached through the **context menu**, the error toast's action, and the editor's **Relink…** button — the row line itself does not carry it, and the flag (`data-missing`) is what tells the user which rows need it.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | rescan sets/clears the flag, refreshes size/mtime, outcome counts; relink validates the file, clears the flag, title_source gating |
| `scripts/ui-smoke.mjs` | Rescan toast; row flagged missing; failed open produces a toast with the Relink… action; toast action opens the relink dialog; editor Relink… opens the same dialog; Esc closes the innermost overlay; Rescan finds the file again and clears the flag. **v0.0.3:** the same flow reaches Rescan through the Browse submenu (status bar hidden at zero counts) and re-checks the relink entry points against the new row design; `flowStatusBar` asserts the conditional bar with the Missing count and its Rescan action present (`status-feedback.md`) |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-missing-files-relinking.md, corrected to the verified code: editor Relink… entry point added during verification (UI-02); dialog is a singleton keyed by `relinkTargetId`.
- 2026-11-04 (v0.0.3 — presentation only; DR-101) — Detection, `rescan_missing`, `relink_document`, the `title_source` gating and the singleton relink dialog are unchanged. What moved is where the user sees and starts the work: the Missing count and the **Rescan** action now live in the Browse submenu (and the Settings dialog's Library section) because the status bar is shown only when there is something to report, and the row's own relink button went away with the row's permanent furniture (UI-03). The flag itself (`data-missing`) is still rendered on rows and cards. Verified by `flowMissingAndRelink` (flag → failed open → toast action → relink dialog → rescan clears the flag) and `flowStatusBar`.
