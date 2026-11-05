# Editing metadata

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3 and v0.0.4** — verified by running the app.

## The editor
Open via the Details action on a row/card, or its context menu. The editor lets you change:
- **Title** (required), **Author**, **Notes** (free text)
- **Categories** (checkbox list)
- **Favorite** toggle
- **Relink…** when the file is missing ([missing-files-relinking.md](missing-files-relinking.md))
- Delete actions ([opening-and-deleting.md](opening-and-deleting.md))

## Automatic metadata at import
On import the app reads the PDF's internal properties for title and author. When they are unreadable (encrypted PDFs, some compressed files) it falls back to the filename. Extraction is a starting point — every field stays editable.

## Searchable
Title, author, and notes feed the search index ([searching.md](searching.md)). Renaming a document in the app changes only the library entry — your file on disk keeps its name.

> **Amendment (2026-11-04, v0.0.2):** author and notes are now visible in the library itself, not only in the editor. A list row shows the **author as a line under the title** and the **notes as a further line** below it; a grid card shows the author under the title (notes remain in the editor, which is still their full view). Long titles are cut at two lines on cards and one line in rows, and hovering any cut title, author or notes line shows its full text. Documents without an author or notes show no line and reserve no space for one.

> **Amendment (2026-11-04, v0.0.3):** one behavior that has been in the app since the first release, described here for the first time because it was checked in this release: pressing **Esc** in the editor **while you have unsaved changes** does not close it. A *Discard changes?* step appears in the editor instead — **Keep editing** dismisses it and leaves your draft exactly as it was, **Discard** closes the editor and leaves the stored title, author and notes untouched. Nothing else about the editor changed. The only visible change on a row is its Details button's icon (an "i" now, instead of the tag symbol); the editor itself, its fields, the category checkboxes and the delete actions are unchanged.

> **Amendment (2026-11-05, v0.0.4):** one correction, verified by running the app. The editor's **Relink…** button is named **Relink**, without the dots (see the label rule in [browsing-and-filtering.md](browsing-and-filtering.md)); it does exactly what it did before. The editor itself — fields, categories, favorite toggle, the *Discard changes?* step, delete actions — is unchanged. One behavior worth knowing, because it was checked in this release: `Ctrl+A` **inside the editor's text fields** selects the field's text like in any editor and does not select documents.
