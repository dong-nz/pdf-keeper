# Importing PDFs

> **Status: 📝 Draft** — agreed in SPEC-v0.7 (FR-10, FR-11); not implemented yet.

## Three ways to add PDFs (FR-10)
1. **File picker** — Import button (or Ctrl+I), select one or many files.
2. **Drag and drop** — drop files onto the app window.
3. **Import folder…** — pick a directory; every PDF inside is added in one action. Nothing is watched continuously — it is a single bulk action.

## Auto-assignment
If a category is selected in the sidebar while you import, the imported documents are assigned to it automatically. With no category selected, nothing is assigned — organize later via the editor or bulk actions.

## Duplicates (FR-11)
A file whose exact path is already in the library is skipped, with a notice in the results. The app does not look for content-identical copies at other paths.

## What happens after import
- Title and author are read from the PDF's own properties when available; otherwise the filename is used (see [metadata-editing.md](metadata-editing.md)).
- Cover thumbnails are generated in the background — the app stays usable while it works.
- A toast reports how many were imported/skipped; the status bar shows library totals.

## Limits (v1)
No full-text content indexing; importing does not move, copy, or rename your files.
