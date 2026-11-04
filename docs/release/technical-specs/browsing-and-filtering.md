# Browsing & filtering — technical reference

**Since v0.0.2** · Requirements: UI-01 (MODIFIED), UI-09 (ADDED), FR-02 (MODIFIED — filter semantics, documented in [categories.md](categories.md)) · User guide: [features/browsing-and-filtering.md](../features/browsing-and-filtering.md) · Spec: [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (UI-01, UI-09, FR-02), §3.2 — decisions DR-68, DR-69, DR-82

Sidebarless navigation: the sidebar and its saved-search rows were deleted and replaced by one Browse menu in the toolbar plus filter chips that mirror the active filter. No command was added or removed by this feature; it is a frontend restructure over the existing query surface.

## Commands used (unchanged surface, R1.3)

| Command | Role here |
|---|---|
| `library_search(query, category_ids, favorites_only, missing_only, sort, dir, sort_secondary, offset, limit)` | the filtered list; `category_ids` is the whole active set (union semantics in [categories.md](categories.md)) |
| `library_ids(…)` | the same filter for the bulk-selection id set — identical parameters, so "select all matching" always describes what is on screen |
| `categories_list()` | the Browse submenu's category rows and their live counts; also what `FilterChips` resolves an id to a name from |
| `app_get_settings` / `app_set_setting("last_filter", …)` | persistence of the active set; grammar in [categories.md](categories.md) |

No new Tauri command, no schema change, no new dependency.

## Frontend (`ui/src/`)

- `components/BrowseMenu.svelte` (new) — a `bits-ui` DropdownMenu on the toolbar's left end: *All documents* / *Favorites* / *Missing files* items each with its mode count from `library.counts`, separator, a **Categories** submenu of checkable items (`role="menuitemcheckbox"`, `aria-checked`, live counts from `library.categories`), separator, *Manage categories…* which mounts `CategoriesDialog`. The checked state is read from `library.filter`, never from local component state — the menu is a view of the store, so a chip removal and a submenu toggle can never disagree.
- `components/FilterChips.svelte` (extended) — derives the chip list from the store on every change: one per active category id (label resolved through `library.categories`; the fallback string "That category no longer exists." if the id is no longer in the list), one for the Favorites or Missing mode. Each chip's × calls `setFilter` with that condition dropped; an empty list renders nothing, which *is* the All-documents state. The group is labelled "Active filters" for assistive technology.
- `lib/state/library.svelte.ts` — the only owner of the filter: `filter.category_ids: number[]`, `toggleCategory(id)` (add/remove, then sort ascending, so a filter set has one canonical form and a persisted value is stable), `selectMode("all" | "favorites" | "missing")` (mode selection; `all` clears the mode **and** the category set), and the single `setFilter` path every control goes through, which re-queries from offset 0 and bumps `#querySeq` (stale-response guard, searching.md). `deleteCategory(id)` also drops the id from the active set, so a live filter never holds a dead id.
- `components/Toolbar.svelte` — the row order is fixed: `BrowseMenu`, `SearchBox`, Import, Sort, View, `FilterChips`, spacer, `AppMenu`, `WindowControls`. The strip carries `data-tauri-drag-region` (the-app-window.md).
- `ui/src/App.svelte` mounts `Toolbar` / `DocumentArea` / `StatusBar` in a three-row grid; the sidebar grid column and the `--side-width` / `--side-rail` tokens were deleted with the component (no reference to them remains in the stylesheet or any component).

## Invariants

- The chips are exactly the active filter: same count, same set, no chip for an inactive condition, no active condition without a chip (asserted at every step of the smoke flow).
- No chips ⇔ unfiltered library; *All documents* is checked exactly in that state.
- Navigation equivalence (AC-13): All/Favorites/Missing and any category are reachable from the Browse menu in ≤ 2 interactions (open menu → item).
- Status-bar counts remain library-wide and independent of the filter (FR-15); the menu's mode counts are the same numbers, never a filtered subset.
- The active set survives a restart and renders as chips; a v0.0.1 `cat:<id>` value restores as that single category (upgrade path, no migration step).
- One filter mutation path (`setFilter`): no component holds a private copy of the filter, and no second "applied filters" state exists (R4.3).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/query.rs` tests | union semantics of `category_ids`: each single id equals its own result set, two ids equal the union with the shared document counted once, union ∧ favorites, union ∧ terms, empty list identical to no filter (AC-17) |
| `src-tauri/src/library/service.rs` tests | `last_filter` grammar accepts the new `&cats=` form and the legacy `cat:` form and rejects malformed values (AC-17/AC-18) |
| `scripts/ui-smoke.mjs` `flowCategoriesMulti` | two categories active → the result equals the union computed from each single-category query; the shared document appears once; status counts agree with the union; exactly two chips, one per category; removing one chip leaves exactly the other category's set with one chip; the set survives a restart and re-renders as chips; a legacy `cat:<id>` value restores as one category |
| `scripts/ui-smoke.mjs` `flowCategories`, `flowFavorites` | the mode items and their chips: Favorites/Missing appear as exactly one chip and are removable; *All documents* clears everything |
| `scripts/ui-smoke.mjs` `flowKeyboardAudit` | every toolbar control, menu item and dialog is reachable and operable by keyboard |

## Change history

- 2026-11-04 (v0.0.2) — First shipped. Migrated from SPEC-v0.0.2.md §3.2, corrected to the verified code. The two decisions behind this document are recorded in the spec's Decision Log: sidebarless navigation adopted in OQ-14 (DR-68, DR-69) and multi-select union filtering adopted as DR-82; this document describes what shipped, including that `Sidebar.svelte` and `ViewToggle.svelte` were deleted rather than deprecated. The category CRUD the sidebar carried is documented in [categories.md](categories.md); the window chrome in [the-app-window.md](the-app-window.md).
