# Browsing & filtering — technical reference

**Since v0.0.2 · updated in v0.0.3** · Requirements: UI-01 (MODIFIED in v0.0.2 and v0.0.3), UI-09 (ADDED in v0.0.2, MODIFIED in v0.0.3), FR-02 (MODIFIED — filter semantics, documented in [categories.md](categories.md)), FR-15 (placement only, v0.0.3) · User guide: [features/browsing-and-filtering.md](../features/browsing-and-filtering.md) · Spec: [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (UI-01, UI-09, FR-02), §3.2 — decisions DR-68, DR-69, DR-82; [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §2 (UI-09, UI-15), §3.2, §3.3 — decisions DR-94, DR-96

Sidebarless navigation: the sidebar and its saved-search rows were deleted and replaced by one Browse menu in the toolbar. In v0.0.2 the active filter was mirrored by filter chips beside the menu; **in v0.0.3 the chips were deleted and the Browse menu became the only place the active filter is displayed and cleared**, and it took over the counts and the rescan control the status bar used to carry. No command was added or removed by this feature; it is a frontend restructure over the existing query surface.

## Commands used (unchanged surface, R1.3)

| Command | Role here |
|---|---|
| `library_search(query, category_ids, favorites_only, missing_only, sort, dir, sort_secondary, offset, limit)` | the filtered list; `category_ids` is the whole active set (union semantics in [categories.md](categories.md)) |
| `library_ids(…)` | the same filter for the bulk-selection id set — identical parameters, so "select all matching" always describes what is on screen |
| `categories_list()` | the Browse submenu's category rows and their live counts |
| `app_get_settings` / `app_set_setting("last_filter", …)` | persistence of the active set; grammar in [categories.md](categories.md) |

No new Tauri command, no schema change, no new dependency.

## Frontend (`ui/src/`)

- `components/BrowseMenu.svelte` — a `bits-ui` DropdownMenu on the toolbar's left end: *All documents* / *Favorites* / *Missing files* items each with its mode count from `library.counts`, separator, a **Categories** submenu of checkable items (`role="menuitemcheckbox"`, `aria-checked`, live counts from `library.categories`), separator, *Manage categories…* which mounts `CategoriesDialog`, and — since v0.0.3 — a **Rescan files** item in that same action section, disabled while a job runs and calling the same `library.rescan` path the status bar's button used (FR-15's behavior unchanged: no confirmation, one aggregate query, `status_updated` as the only source). The checked state is read from `library.filter`, never from local component state — the menu is a view of the store, so a submenu toggle and a restored `last_filter` can never disagree. Its trigger is icon-only since v0.0.3 (UI-13): no label text, `aria-label` from the catalog, and a tooltip carrying the same string.
- `components/FilterChips.svelte` — **deleted in v0.0.3** (UI-09 as modified, R7.4: no dead component stays). Its whole role — showing the active filter and dropping one condition — is the Categories submenu's checked state and the mode items. The "that category no longer exists" case is no longer a chip label: `library.svelte.ts` drops a dead id from the active set and `feedback.svelte.ts` reports it as a toast (`error.categoryGone`) when a command names one.
- `lib/state/library.svelte.ts` — the only owner of the filter: `filter.category_ids: number[]`, `toggleCategory(id)` (add/remove, then sort ascending, so a filter set has one canonical form and a persisted value is stable), `selectMode("all" | "favorites" | "missing")` (mode selection; `all` clears the mode **and** the category set), and the single `setFilter` path every control goes through, which re-queries from offset 0 and bumps `#querySeq` (stale-response guard, searching.md). `deleteCategory(id)` also drops the id from the active set, so a live filter never holds a dead id.
- `components/Toolbar.svelte` — the row order since v0.0.3 is fixed: `BrowseMenu`, `SearchBox` (which contains the import control, importing-pdfs.md), the Select-mode toggle, `ViewMenu`, `SettingsMenu`, `WindowControls` — one gap value and `--control-height` for all of them, no separators or grouping boxes (UI-01 as modified). Every control carries `data-tauri-drag-region="false"` and the strip carries `"deep"` (the-app-window.md, D2).
- `ui/src/App.svelte` mounts `Toolbar` / `DocumentArea` / `StatusBar` in a three-row grid; the sidebar grid column and the `--side-width` / `--side-rail` tokens were deleted with the component (no reference to them remains in the stylesheet or any component).

## Invariants

- The Browse menu's checked items are exactly the active filter: one per active category, the mode item for Favorites or Missing, *All documents* checked exactly when nothing is active — and **no chip element renders anywhere in the app** (AC-23, asserted with a document-wide query while a filter is active).
- Navigation equivalence (AC-13): All/Favorites/Missing and any category are reachable from the Browse menu in ≤ 2 interactions (open menu → item).
- The counts the menu shows are the same library-wide numbers `status_updated` carries (FR-15): never a filtered subset, and identical to what the Settings dialog's Library section shows.
- The active set survives a restart and renders as checked items; a v0.0.1 `cat:<id>` value restores as that single category (upgrade path, no migration step).
- One filter mutation path (`setFilter`): no component holds a private copy of the filter, and no second "applied filters" state exists (R4.3).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/query.rs` tests | union semantics of `category_ids`: each single id equals its own result set, two ids equal the union with the shared document counted once, union ∧ favorites, union ∧ terms, empty list identical to no filter (AC-17) |
| `src-tauri/src/library/service.rs` tests | `last_filter` grammar accepts the new `&cats=` form and the legacy `cat:` form and rejects malformed values (AC-17/AC-18) |
| `scripts/ui-smoke.mjs` `flowCategoriesMulti` | two categories active → the result equals the union computed from each single-category query; the shared document appears once; the status count agrees with the union; exactly one checked menu item per active category; **zero chip elements anywhere while the filter is active** (AC-23); clearing one item in the submenu leaves exactly the other category's set; the set survives a restart and re-appears as checked items; a legacy `cat:<id>` value restores as one category; *All documents* clears every filter |
| `scripts/ui-smoke.mjs` `flowCategories`, `flowFavorites` | the mode items and their counts: Favorites appears as one checked item and is cleared without touching anything else; *All documents* clears everything |
| `scripts/ui-smoke.mjs` `flowMissingAndRelink` | *Rescan files* in the Browse menu runs the shipped rescan, is disabled while a job runs and re-enables when the cover queue drains (FR-15) |
| `scripts/ui-smoke.mjs` `flowKeyboardAudit` | every toolbar control, menu item and dialog is reachable and operable by keyboard |

## Change history

- 2026-11-04 (v0.0.2) — First shipped. Migrated from SPEC-v0.0.2.md §3.2, corrected to the verified code. The two decisions behind this document are recorded in the spec's Decision Log: sidebarless navigation adopted in OQ-14 (DR-68, DR-69) and multi-select union filtering adopted as DR-82; this document describes what shipped, including that `Sidebar.svelte` and `ViewToggle.svelte` were deleted rather than deprecated. The category CRUD the sidebar carried is documented in [categories.md](categories.md); the window chrome in [the-app-window.md](the-app-window.md).
- 2026-11-04 (v0.0.3) — Filter chips removed (UI-09 as modified; `FilterChips.svelte` deleted, R7.4). The Browse menu became the only display and the only clearing path for the active filter, and it absorbed the status bar's three counts and its Rescan button as a *Rescan files* item (UI-15, FR-15 placement; DR-46's placement superseded, its "sit with the number it acts on" rationale preserved by putting the counts in the same menu). The menu trigger is icon-only with a tooltip (UI-13). The union semantics, the `setFilter` mutation path, `last_filter` persistence and the backend queries are untouched — the Rust union and grammar tests are the same tests as in v0.0.2, and the UI flow gained the zero-chip assertion and the checked-item readings in place of chip readings (AC-13, AC-17, AC-23). Category names for these assertions are read through the Browse menu itself, the app's own list, rather than a recorded command response (verification pass 3).
