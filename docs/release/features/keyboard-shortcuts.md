# Keyboard shortcuts

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

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
