# Selecting documents — technical reference

**Since v0.0.3 · updated in v0.0.4 and v0.0.7** · Requirements: UI-18 (ADDED in v0.0.3, DR-99/DR-99d), UI-03 (MODIFIED in v0.0.3), §5.2 (Escape); v0.0.4: D12 (`Ctrl+A` wiring, AC-52); v0.0.7: UI-38 (selection emphasis, §3.17, DR-220, corrected at build by DR-246) · User guide: [features/selecting-documents.md](../features/selecting-documents.md) · Specs: [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §2 (UI-03, selection semantics), §3.9 (UI-18) — decisions DR-99, DR-99d; [SPEC-v0.0.4.md](../../specs/SPEC-v0.0.4.md) §3.21 — decision DR-121; [SPEC-v0.0.7.md](../../specs/SPEC-v0.0.7.md) §3.17 — decisions DR-220, DR-246

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

## Select all via keyboard (D12, fixed in v0.0.4)

The v0.0.1 keyboard map (§5.2/§5.3 rule 5) has always promised "`Ctrl+A` selects the loaded rows", and the store has always had `library.selectAllLoaded()` — but **no handler ever bound the key**: the method had no caller and no released smoke flow exercised it. Found by the v0.0.4 empty-library flow; the user chose to wire the released key rather than route the flow through Space + "Select all N matching" (DR-121).

`ui/src/App.svelte`'s `onGlobalKeydown` gained a `mod && key === "a"` branch behind the same `isTextTarget` guard as every other shortcut: `preventDefault()` then `library.selectAllLoaded()`. `Ctrl+A` typed in a text field (the search box, a dialog input) still does plain text-select-all. The store method, the loaded-window semantics, the BulkBar's "Select all N matching" extension and every selection invariant are the v0.0.3 code unchanged — the binding was the only missing piece.

## Selection emphasis (UI-38, added in v0.0.7, §3.17)

Before v0.0.7 a selected row or card carried only a faint background shift — close to the hover ground, so "selected" and "hovered" read alike. The treatment is now a distinct ground plus a mark, per ramp, from tokens:

- **`--selection-tint`** joins `design-tokens.css` per ramp, drafted from the ramp's accent: light `rgba(100, 74, 201, 0.20)` (Alucard Purple at 20 %, against the 12 % menu-hover tint), dark `rgba(189, 147, 249, 0.16)` (dark accent at 16 %, against 8 %) — same hue family as the accent, stronger than hover. The shipped values are the ones the measured guard confirms (the DR-145/DR-198 pattern): every text role rendering on a selected row or card clears 4.5:1 on the composited ground (tint over the ramp's surface), and the composited selection ground is measurably separated from the ramp's hover ground (CIE76 ΔE ≥ 10).
- **Cards** (`DocumentCard.svelte`): `[data-selected]` → `background: var(--selection-tint)` plus `box-shadow: inset 0 0 0 1px var(--accent)` — the ring inside the existing box, no layout change; with the DR-245 content inset (sorting-and-views.md) the tint paints a visible 5 px frame band around the cover.
- **Rows** (`DocumentRow.svelte`, re-cut at build by DR-246): the first build rendered the card treatment on rows as **two parallel border lines** — every row carries a `border-bottom` separator, and the inset ring added a second accent line inside it. The shipped row rule: `[data-selected]` keeps the tint, carries **no box-shadow**, and sets `border-bottom-color: var(--accent)`; a row whose bottom separator is the boundary **to** a selected row carries the same accent bottom border — so every boundary adjacent to a selection is exactly one accent line, including between two adjacent selected rows (the separator is shared by construction; a run of selected rows reads as one continuous block). The "row before" side is store-derived, not a CSS sibling rule — the row receives its `nextId` prop and derives `boundarySelected = nextId !== undefined && library.selection.has(nextId)` (the kit's `ContextMenu.Trigger` wraps each row, so a sibling selector cannot reach the row below; R5.1 single source).
- Selection stays a data attribute driven by the selection store; hover keeps its own lighter ground. BulkBar, counts, keyboard selection, the favorites view: untouched.

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
| `scripts/ui-smoke.mjs` · `flowMetadata` | **v0.0.4 (AC-52):** `Ctrl+A` while a text field owns focus selects the field's text and starts no library selection (the §5.2 text-target guard holds) |
| `scripts/ui-smoke.mjs` · `flowEmptyAndSkeleton` | **v0.0.4 (AC-52):** `Ctrl+A` with focus outside a text target selects the loaded rows and opens the bulk bar reporting the loaded count — the released v0.0.1 keyboard map path, wired for the first time (D12) |
| `ui/src/lib/design-tokens.test.ts` (v0.0.7 extension) | **v0.0.7 (UI-38/AC-97 mechanism):** `--selection-tint` pairs join the contrast table for both ramps (text roles on the composited ground — tint over the ramp's surface — each ≥ 4.5:1) plus the ΔE separation check between the composited selection ground and the ramp's hover ground (≥ 10, CIE76) |
| `scripts/ui-smoke.mjs` · `flowDarkRamp` (v0.0.7 extension) | **v0.0.7 (AC-81/AC-97):** the token audit gains the `--selection-tint` entry; the selected-card half measures the real treatment in both ramps — computed background equals the ramp's `--selection-tint` composite and the computed `box-shadow` carries the accent at 1 px; a selected **row** measures the tint plus the accent separator (computed `border-bottom-color` = the ramp's accent; the row directly above a selected row likewise; its own `box-shadow` is `none` — the DR-246 assertion); a hovered unselected row/card measures its own ground, distinct from the selection composite |
| `ui/src/lib/**` unit scope | no unit test exists for the selection store itself — its semantics (toggle, Shift range, anchor reset, pruning) predate v0.0.3 and were not changed, so they are exercised through `flowSelectMode` / `flowOpen` in the running app rather than re-asserted against a second implementation. `searchScope.test.ts` covers the filter state the selection is independent of; `feedback.test.ts` the overlay counting the Escape rule defers to |

## Change history

- 2026-11-04 (v0.0.3 — UI-18 ADDED, UI-03 MODIFIED; DR-99, DR-99d) — First shipped. **What a plain click means became a mode**, because the checkbox that used to carry selection was removed from rows and cards (UI-03): leaving a click that always selected would build selections users never asked for, and leaving it inert would leave no pointer path to selection at all. Browse mode keeps the click as focus-only (the D1 alignment's intent, DR-66, preserved); Select mode makes it a toggle; modifier clicks and activation are shared code in both. The mode is session-only by construction — no settings key exists for it. `library.svelte.ts`'s selection model, the BulkBar and every bulk action are the v0.0.2 code unchanged. Verified by `flowSelectMode` (the full AC-30 sequence, list and grid, including the restart check) and the updated AC-12 assertion in `flowOpen`.
- 2026-11-05 (v0.0.4 — D12 §3.21, DR-121) — **`Ctrl+A` was wired.** The released keyboard map (v0.0.1 §5.2, §5.3 rule 5) promised it and the store method `selectAllLoaded()` existed — no handler ever bound the key; the defect surfaced during the v0.0.4 empty-library flow. The binding joined `App.svelte`'s global key handler behind the existing text-target guard: outside a text field it selects the loaded rows and opens the bulk bar; inside one it stays text-select-all. Selection semantics, the BulkBar, the Escape rule and the mode are unchanged. Verified by `flowEmptyAndSkeleton` (bulk bar from Ctrl+A) and `flowMetadata` (the text-field guard), AC-52.
- 2026-11-09 (v0.0.7 — UI-38 ADDED §3.17, DR-220; corrected at build DR-246) — **Selection became visibly distinct from hover.** New per-ramp `--selection-tint` token (light: Alucard Purple at 20 %, dark: dark accent at 16 %), guarded by the shipped contrast table (text roles on the composited ground ≥ 4.5:1) plus a new ΔE ≥ 10 separation check against each ramp's hover ground. Cards: tint + `inset 0 0 0 1px var(--accent)` ring (no layout change; visible as a framed band with the DR-245 content inset). Rows: the card treatment rendered as two parallel border lines on the first build (row separator + inset ring) — re-cut to tint + accent `border-bottom`, with the boundary **to** a selected row carrying the same accent border from the store-derived `boundarySelected` (`nextId` prop; a CSS sibling rule cannot cross the per-row `ContextMenu.Trigger` wrapper). Selection semantics, the mode, the BulkBar, the Escape rule and all keyboard paths are unchanged. Verified: Phase A feature-lane runs 2026-11-09 green per the Build ledger, plus the user's Phase-B real-app confirmation (Phase C skipped for this release, DR-248) — `flowDarkRamp` selected halves green in both ramps, `design-tokens.test.ts` pairs and ΔE check pass.
