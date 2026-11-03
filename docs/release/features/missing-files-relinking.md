# Missing files and relinking

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## When files move or disappear outside the app
The app checks all indexed paths at startup and when you press **Rescan** — never continuously in the background.

A file that no longer exists is marked **missing** in the list and counted in the status bar. Missing entries are never removed automatically — they stay until you act.

## Relinking
- From the error toast when you try to open a missing document, or
- from the document editor's **Relink…** button.

Pick the file's new location: the entry points at the new path, the missing marker clears, and (for auto-titled entries) the title follows the new filename.
