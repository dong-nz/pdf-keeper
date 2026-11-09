# Sorting and views

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4 and v0.0.7** — verified by running the app.

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

> **Amendment (2026-11-04, v0.0.3):** the **Sort control is gone from the toolbar** — sorting moved **inside the View menu**: *Sort by* (title / date added / file size, with the direction) and *Then by…* exactly as before, same choices, same remembered settings, same favorites-pinned-first rule. Nothing about how the library is ordered changed; only where you change it.
>
> **The grid now fills the window.** Before, a card was always 220 px wide and setting a fixed column count left empty space on the right. Now the columns you choose decide the width: the cards grow to fill the window, up to 320 px each, and when they can't use all the space the grid is centered instead of leaving a gap on one side. *Auto* works the same as before (it picks the number of columns from the window width), and − / + still stop at 2 and 10. Choosing *Auto* again brings back the automatic widths.
>
> **Rows are taller and covers are bigger.** A plain list row is 64 px instead of 48, and its cover thumbnail grew with it (45×64). A row that shows an author and notes is taller by one line each, as before. Rows no longer carry a selection checkbox or category labels — see [selecting-documents.md](selecting-documents.md) and [categories.md](categories.md).

> **Amendment (2026-11-05, v0.0.4):** three corrections, verified by running the app.
>
> - **The row's right-hand icons form a straight column.** The star, details and delete buttons now line up vertically across every row, no matter what a row shows — a row without a date, or without file information, no longer shifts them out of line.
> - **Card covers stay inside their cards** — with wide cards (a low column count in a wide window) the cover image used to run past the card's border; it now fills exactly the space the card gives it ([covers.md](covers.md)).
> - **The View menu stays inside the window.** Its *Columns* controls can no longer run past the bottom edge; a menu that doesn't fit ends at the edge and scrolls ([browsing-and-filtering.md](browsing-and-filtering.md)).
>
> Sorting (both keys, remembered settings, favorites pinned first), the column controls (Auto or 2–10, remembered), and grid sizing are unchanged.

> **Amendment (2026-11-09, v0.0.7):** five changes to how documents are presented, all verified by running the app.
>
> - **Rows are taller and covers are bigger.** A plain list row is 88 px instead of 64, and its cover thumbnail is 51×72 with an even 8 px margin above and below it. A row that shows an author and notes is taller by one line each, as before.
> - **Grid cards no longer show size or date text.** A card carries the cover and the title (and the author line when the document has one) — nothing else. Sizes and dates remain available in list rows and in a document's Details.
> - **Card hover buttons are always readable.** The star / details / delete line on a card now sits on its own opaque background, so the icons stay legible whatever the cover underneath looks like.
> - **Sizes are shown in the natural unit.** A size now reads in bytes below 1 000 B, in kB up to the point where it would round to 1 000 kB, and in megabytes from there (with one decimal below 100 MB, none above). What was "45 KB" may now read "450 kB" or "1.2 MB" — same size, clearer unit.
> - **The list and grid keep a gap under the toolbar.** The first row or card starts 12 px below the toolbar's bottom edge, matching the side margins added in v0.0.4 — documents no longer sit flush under the toolbar either.
>
> Sorting, column controls, grid sizing and the sidebar's absence are unchanged. Selected documents now look different — see [selecting-documents.md](selecting-documents.md).
