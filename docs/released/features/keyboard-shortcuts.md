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
