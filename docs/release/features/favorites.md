# Favorites

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3 and v0.0.4** — verified by running the app.

- Star a document from its row/card, context menu, or editor.
- Favorited documents always appear first in every list, whatever the current sort ([sorting-and-views.md](sorting-and-views.md)). When you star a document you're looking at mid-list, the row stays where it is — the new position at the top takes effect the next time the list is refreshed (switching views or filters). Starring from the context menu or the editor moves it immediately.
- **Favorites** in the sidebar filters the library to starred documents; it combines with search and category filters. The sidebar and the counts in the status bar show how many documents are starred.

> **Amendment (2026-11-04, v0.0.2):** *Favorites* is now an item in the **Browse** menu rather than a sidebar entry ([browsing-and-filtering.md](browsing-and-filtering.md)).

> **Amendment (2026-11-04, v0.0.3):** a starred document no longer carries a permanent star in the list or the grid. The star is one of the row's hover actions: it appears when you move the pointer over a row or reach it with the keyboard, and it shows whether that document is starred at that moment. A favorited document is still recognisable because it sits at the top of every list and because **Browse ▸ Favorites** lists exactly the starred documents, with the count next to it. Starring, un-starring, the pinning rules and the "row stays where it is until the list refreshes" behavior are all unchanged.

> **Amendment (2026-11-05, v0.0.4):** one correction, verified by running the app. The star in the row's hover action line was smaller than the other action buttons and had no label on hover. It now matches the other actions exactly: same button size, and hovering it or reaching it with the keyboard shows its name ("Add to favorites" / "Remove from favorites"). Where a row shows the **Relink** action (missing documents), all action buttons — star, details, delete, relink — line up on the same size and share the same hover-label behavior. Starring behavior itself is unchanged.
