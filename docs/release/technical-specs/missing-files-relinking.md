# Missing files & relinking — technical reference

**Since v0.0.1, updated in v0.0.4** · Requirements: FR-11, FR-12, UI-02; v0.0.4: defect D8, UI-25, D11 (colors) · User guide: [features/missing-files-relinking.md](../features/missing-files-relinking.md) · Spec: [SPEC-v0.0.1-missing-files-relinking.md](../../specs/SPEC-v0.0.1-missing-files-relinking.md) (v0.0.4 changes: [SPEC-v0.0.4.md](../../specs/SPEC-v0.0.4.md) §3.6, §3.16)

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
- **Row action line (v0.0.4, D8):** `ROW_ACTION_IDS` is `favorite, details, delete, relink` — relink carries `applies: doc.missing` and the shared rendering order of `documentActions`, so a missing document's row/card shows **Relink** in the same sequence its context menu shows, and running it opens the same singleton dialog. Present files' rows are unchanged.
- **Missing-state rendering (v0.0.4, UI-25):** one state, one treatment. The row flag (`MissingBadge.svelte`) is plain `--warning`-colored text — no filled pill — with the last-known path as its tooltip (`data-path` hook); the card carries a compact tinted badge (warning-tinted ground, radius = half its height). The status surfaces (Browse submenu, Settings Library row, status bar) already reported plain warning text; the row now matches them. The colors are the D11 text-role values (settings-and-appearance.md).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | rescan sets/clears the flag, refreshes size/mtime, outcome counts; relink validates the file, clears the flag, title_source gating |
| `scripts/ui-smoke.mjs` | Rescan toast; row flagged missing; failed open produces a toast with the Relink action; toast action opens the relink dialog; editor Relink opens the same dialog; Esc closes the innermost overlay; Rescan finds the file again and clears the flag; the same flow reaches Rescan through the Browse submenu (status bar hidden at zero counts); `flowStatusBar` asserts the conditional bar with the Missing count and its Rescan action present (`status-feedback.md`). **v0.0.4 (AC-37, AC-41):** the row and card actions lines carry **Relink** in context-menu order for missing documents and not for present ones; the row flag is plain warning-colored text with the stored-path tooltip and no ground; the card badge is the tinted half-height-radius treatment |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-missing-files-relinking.md, corrected to the verified code: editor Relink… entry point added during verification (UI-02); dialog is a singleton keyed by `relinkTargetId`.
- 2026-11-04 (v0.0.3 — presentation only; DR-101) — Detection, `rescan_missing`, `relink_document`, the `title_source` gating and the singleton relink dialog are unchanged. What moved is where the user sees and starts the work: the Missing count and the **Rescan** action now live in the Browse submenu (and the Settings dialog's Library section) because the status bar is shown only when there is something to report, and the row's own relink button went away with the row's permanent furniture (UI-03). The flag itself (`data-missing`) is still rendered on rows and cards. Verified by `flowMissingAndRelink` (flag → failed open → toast action → relink dialog → rescan clears the flag) and `flowStatusBar`.
- 2026-11-05 (v0.0.4 — D8 §3.6, UI-25 §3.16, D11 colors) — `ROW_ACTION_IDS` gains `relink` with `applies: doc.missing`, rendered in `documentActions` order so the row/card actions line and the context menu show the same sequence (AC-37); the editor button and the toast action are named **Relink** without the ellipsis (UI-20). The row flag changes from the filled pill (shared with cards) to plain `--warning` text with the last-known path as tooltip; the card keeps a compact tinted badge with radius = half its height — the treatment UI-25 chose (DR-116b), with the D11 text-role colors. Detection, rescan, `relink_document`, the title gating and the singleton dialog are unchanged.
