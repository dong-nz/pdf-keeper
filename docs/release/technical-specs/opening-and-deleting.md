# Opening & deleting — technical reference

**Since v0.0.1 · design updated in v0.0.2** · Requirements: FR-08, FR-09, UI-03, UI-05 · User guide: [features/opening-and-deleting.md](../features/opening-and-deleting.md) · Specs: [SPEC-v0.0.1-opening-and-deleting.md](../../specs/SPEC-v0.0.1-opening-and-deleting.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (D1), §3.7

## Opening (FR-08)

- `resolve_open_target(id)` (`library/service.rs`): returns the stored path; a `missing` document yields a typed `AppError` (no silent failure).
- The command layer hands the path to `tauri-plugin-opener` (`open_path`) — the OS default handler opens the file; PDF Keeper never renders PDFs itself.
- **Activation (as fixed in v0.0.2, DR-66):** `ondblclick={() => library.open(id)}` on both `DocumentRow.svelte` and `DocumentCard.svelte`; **a single click only focuses or selects** (`rowClick` / `cardClick` — plain click focuses the row, Shift/Ctrl-click toggles selection, the checkbox is the other selection path), `Enter` on the focused row and the row's Open action activate through the same `library.open` store path. The shipped v0.0.1 code opened on single click, contradicting the released FR-08 text; the code was aligned to the spec rather than the spec to the code, and the smoke suite gained the negative case (a single click must not open).

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
| `scripts/ui-smoke.mjs` | Enter opens a present file via the OS (no failure surfaced); confirmation dialog cancel/confirm paths; editor Delete… cancel keeps the document, confirm removes it; selection → bulk delete. **v0.0.2 (AC-12):** `flowOpen` counts `app_open_document` calls at the real command boundary — a single click selects the row and opens nothing (zero calls), a real double-click activates the document, and Enter on the focused row still opens. The flow carries a fallback (dispatch a synthetic `dblclick` and mark the native check skipped) for drivers whose pointer action chain does not produce a native double-click; the verified run used the native path with nothing skipped |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-opening-and-deleting.md, corrected to the verified code: plural-aware confirmation title; editor Delete… handoff added during verification (UI-02); `delete` returning success for caller-side outcome handling.
- 2026-11-04 (v0.0.2 — defect D1, DR-66) — **Activation aligned to the released FR-08 text.** The shipped build opened a document on a single click; rows and cards now open on double-click only, while a single click focuses or selects (Shift/Ctrl-click selection unchanged) and Enter / the Open action keep working through the same store path. No requirement changed and no backend change was involved. Verified by the AC-12 negative case added to `flowOpen` (single click produces no command call; double-click and Enter do).
