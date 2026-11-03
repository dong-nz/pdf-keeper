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
