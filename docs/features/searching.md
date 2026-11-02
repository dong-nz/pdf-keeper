# Searching

> **Status: 📝 Draft** — agreed in SPEC-v0.0.1 (FR-03); not implemented yet.

## How it works
Type in the search box (Ctrl+F to focus). Results update as you type.

Search covers four fields: **title, filename, author, notes**. It matches prefixes — typing `repo` finds "Quarterly Report". Multiple words all have to match (AND).

## Combining filters
Search works together with a sidebar selection: search inside one category, or inside Favorites. Filters combine (AND).

## What search does NOT do (v1)
- It does not read inside PDF content — only the library's own fields.
- Identical files under different names are not detected as duplicates.

## Notes
Notes are free text you add in the document editor and are searchable — use them for keywords the file itself doesn't contain ([metadata-editing.md](metadata-editing.md)).
