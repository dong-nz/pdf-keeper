# Opening and deleting

> **Status: 📝 Draft** — planned for v0.0.1; not implemented yet.

## Opening
Double-click a document (or Enter, or the Open action) — it opens in your system's default application for PDF files. If the file is missing, an error toast offers **Relink…** instead ([missing-files-relinking.md](missing-files-relinking.md)).

## Deleting
The Delete action offers both choices every time:
1. **Remove from library** — the entry is deleted; your file on disk is untouched.
2. **Delete file from disk** — asks for confirmation, then removes the file itself.

Bulk delete works the same way for a multi-selection.
