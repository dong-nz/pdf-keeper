# Sorting and views

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## Sorting
Toolbar selector offers: title, date added, file size — ascending or descending. Default is title A→Z. Favorites are pinned above everything else. Your choice is remembered between sessions.

## Views
- **List** — dense table: cover thumbnail, title, category badges, filename, size, date added, actions.
- **Grid** — cards with the cover as the card image ([covers.md](covers.md)).

Switch with the toolbar view control; your choice is remembered. Both views stay smooth with large libraries (tested with 10 000 documents) — only visible rows are rendered.

## Collapsing the sidebar
The sidebar has a collapse control (its chevron, at the bottom of the sidebar). Collapsed, it becomes a narrow icon rail: the saved searches and your categories stay clickable as icons; names, counts and the add-category field are hidden. The chevron expands it back. The choice is not remembered — the sidebar opens expanded on every launch.

> **Amendment (2026-11-04, v0.0.2):** the sidebar and its collapse control are gone ([browsing-and-filtering.md](browsing-and-filtering.md)).
>
> **Views** are now one **View** menu in the toolbar instead of two buttons: *List view* / *Grid view* (the current one is marked), then a **Columns** control for the grid — **Auto** (the default: the number of columns is worked out from the window width) or a fixed count between 2 and 10, adjusted with − / +. A fixed count applies immediately and is remembered between sessions; − / + stop at 2 and 10.
>
> **Sorting** gains a second key. The Sort menu now has a **Then by…** choice: *None* (the default), then title, date added, or file size. When two documents tie on the first key, the second one decides the order, so the list is always in a fixed, repeatable order. Your choice of both keys is remembered, and favorites stay pinned at the top as before.
