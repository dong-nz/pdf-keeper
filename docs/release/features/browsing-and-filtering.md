# Browsing and filtering

> **Status: ✅ Shipped in v0.0.2, updated in v0.0.3, v0.0.4 and v0.0.7** — verified by running the app (10 000-document library).

The left sidebar is gone. Everything you used to do there — choosing All documents / Favorites / Missing, filtering by category, opening the category tools — now lives in one **Browse** menu and in the filter chips next to it.

## The Browse menu
The menu at the left end of the toolbar. It shows:

- **All documents**, **Favorites**, **Missing files** — each with its live count. The one you're using is marked with a check.
- **Categories ▸** — every category you have, each with its live document count, as checkable items. Checking marks it as a filter; checking another adds it.
- **Manage categories…** — opens the category manager ([categories.md](categories.md)).

Choosing **All documents** clears every filter at once.

## Filter chips
Whatever you have filtered by shows up as chips in the toolbar, so the current view is always visible: one chip per active category, one chip for Favorites or Missing. Each chip has a **×** that removes only that filter. No chips means you're looking at the whole library.

## Several categories at once
You can now filter by more than one category. The result is documents that are in **any** of the checked categories — a document that's in two of them appears once, not twice.

These filters combine the way they always did: a document appears when it matches **at least one checked category** *and* your **search terms** *and* the Favorites/Missing choice if you picked one. Counts in the status bar and in the menu always describe what you're seeing.

## Your filters are remembered
Close the app and reopen it: the same filters are restored, shown as chips.

## Keyboard
Tab reaches the Browse menu from the toolbar, Enter opens it, the arrow keys move through its items, Enter chooses, Esc closes it. The same keyboard path works for the View menu and the app menu (verified end-to-end through the app menu's About item).

> **Amendment (2026-11-04, v0.0.3):** **there are no filter chips any more.** The Browse menu is now the only place your active filter is shown and the only place you clear it: the categories you are filtering by appear there as checked items, and *All documents* is checked when nothing is active. Everything else about filtering is unchanged — several categories at once still mean "in any of them", your filters are still restored when you reopen the app (shown as checked items in the menu), and choosing *All documents* still clears every filter at once. Verified with two categories active at the same time: both appear as checked, clearing one leaves the other in place.
>
> The counts moved here too. *All documents*, *Favorites* and *Missing files* carry their numbers in the menu, and a **Rescan files** item sits alongside *Manage categories…* — it's greyed out while an import or another job is running, exactly as the old button was. The bottom bar no longer shows those numbers; see [status-feedback.md](status-feedback.md).
>
> The keyboard paragraph above is corrected in one respect: the View menu is now the only other menu in the bar besides Settings — sorting lives inside it.

> **Amendment (2026-11-05, v0.0.4):** four corrections, all verified by running the app.
>
> - **Menu labels no longer carry "…"** — *Manage categories…*, *Settings…*, *About PDF Keeper…*, *Import files…*, *Import folder…* and *Relink…* are now plain names. This is the rule for the whole application: anything that performs an action is named without the trailing dots. Only labels that name work already under way keep them ("Importing…", "Checking files…", "Generating covers…" while a job runs). Other guide pages quote the old names in their older text; where they do, read the name without the dots.
> - **Menus and submenus stay inside the window.** A long list — the Categories submenu with many categories — no longer runs past the bottom edge: it ends at the edge and scrolls, and the arrow keys keep the highlighted item visible while you move through it. The same holds for every menu, including the View menu's Columns controls.
> - **The Browse menu's icon column is complete.** *Manage categories* now carries its own icon like every other item in the menu; nothing in the list is missing its leading symbol.
> - **Your documents no longer sit flush against the window edges.** The list and the grid have a small margin on both sides, matching the space the toolbar already keeps.
>
> Filtering behavior, counts, multi-category filtering and filter restoring are all unchanged.

> **Amendment (2026-11-09, v0.0.7): the Browse menu's wording** (verified by running the app).
>
> - **Items renamed.** *Missing files* is now **Missing documents**, and *Rescan files* is now **Rescan documents** — same positions, same live counts beside them, same grey-out while a job runs. This is part of an application-wide naming correction: your library's items are **documents** everywhere (menus, messages, toasts, dialogs); "file" now appears only where the physical file on disk is meant — relinking to a new file location, a missing entry's last known location, "no such file" errors.
> - The bottom bar's document count now carries its label — "1,234 documents" ([status-feedback.md](status-feedback.md)).
>
> Filtering behavior, counts, multi-category filtering and filter restoring are all unchanged.
