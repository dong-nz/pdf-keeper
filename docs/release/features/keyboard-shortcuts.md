# Keyboard shortcuts

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3 and v0.0.4** — verified by running the app.

| Keys | Action |
|---|---|
| Ctrl+F (Cmd+F) | Focus the search box (pressing it again inside the box selects the text) |
| Ctrl+I (Cmd+I) | Import PDFs |
| ↑ ↓ Home End PageUp PageDown | Move through the list |
| Space | Select / deselect the focused document |
| Enter | Open the selected document |
| Delete | Delete flow for the selection |
| Esc | Close a dialog or menu; in the search box, clear the search; otherwise clear the selection |

Shortcuts never fire while you're typing in a text field — for example, Ctrl+F inside the document editor doesn't jump you to the search box.

Esc follows the same rule the other way: the dialog or menu you're working in closes first, and your selection is only cleared when nothing was open — cancel a delete dialog and the same selection is still there when you press Delete again.

The full app is keyboard-operable: sidebar, toolbar, document rows, dialogs (focus stays inside a dialog until it closes, then returns to where you were).

> **Amendment (2026-11-04, v0.0.2):** the sidebar is gone, and the app's menus are now part of the keyboard-operable surface: **Tab** reaches the Browse, Sort, View and application menus from the toolbar, **Enter** opens a menu, the **arrow keys** move through its items, **Enter** chooses, and **Esc** closes it — the same Esc rule as dialogs, so your selection is untouched. Everything else in the table above is unchanged. Opening a document is double-click or Enter on the focused row again (see [opening-and-deleting.md](opening-and-deleting.md)).

> **Amendment (2026-11-04, v0.0.3):** the table above is unchanged — every shortcut still works. What changed is which controls you reach with Tab and what Esc does.
>
> - The menus reachable from the toolbar are now **Browse, View and Settings** (plus the import menu inside the search box). There is no Sort control and no application menu: sorting is inside the View menu, and About is inside the Settings menu. The new **Select** switch is an ordinary button in the same tab order — Tab to it, Enter or Space toggles it; it has no shortcut of its own.
> - **Esc closes the dialog you're in**, always — including when a menu was open moments before and is on its way out. In the document editor, Esc with unsaved changes doesn't close the editor: it opens the *Discard changes?* step, where **Keep editing** puts you back with your draft intact and **Discard** closes the editor and leaves the stored text untouched. (That step has been in the app since v0.0.1; this is the first time this guide describes it — see [metadata-editing.md](metadata-editing.md).)
> - With nothing open, Esc still clears your selection — which now matters more than before, because in browsing mode a click never selects anything on its own ([selecting-documents.md](selecting-documents.md)).

> **Amendment (2026-11-05, v0.0.4):** one addition to the table:
>
> | Keys | Action |
> |---|---|
> | Ctrl+A (Cmd+A) | Select all documents currently loaded in the list |
>
> This one was promised for a long time and never actually worked — no version of the app reacted to the key; now it does. Like every other shortcut here it does nothing while you're typing in a text field: there, `Ctrl+A` selects the field's text like in any editor. Its selection follows everything described in [selecting-documents.md](selecting-documents.md) — bulk bar, *select all N matching*, `Esc` to clear. Everything else in the table and in the earlier amendments is unchanged.

> **Amendment (2026-11-07, v0.0.6):** `Enter` now opens the document in the **built-in reader** ([reading-pdfs.md](reading-pdfs.md)); **Open in external viewer** in the right-click menu hands it to your computer's other application instead. While a reading window is in front, it has its own keys: `PgUp` / `PgDn` move a page, `Home` / `End` jump to the first / last page, the page field at the top accepts a page number, and `Esc` closes the reading window. Every shortcut in the table above is unchanged.
