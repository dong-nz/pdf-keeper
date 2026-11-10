# Renaming a document's file

> **Status: 📝 Draft — planned for v0.0.8; not in the app yet.** This page describes planned behavior from the approved release plan; it is verified and marked Shipped only when the release ships.

Files you imported often carry the name a scanner or a download gave them. You can fix that from inside the app: **Rename** in a document's context menu or in its Details dialog.

- The app renames the actual file, in the same folder, and updates its library record to match. The file stays where it is — only its name changes.
- Everything you attached to the document survives: tags, favorite state, notes, Reading membership, a remembered password.
- A name already used by another library document, or by an existing file in that folder, is refused with a clear message — and nothing changes: not the file, not the record.
- Names the file system doesn't allow (empty, with slashes or reserved characters, ending in a dot or a space) are refused before anything happens.
- If the title shown in the app came from the filename, it updates with the new name. A title you edited yourself stays yours.
- The document's cover follows the new name automatically.
