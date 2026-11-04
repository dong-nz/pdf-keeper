# Browsing and filtering

> **Status: ✅ Shipped in v0.0.2** — verified by running the app (10 000-document library).

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
