# Searching

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

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

> **Amendment (2026-11-04, v0.0.2):** *(recorded late — this page should have carried it with the v0.0.2 release.)* There is no sidebar: search combines with the filters you set in the **Browse** menu — one or several categories, Favorites, Missing — exactly as described above, and those filters are shown as checked items in that menu ([browsing-and-filtering.md](browsing-and-filtering.md)).

> **Amendment (2026-11-04, v0.0.3):** the search box now **tells you what it would search**. Before you type, its grey text says what the search would cover: "Search in 9,997 documents", or "Search in *Recipes*", or "Search in 2 categories", or "Search in Favorites", or "Search in Favorites · 2 categories" — whatever you currently have selected. It's only a hint: it never becomes part of your search, it disappears as soon as you type, and it's never saved. What the search box *is called* for screen readers stays "Search", whatever the hint says. The ＋ import control sits at the right end of the box ([importing-pdfs.md](importing-pdfs.md)); the clear button takes that spot while the box has text. How searching works — prefix matching over title, filename, author and notes, several words all required, results as you type — is unchanged.
