# Opening & deleting — technical reference

**Since v0.0.1** · Requirements: FR-08, FR-09, UI-03, UI-05 · User guide: [features/opening-and-deleting.md](../features/opening-and-deleting.md) · Spec: [SPEC-v0.0.1-opening-and-deleting.md](../../specs/SPEC-v0.0.1-opening-and-deleting.md)

## Opening (FR-08)

- `resolve_open_target(id)` (`library/service.rs`): returns the stored path; a `missing` document yields a typed `AppError` (no silent failure).
- The command layer hands the path to `tauri-plugin-opener` (`open_path`) — the OS default handler opens the file; PDF Keeper never renders PDFs itself.
- Row/card activation: Enter on the focused row, double-click, or the row Open action — one shared `library.open` path in the store.

## Deleting (FR-09)

- Two commands: `library_delete_document(ids)` (library row only; file stays on disk) and `library_delete_document_and_file(ids)`.
- `DeleteDialog.svelte` is the single confirmation surface (row action, context menu, bulk bar, and the editor's Delete… all route here). Title is plural-aware (`delete.title.one/.other`); body states files are untouched unless the user picks **Delete with files**.
- File-deletion failure (DR-50b): rows stay intact, an error toast offers a **retry** action bound to `delete(ids, true)`. `library.delete` returns success so callers (the editor) can distinguish completed deletion from cancel.
- Deletion removes cover-cache entries with the row (orphan sweep also catches leftovers at startup).

## Selection & actions (UI-05)

- Checkbox selection + bulk bar; context menu and row buttons render the same action list (`lib/actions.ts`) — parity is structural, not duplicated (R4.7). Closing the menu with Esc must not clear the selection (§5.2).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/` tests | open target resolution incl. missing → typed error; delete row-only vs delete-with-file; file-delete failure keeps rows |
| `scripts/ui-smoke.mjs` | Enter opens a present file via the OS (no failure surfaced); confirmation dialog cancel/confirm paths; editor Delete… cancel keeps the document, confirm removes it; selection → bulk delete |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-opening-and-deleting.md, corrected to the verified code: plural-aware confirmation title; editor Delete… handoff added during verification (UI-02); `delete` returning success for caller-side outcome handling.
