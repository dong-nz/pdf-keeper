# Selecting documents

> **Status: ✅ Shipped in v0.0.3** — verified by running the app, in both list and grid, with the mode on and off.

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
