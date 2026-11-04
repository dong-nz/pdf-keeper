# Importing PDFs

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## Three ways to add PDFs
1. **File picker** — Import button (or Ctrl+I), select one or many files.
2. **Drag and drop** — drop files onto the app window.
3. **Import folder…** — pick a directory; every PDF inside is added in one action. Nothing is watched continuously — it is a single bulk action.

## Auto-assignment
If a category is selected in the sidebar while you import, the imported documents are assigned to it automatically. With no category selected, nothing is assigned — organize later via the editor or bulk actions.

## Duplicates
A file whose exact path is already in the library is skipped, with a notice in the results. The app does not look for content-identical copies at other paths.

## What happens after import
- Title and author are read from the PDF's own properties when available; otherwise the filename is used (see [metadata-editing.md](metadata-editing.md)).
- Cover thumbnails are generated in the background — the app stays usable while it works.
- A toast reports how many were imported/skipped; the status bar shows library totals.

## Limits (v1)
No full-text content indexing; importing does not move, copy, or rename your files.

> **Amendment (2026-11-04, v0.0.2):** auto-assignment now follows the filters you actually have active, and the sidebar it referred to is gone. Import while **one or more** categories are checked (Browse ▸ Categories — they appear as chips in the toolbar) and every imported document is added to **each of those categories** in the same single action. With no category active, nothing is assigned, exactly as before. Duplicate handling, progress reporting and the rest of the import flow are unchanged.

> **Amendment (2026-11-04, v0.0.3):** the **Import button is no longer in the toolbar**. The import control is now the small **＋** at the right end of the search box: clicking it gives the same two choices as before — **Import files…** and **Import folder…** — and both open the same pickers (files with the PDF filter, or a whole folder). While you have text in the search box, that same spot holds the clear button instead, so the ＋ reappears when you clear it. `Ctrl+I` (Cmd+I) and drag-and-drop onto the window work exactly as before, and everything described above about what an import does — auto-assignment to every active category, duplicates skipped with a notice, titles and covers filled in in the background — is unchanged.
