# Selecting documents

> **Status: ✅ Shipped in v0.0.3, updated in v0.0.4 and v0.0.7** — verified by running the app, in both list and grid, with the mode on and off.

PDF Keeper has two ways to use a click, and one button in the top bar decides which one you get.

## Browsing mode (the default)

A single click on a document does nothing to your selection — it just puts the keyboard focus on that row so you can keep working with the keyboard. Opening a document is a double-click, or `Enter` on the focused row.

To select documents here:

- `Space` on the focused row selects it; press it again to unselect.
- `Ctrl`-click picks a document without changing what you already selected.
- `Shift`-click takes everything between your last selection and the one you click.

## Selecting mode

Press the **Select** button in the top bar (it sits just left of the View button). While it is switched on, a click on a document or a card selects it — a second click unselects it. Nothing opens from a click in this mode; a double-click still opens.

Switch it off again when you are done, or just leave it: the mode is not remembered, and every time you start the application you are back in browsing mode. The Select button is an ordinary button in the toolbar's keyboard order — Tab reaches it, Enter or Space toggles it, and it shows a pressed look while selection mode is on.

## Working with what you selected

Whenever one or more documents are selected — in either mode — a bar appears above the list showing how many you have, with the actions for all of them: put them in categories, add or remove the favorite star, delete them, and "select all N matching" when you have only part of the current list selected. Press `Esc` or the bar's clear button to let go of the selection.

> **Amendment (2026-11-05, v0.0.4):** **`Ctrl+A` now works.** It selects every document currently loaded in the list (both modes, list and grid) — the bulk bar appears like for any other selection. If your view shows only part of a longer result, the bar's *select all N matching* finishes the job, exactly as described above. Inside a text field `Ctrl+A` selects the field's text like in any editor and does not touch your library. Nothing else about selecting changed — `Space`, `Ctrl`-click, `Shift`-click, the Select switch, and `Esc` all behave as before.

> **Amendment (2026-11-09, v0.0.7): selected documents are now visibly different from merely hovered ones** (verified in the running app, in both appearances, in list and grid).
>
> - A selected row or card carries a soft tint over its background — a distinct ground that hovering never produces.
> - **Cards** add a colored outline hugging the cover, plus a thin inner ring around the card's edge.
> - **List rows** mark the selection with the accent color on their separating lines: a selected row's own bottom line, and the line just above it, are drawn in the accent color. A run of adjacent selected rows reads as one continuous block.
> - Hovering still highlights, but on its own lighter ground; the two states can no longer be confused with each other.
>
> Selection behavior — `Space`, `Ctrl`-click, `Shift`-click, the Select switch, `Ctrl+A`, `Esc`, clearing, what actions apply to — is unchanged.
