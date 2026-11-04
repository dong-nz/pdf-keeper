# Browsing and filtering

> **Status: ✅ Shipped in v0.0.2, updated in v0.0.3** — verified by running the app (10 000-document library).

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
