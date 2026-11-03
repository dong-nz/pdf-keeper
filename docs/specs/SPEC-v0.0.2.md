# PDF Keeper — Release Specification v0.0.2

**Status: PROPOSED** (draft 2026-11-03). Base: `docs/specs/SPEC-v0.0.1.md` (RELEASED, frozen). This spec carries forward everything v0.0.1 released and adds the changes below; unlisted requirements are unchanged. Registry entry: `docs/specs/INDEX.md`.

## 0. Scope and version

UI restructure + polish release (version set by the user, DR-65; the restructure was folded in by DR-69). Adopted from the 2026-11-03 UI review discussion: the A1–A5 polish batch, three user-requested chrome changes, and the sidebarless navigation decided in OQ-14 (DR-68).

**Out of scope for v0.0.2** (raised in the review, not adopted): reading progress / Finished state (needs a page source — candidate for a future release), list-view grouping (Author/Category/Status), Series/Subjects metadata, page-count and last-opened columns. They stay recorded proposals, not requirements.

## 1. Change summary

| ID | Change | Type |
|---|---|---|
| UI-09 | **Sidebarless navigation:** sidebar/rail removed; Browse menu + active-filter chips replace saved searches and category filtering | ADDED (MODIFIES UI-01) |
| UI-10 | **Categories manager** dialog: add / rename / delete outside any sidebar | ADDED |
| UI-06 | Metadata display in list and grid: author line, notes line, two-line title clamp with full-text tooltips | ADDED |
| UI-07 | Window controls in the app toolbar (custom title bar) | ADDED |
| UI-08 | Single View menu: List / Grid / column-count control replaces the two-button view toggle | ADDED (MODIFIES UI-01's toolbar wording) |
| FR-13 | Secondary sort key ("Then by…") | MODIFIED |
| FR-08 | **No requirement change.** Shipped code activated on single click against the spec's double-click design — defect D1 fixed by aligning code to the released text | DEFECT FIX |

## 2. Requirements

### Modified

**UI-01 (Layout)** — old text: *"Layout as sketched above: sidebar (library filters + categories), toolbar (search, import, sort, view toggle), virtualized document area with cover thumbnails (FR-16), status bar."*
New text: Layout: toolbar (Browse menu, search, Import, Sort, View menu, active-filter chips, window controls), virtualized document area with cover thumbnails (FR-16), status bar. **No sidebar.** Filter and category behavior (FR-02, FR-11/FR-12 saved views) is unchanged — only its controls move (UI-09/UI-10).

**FR-13 (Sorting)** — old text: *"Sort library by title, date added, file size (asc/desc); default title A→Z; favorites always pinned first."*
New text: Sort library by title, date added, file size (asc/desc); **a secondary sort key may be set ("Then by…": none by default, then title / date added / file size); ordering is total: primary key, then secondary key, then id as final tiebreaker so order is deterministic**. Default title A→Z with no secondary key; favorites always pinned first. The secondary choice persists like the primary.

### Added

| ID | Requirement | Status |
|---|---|---|
| UI-09 | **Sidebarless navigation.** The sidebar and its collapsed rail are removed. The toolbar gains a **Browse** menu: *All documents* (checked when no filter), *Favorites*, *Missing*, separator, a **Categories** submenu (checkable, multi-select — identical filter semantics to the shipped sidebar selection), separator, *Manage categories…* (opens UI-10). The active filter state is visible as **chips** in the toolbar: one removable chip per active category, one for Favorites/Missing mode; no chips = All documents. Removing a chip clears that filter. Saved-search semantics, filter combinations, counts and persistence (`last_filter`) are unchanged — this requirement changes controls only. Status bar counts unchanged. | **PROPOSED** |
| UI-10 | **Categories manager.** *Manage categories…* opens a dialog listing every category with its live count, an always-available *New category* field, and per-row Rename / Delete actions reusing the shipped rename/delete dialog flows (duplicate-name inline error, delete confirmation with reassignment behavior). Behavior equals the sidebar's category CRUD; only its home changes. | **PROPOSED** |
| UI-06 | **Metadata display.** List rows: the document's stored author renders as a secondary line under the title when non-empty; stored notes render as a third line when non-empty, ellipsized. Grid cards: author line under the title when non-empty; notes are not shown on cards (the editor remains their full view). Titles clamp to two lines on cards (single line in rows); every ellipsized title/author/notes line carries its full text as a tooltip. Empty fields render no line and no reserved space. | **PROPOSED** |
| UI-07 | **Window controls in the app toolbar.** The OS title bar is removed; minimize, maximize/restore and close buttons live at the right end of the app toolbar row, styled as app controls. The window is draggable from the toolbar strip (not from controls, inputs or menus). Keyboard and menu paths for minimize/maximize/close are unaffected. Behavior on Windows is verified end-to-end; Linux/macOS follow the same design but are only verified where CI or hardware exists. | **PROPOSED** |
| UI-08 | **View menu.** The toolbar's two view-toggle buttons are replaced by one **View** menu: List and Grid items (current mode checked), a separator, and a Columns control — `Auto` (width-computed, the shipped default) or a manual column count (2–10) adjusted with − / +. The choice (Auto or a count) persists per DR-44's settings persistence and applies to both current and later sessions. | **PROPOSED** |

### Defect fix (no requirement change)

**D1 — activation.** The released spec defines activation as *double-click on a row/card, `Enter` on the focused row, or the row's Open action* (SPEC-v0.0.1-opening-and-deleting.md §UI, FR-08). The shipped code opens on **single** click (Shift/Ctrl-click selects). v0.0.2 aligns the code with the released text: single click focuses/selects the row or card; double-click, `Enter`, and the Open action activate (open); Shift/Ctrl-click selection is unchanged. Recorded as DR-66 — the deviation was never recorded at implementation time.

## 3. Technical design (v0.0.2)

### 3.1 Window chrome (UI-07)

- `src-tauri/tauri.conf.json`: `"decorations": false`. Capabilities (`capabilities/default.json`): add `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close` (deny-by-default kept).
- `ui/src/components/WindowControls.svelte` (new): three icon-buttons (`aria-label` Minimize / Maximize / Close) calling `getCurrentWindow().minimize() / toggleMaximize() / close()`; mounted at the toolbar's right end. Maximize button mirrors window state (`onResized` → data-maximized for the restore glyph swap).
- Toolbar root carries `data-tauri-drag-region`; interactive children (search input, buttons, menus) are not drag regions.
- App grid becomes `"toolbar" / "main" / "status"` rows (see §3.6; the `side` column disappears with the sidebar). Toolbar height raised to 46px to host the controls (token `--toolbar-height`).
- Risks accepted: Windows Snap layouts / hover-maximize are lost with `decorations: false` (mitigated by the maximize button); `Alt+F4` and taskbar behavior are OS-side and unchanged.

### 3.2 Browse menu and filter chips (UI-09)

- `Sidebar.svelte` is **deleted** (component, rail CSS, `--side-rail` token, `sidebar.*` i18n keys). Its local `collapsed` state disappears with it — no settings migration (it was never persisted).
- `BrowseMenu.svelte` (new): bits-ui Menu at the toolbar's left end. Saved-search items call the existing `selectSavedSearch` path; the Categories submenu renders `library.categories` with checkbox state bound to the existing filter selection logic in `state/library.svelte.ts` — no new filter model, the same `FilterState`.
- `FilterChips.svelte` (new): renders from `library.filter` (single source of truth): a chip per active category id (name + ×) and one for Favorites/Missing mode; × calls the existing filter mutation. Chips are buttons: focusable, Enter removes, Esc closes menus as usual.
- `ui/src/App.svelte` grid: remove the `side` area and `<Sidebar/>`; toolbar row hosts BrowseMenu, search, Import, Sort, View, chips, WindowControls.
- Persistence unchanged: `settings.svelte.ts` keeps persisting `last_filter` (already encodes saved search + category ids); on startup the restored filter renders as chips. No DB/settings schema change; `view`/`sort` keys untouched.
- i18n: new `browse.*`, `chips.*`, `categoriesDialog.*` keys; coverage test updated to fail on any orphan `sidebar.*` key.

### 3.3 Categories manager (UI-10)

- `CategoriesDialog.svelte` (new): bits-ui Dialog (focus-trapped, Esc closes — same wrapper rules as every other dialog: explicit `bind:open`, the RenameCategoryDialog pattern). Lists categories with live counts (same `$computed` sources the sidebar used); inline *New category* input (Enter submits; duplicate-name inline error — same backend error path); per-row Rename / Delete open the existing `RenameCategoryDialog` / `DeleteCategoryDialog` unchanged.
- Backend commands unchanged (`app_add_category`, `app_rename_category`, `app_delete_category`, `app_list_categories`).

### 3.4 View menu (UI-08)

- `ViewToggle.svelte` is removed; `ViewMenu.svelte` (new) uses the bits-ui Menu primitive with the global menu chrome (base.css, DR-56 layering). Items: List, Grid (check marks), separator, Columns row: `Auto` checkbox + `−` / count / `+` buttons (manual counts clamped 2–10).
- `ui/src/lib/virtual.ts`: `gridColumns(containerWidth, cardWidth, gap, override?: number)` — when a manual count is set it wins; Auto keeps the shipped computation. Unit tests extend the existing windowing tests: override wins, clamp bounds, Auto unchanged.
- Settings: new keys `grid_columns` (`"auto" | int`) and `sort_secondary` added to the existing settings round-trip (`settings.svelte.ts`, `app_get_settings`/`app_set_setting` — no schema change; the settings table is key-value).

### 3.5 Secondary sort (FR-13)

- `SortMenu.svelte`: add a "Then by…" section (None / Title / Date added / File size) mirroring the primary section's controls; store `{key, dir}` pairs in the existing settings key set (`sort` stays primary; `sort_secondary` new).
- `src-tauri/src/library/query.rs`: `ORDER BY <primary>, <secondary>, id` — secondary None → `id` only; favorites pinning unchanged. SQL-level unit tests: primary+secondary ordering, tie determinism, None behaves exactly as shipped.

### 3.6 Metadata display (UI-06)

- `DocumentRow.svelte`: title cell becomes a stacked block — `.title-line` (1 line, ellipsis, `title` tooltip), `.author-line` (secondary color, only when `doc.author` non-empty), `.notes-line` (tertiary, ellipsized, only when non-empty). Row min-height 48px → auto-growing; the §5.3.7 column-drop rules keep their order (filename drops below 1100px, size/date below 900px); author/notes live inside the title cell, which never gives way.
- `DocumentCard.svelte`: `.title` clamps to 2 lines (`-webkit-line-clamp: 2`) with full-text tooltip; `.author-line` under it when non-empty.
- No backend change: `author` and `notes` are already in `documents_list` DTOs (`db/mod.rs` schema, `library/service.rs`).
- Data note for the user guide: author/notes visibility is display-only; extraction/editing behavior is unchanged (FR-05/FR-06).

### 3.7 Activation fix (D1)

- `DocumentRow.svelte` / `DocumentCard.svelte`: `onclick` → row/card focus only; `ondblclick` → `library.open(doc.id)`. `Enter` and the Open action already match the spec and stay. Shift/Ctrl/Win-click selection unchanged.
- `library.svelte.ts`: no new command; open path unchanged (`app_open_document`).
- Smoke harness: `flowOpen` and every flow that opens a document switches to a W3C double pointer-up sequence; a new assertion proves single click does **not** open (regression guard for D1).

## 4. Acceptance criteria

| AC | Criterion | Proven by |
|---|---|---|
| AC-08 | A document with author/notes shows them in list and (author) grid; empty fields show no lines; ellipsized text carries full-text tooltips | smoke (fixture with author+notes) |
| AC-09 | With a secondary key set, ordering equals primary→secondary→id exactly; with None, byte-identical to v0.0.1 ordering; choice persists across restart | SQL unit tests + smoke sort scenario + settings round-trip |
| AC-10 | View menu switches List/Grid; Columns: Auto matches v0.0.1 computation; manual count 2–10 applies immediately, clamps at bounds, persists across restart | virtual.ts unit tests + smoke + real-app check |
| AC-11 | App launches frameless; toolbar controls minimize / maximize-restore / close work; window drags from the toolbar strip; keyboard paths unaffected | real-app run (observed) + smoke DOM checks (buttons present, invoke wired) |
| AC-12 | Double-click opens the document; single click only focuses/selects; Enter and Open action unchanged | updated smoke flows + new single-click negative test |
| AC-13 | Navigation equivalence: All/Favorites/Missing and any category filter reachable from Browse in ≤2 interactions; chips exactly mirror active filters and each × clears its filter; restored `last_filter` renders as chips at startup; status counts unchanged | smoke (filter scenarios ported from v0.0.1 AC-05 suite) |
| AC-14 | Categories manager: add, rename (duplicate-name inline error), delete (confirmation + reassignment) behave identically to the shipped sidebar CRUD | smoke CRUD scenario (ported) |

## 5. Open questions

| ID | Question | Blocking | Status |
|---|---|---|---|
| OQ-14 | **Where do categories live?** (a) sidebar stays as shipped; (b) sidebarless app: categories reachable through a Browse menu + active-filter chips; (c) a separate full-window Categories manager with a sidebar shortcut. | approval of v0.0.2 | **CLOSED → DR-68 (user chose (b)); folded into v0.0.2 scope by DR-69** |

## 6. Decision Log

| ID | Date | Decision | By |
|---|---|---|---|
| DR-65 | 2026-11-03 | **v0.0.2 drafted (user set the version).** The user adopted the A1–A5 polish batch from the UI review (author display, notes display, secondary sort, grid column override, title clamp) and added three requests: window controls in the toolbar row, one View menu (List/Grid/more), open on double-click. The review's deferred items (progress, grouping, series) are explicitly out of scope. A1–A5 map to UI-06/UI-08/FR-13-MODIFIED; the requests map to UI-07/UI-08 and defect D1 | User |
| DR-66 | 2026-11-03 | **Deviation recorded: shipped code opens on single click.** The released v0.0.1 spec defines activation as double-click/Enter/Open action; `rowClick`/`cardClick` opened on plain click — an unrecorded implementation deviation discovered when the user asked for double-click. Fixing code to spec (no requirement change); regression guard added to the smoke suite | User request + Assistant (defect) |
| DR-67 | 2026-11-03 | **OQ-14 raised** (category placement) from the user's question. Options and recommendation recorded in §5; approval gate requires it CLOSED | User question |
| DR-68 | 2026-11-03 | **OQ-14 CLOSED — user chose (b): sidebarless app.** Categories leave the sidebar; navigation moves to a Browse menu + active-filter chips; Favorites/Missing and category CRUD get new homes (UI-09/UI-10) | User |
| DR-69 | 2026-11-03 | **Sidebarless rework folded into v0.0.2** (user decision; supersedes the draft-stage scoping in DR-68). The assistant had recommended a separate MINOR release so the agreed polish would not ride on the riskiest change; the user chose one combined release. Consequence accepted: v0.0.2 is a UI restructure release, its verification includes the full navigation-equivalence suite (AC-13/AC-14) | User |
| DR-70 | 2026-11-03 | **Process: Build ledger for specs under construction** (AGENTS.md workflow stage 3 amended, stage 5 extended). When the registry flips a spec ON-GOING, that spec gains a `## Build ledger` section — one row per requirement ID and AC: build stage, status (⬜/🔨/✅), commit ref, test ref — maintained by the agent as a factual record (not a Rule-4 status decision), frozen with the spec at Ship. No ledger for PROPOSED/APPROVED specs; released specs never retrofitted. First application: v0.0.2 when it enters ON-GOING | User decision + Assistant (proposal A) |
| DR-71 | 2026-11-03 | **Ledger rule extended by the user ("update all specs"):** every release spec carries its `## Build ledger` from drafting (all rows ⬜), not from ON-GOING; the ledger below is created with this draft. One-time retrofit exception to the frozen-spec rule: `SPEC-v0.0.1.md` §12 + its 10 feature specs received completed ledgers reconstructed from the verified state at `af70f77` (statuses factual, test refs real). Released specs otherwise remain never-edited | User |

## 7. Draft history

Drafted 2026-11-03 from the two mockup reviews and the user's four requests; restructured the same day per DR-68/DR-69. Status PROPOSED; approval gate per AGENTS §2: all OQs closed (OQ-14 closed) + explicit "implement".

## 8. Build ledger

Created with this draft per DR-71. Rows flip ⬜ → 🔨 → ✅ during the build (agent-maintained facts); commit and test refs fill as work lands; frozen at Ship.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| UI-09 | UI (delete Sidebar; BrowseMenu, FilterChips, App grid) | ⬜ | — | — |
| UI-10 | UI (CategoriesDialog reusing existing commands) | ⬜ | — | — |
| UI-06 | UI (DocumentRow, DocumentCard) | ⬜ | — | — |
| UI-07 | Tauri config/capabilities + UI (WindowControls) | ⬜ | — | — |
| UI-08 | UI (ViewMenu; virtual.ts override) + settings keys | ⬜ | — | — |
| FR-13 (MODIFIED) | Rust core (query.rs ORDER BY) + UI (SortMenu) | ⬜ | — | — |
| D1 (activation fix) | UI (row/card click handlers) | ⬜ | — | — |
| AC-08 | — | ⬜ | — | planned: smoke fixture with author+notes |
| AC-09 | — | ⬜ | — | planned: SQL unit tests + smoke sort + settings round-trip |
| AC-10 | — | ⬜ | — | planned: virtual.ts tests + smoke + real-app |
| AC-11 | — | ⬜ | — | planned: real-app run + smoke DOM checks |
| AC-12 | — | ⬜ | — | planned: updated smoke flows + single-click negative test |
| AC-13 | — | ⬜ | — | planned: ported v0.0.1 filter scenarios |
| AC-14 | — | ⬜ | — | planned: ported CRUD scenario |
