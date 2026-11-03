# Opening and deleting

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## Opening
Double-click a document (or press Enter on a focused selection, or use **Open** in its context menu) — it opens in your system's default application for PDF files. If the file is missing, an error toast offers **Relink…** instead ([missing-files-relinking.md](missing-files-relinking.md)).

## Deleting
Deleting (the Delete key, the row's delete action, or **Delete** in the bulk bar) asks first: a confirmation dialog shows how many documents you're about to remove and gives two choices:

- **Delete from library** — the entries are removed; your files on disk are untouched.
- **Delete with files** — removes the files themselves too (the dialog's tooltip spells this out).

Pressing Esc cancels — your selection stays, so you can retry the same action. Bulk delete works the same way for a multi-selection.
