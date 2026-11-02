# Editing metadata

> **Status: 📝 Draft** — planned for v0.0.1; not implemented yet.

## The editor
Open via the Edit action on a row/card, or its context menu. The editor lets you change:
- **Title** (required), **Author**, **Notes** (free text)
- **Categories** (checkbox list)
- **Favorite** toggle
- **Relink…** when the file is missing ([missing-files-relinking.md](missing-files-relinking.md))
- Delete actions ([opening-and-deleting.md](opening-and-deleting.md))

## Automatic metadata at import
On import the app reads the PDF's internal properties for title and author. When they are unreadable (encrypted PDFs, some compressed files) it falls back to the filename. Extraction is a starting point — every field stays editable.

## Searchable
Title, author, and notes feed the search index ([searching.md](searching.md)). Renaming a document in the app changes only the library entry — your file on disk keeps its name.
