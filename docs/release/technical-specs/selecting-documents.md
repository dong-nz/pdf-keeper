# Selecting documents — technical reference

**Since v0.0.3** · Requirements: UI-18 (ADDED in v0.0.3, DR-99/DR-99d), UI-03 (MODIFIED in v0.0.3), §5.2 (Escape) · User guide: [features/selecting-documents.md](../features/selecting-documents.md) · Specs: [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §2 (UI-03, selection semantics), §3.9 (UI-18) — decisions DR-99, DR-99d

## The mode (`ui/src/lib/state/layout.svelte.ts`)

- `selectMode = $state(false)` with `toggleSelectMode()`. It lives in the **layout** store because that store is already the single owner of document-area state (`areaWidth`, the Auto column count — sorting-and-views.md); adding a second boolean there keeps one owner rather than creating a second one (R1.6).
- **Session state only.** The mode is never written through `lib/state/settings.svelte.ts`, and `SETTINGS_KEYS` in `src-tauri/src/library/service.rs` carries no key for it — the setting grammar has no place for it, so it cannot be persisted by accident. It is `false` at every launch and after every restart (AC-30).
- The control is one toolbar button, `.select-toggle` in `components/Toolbar.svelte`, positioned between the search field and the View menu: `aria-pressed={layout.selectMode}`, `aria-label` from the catalog's `toolbar.select`, the `select` glyph already in `components/icons.ts`, wrapped in the shared `Tooltip`, `data-tauri-drag-region="false"` like every toolbar control (the-app-window.md). Its state is shown **on the control**, never as text, and it is an ordinary button in the toolbar's keyboard order — Tab reaches it, Enter/Space toggles it.

## What a click does (`DocumentRow.svelte`, `DocumentCard.svelte`)

Both components hold the same guard, in the same shape:

```ts
if (!layout.selectMode && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
  rowEl?.focus();          // browse mode: the click only takes roving-tabindex focus
  return;
}
library.toggleSelection(doc.id, event.shiftKey);
```

- **Browse mode (default, `selectMode === false`)** — a plain click selects nothing; it moves keyboard focus to the row so `Space` / `Enter` / `Delete` continue from there. Selection is reached by `Space` on the focused row, `Ctrl`/`Meta`-click (add/remove one) and `Shift`-click (range from the anchor).
- **Select mode (`selectMode === true`)** — a plain click toggles selection on the row or card; a second click unselects.
- **Modifier clicks behave identically in both modes**, and **activation is identical in both modes**: double-click, `Enter` on the focused row, or the Open action — the released FR-08 rule (D1 alignment, DR-66) is untouched by UI-18. Card rows use the same `library.toggleSelection` path as list rows; there is no second selection implementation (R1.6).

## Selection state (`ui/src/lib/state/library.svelte.ts`)

Unchanged by v0.0.3 — the mode changed which pointer events reach these functions, not the functions themselves:

- `selection: Set<number>`, replaced (never mutated) so Svelte reactivity sees a new value; `#shiftAnchor` owned here (§5.3.4), so a Shift range is computed from the loaded row order, both directions.
- `toggleSelection(id, shift)` — Shift extends from the anchor when both endpoints are in the loaded window, otherwise it behaves as a plain toggle and re-anchors.
- `selectAllMatching()` — the BulkBar's "select all N matching" path: an ids-only query (`api.libraryIds`, the same `#args()` filter/sort arguments as the visible list) so a partial window can be completed without fetching rows (AC-06). `selectAllLoaded()` is the loaded-window variant.
- `clearSelection()` also clears the anchor. `#pruneSelectionToVisible()` drops ids that left the current filter's result set, so a stale selection cannot act on documents the user no longer sees.
- `components/BulkBar.svelte` is unchanged: it appears whenever `selection.size > 0`, in either mode, with the category picker, favorite, delete, select-all-matching and clear controls.

## Escape (`App.svelte`)

§5.2's rule, implemented as a window-level listener that defers to any overlay:

```ts
if (event.defaultPrevented || feedback.overlayCount > 0) return;   // a dialog or menu consumed it
if (library.selection.size > 0) { event.preventDefault(); library.clearSelection(); }
```

Two independent signals are needed because a dialog's close chain drains microtasks before this listener runs, so `overlayCount` alone can read 0 while an overlay was in fact open (`feedback.beginOverlay`'s decrement is deferred); `defaultPrevented` covers the consumed case and the count covers Escape while focus sits outside the overlay. Only an unconsumed Escape clears the selection — closing a dialog with Escape keeps it (asserted in `flowOpen`'s dialog steps, opening-and-deleting.md).

## Invariants

- Selection is never persisted, in either mode; the mode itself is never persisted.
- No mode changes what a document action does: bulk category assignment, bulk favorite, delete and the confirmation dialogs read `selection` and are independent of how it was built.
- A row is selectable and openable in both modes; a card is selectable and openable in both modes.
- The empty-state, virtualization and status surfaces are mode-blind (status-feedback.md, sorting-and-views.md).

## Test mapping

| Layer | Coverage |
|---|---|
| `scripts/ui-smoke.mjs` · `flowSelectMode` | AC-30 as one continuous run: mode off at startup (`aria-pressed="false"`); with the mode off a click changes no selection and takes the row's focus, `Space` selects, `Ctrl`-click selects, `Shift`-click extends the range, double-click still opens; the toolbar toggle turns the mode on; with it on a click selects and never opens; the BulkBar's favorite action applies to the selection and lifts it again; the same two click cases in **grid** (card selected / card not selected); Escape with no overlay open clears the selection (§5.2); the mode is off again after a restart |
| `scripts/ui-smoke.mjs` · `flowOpen` | AC-12 / AC-30: a single click opens nothing **and** selects nothing in browse mode; double-click and Enter open (opening-and-deleting.md) |
| `scripts/ui-smoke.mjs` · `flowRowDesign`, `flowKeyboardAudit` | the row's keyboard contract with the checkbox gone (`Space` / `Enter` / `Delete` on the focused row), and the Select control present in the toolbar's keyboard order and reachable by Tab |
| `ui/src/lib/**` unit scope | no unit test exists for the selection store itself — its semantics (toggle, Shift range, anchor reset, pruning) predate v0.0.3 and were not changed, so they are exercised through `flowSelectMode` / `flowOpen` in the running app rather than re-asserted against a second implementation. `searchScope.test.ts` covers the filter state the selection is independent of; `feedback.test.ts` the overlay counting the Escape rule defers to |

## Change history

- 2026-11-04 (v0.0.3 — UI-18 ADDED, UI-03 MODIFIED; DR-99, DR-99d) — First shipped. **What a plain click means became a mode**, because the checkbox that used to carry selection was removed from rows and cards (UI-03): leaving a click that always selected would build selections users never asked for, and leaving it inert would leave no pointer path to selection at all. Browse mode keeps the click as focus-only (the D1 alignment's intent, DR-66, preserved); Select mode makes it a toggle; modifier clicks and activation are shared code in both. The mode is session-only by construction — no settings key exists for it. `library.svelte.ts`'s selection model, the BulkBar and every bulk action are the v0.0.2 code unchanged. Verified by `flowSelectMode` (the full AC-30 sequence, list and grid, including the restart check) and the updated AC-12 assertion in `flowOpen`.
