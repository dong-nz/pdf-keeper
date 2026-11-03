# PDF Keeper — Release Specification v0.0.2

**Status: PROPOSED** (draft 2026-11-03). Base: `docs/specs/SPEC-v0.0.1.md` (RELEASED, frozen). This spec carries forward everything v0.0.1 released and adds the changes below; unlisted requirements are unchanged. Registry entry: `docs/specs/INDEX.md`.

## 0. Scope and version

PATCH release (0.x line, DR-28/29 — user set the version, DR-65): display and chrome polish plus one sort capability. Adopted from the 2026-11-03 UI review discussion (mockup review + user requests): the A1–A5 polish batch and three user-requested changes.

**Out of scope for v0.0.2** (raised in the review, not adopted): reading progress / Finished state (needs a page source — candidate for a future MINOR), list-view grouping (Author/Category/Status), Series/Subjects metadata, page-count and last-opened columns. They stay recorded proposals, not requirements.

## 1. Change summary

| ID | Change | Type |
|---|---|---|
| UI-06 | Metadata display in list and grid: author line, notes line, two-line title clamp with full-text tooltips | ADDED |
| UI-07 | Window controls in the app toolbar (custom title bar) | ADDED |
| UI-08 | Single View menu: List / Grid / column-count control replaces the two-button view toggle | ADDED (MODIFIES UI-01's toolbar wording) |
| FR-13 | Secondary sort key ("Then by…") | MODIFIED |
| FR-08 | **No requirement change.** Shipped code activated on single click against the spec's double-click design — defect D1 fixed by aligning code to the released text | DEFECT FIX |
| OQ-14 | Where categories live (sidebar vs separate UI) — raised by the user | OPEN QUESTION |

## 2. Requirements

### Added

| ID | Requirement | Status |
|---|---|---|
| UI-06 | **Metadata display.** List rows: the document's stored author renders as a secondary line under the title when non-empty; stored notes render as a third line when non-empty, ellipsized. Grid cards: author line under the title when non-empty; notes are not shown on cards (the editor remains their full view). Titles clamp to two lines on cards (single line in rows); every ellipsized title/author/notes line carries its full text as a tooltip. Empty fields render no line and no reserved space. | **PROPOSED** |
| UI-07 | **Window controls in the app toolbar.** The OS title bar is removed; minimize, maximize/restore and close buttons live at the right end of the app toolbar row, styled as app controls. The window is draggable from the toolbar strip (not from controls, inputs or menus). Keyboard and menu paths for minimize/maximize/close are unaffected. Behavior on Windows is verified end-to-end; Linux/macOS follow the same design but are only verified where CI or hardware exists. | **PROPOSED** |
| UI-08 | **View menu.** The toolbar's two view-toggle buttons are replaced by one **View** menu: List and Grid items (current mode checked), a separator, and a Columns control — `Auto` (width-computed, the shipped default) or a manual column count (2–10) adjusted with − / +. The choice (Auto or a count) persists per DR-44's settings persistence and applies to both current and later sessions. | **PROPOSED** |

### Modified

**FR-13 (Sorting)** — old text: *"Sort library by title, date added, file size (asc/desc); default title A→Z; favorites always pinned first."*
New text: Sort library by title, date added, file size (asc/desc); **a secondary sort key may be set ("Then by…": none by default, then title / date added / file size); ordering is total: primary key, then secondary key, then id as final tiebreaker so order is deterministic**. Default title A→Z with no secondary key; favorites always pinned first. The secondary choice persists like the primary.

### Defect fix (no requirement change)

**D1 — activation.** The released spec defines activation as *double-click on a row/card, `Enter` on the focused row, or the row's Open action* (SPEC-v0.0.1-opening-and-deleting.md §UI, FR-08). The shipped code opens on **single** click (Shift/Ctrl-click selects). v0.0.2 aligns the code with the released text: single click focuses/selects the row or card; double-click, `Enter`, and the Open action activate (open); Shift/Ctrl-click selection is unchanged. Recorded as DR-66 — the deviation was never recorded at implementation time.

## 3. Technical design (v0.0.2)

### 3.1 Window chrome (UI-07)

- `src-tauri/tauri.conf.json`: `"decorations": false`. Capabilities (`capabilities/default.json`): add `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close` (deny-by-default kept).
- `ui/src/components/WindowControls.svelte` (new): three icon-buttons (`aria-label` Minimize / Maximize / Close) calling `getCurrentWindow().minimize() / toggleMaximize() / close()`; mounted at the toolbar's right end. Maximize button mirrors window state (`onResized` → data-maximized for the restore glyph swap).
- Toolbar root carries `data-tauri-drag-region`; interactive children (search input, buttons, menus) keep `data-tauri-drag-region="false"` semantics by stopping the drag attribute inheritance (bits controls and inputs are not drag regions).
- Grid layout unchanged: `.app` still `"side toolbar" / "side main" / "side status"` — the toolbar row *is* the title bar now (height raised to 46px to host the controls; tokens `--toolbar-height`).
- Risks accepted: Windows Snap layouts / hover-maximize are lost with `decorations: false` (mitigated by the maximize button); `Alt+F4` and taskbar behavior are OS-side and unchanged.

### 3.2 View menu (UI-08)

- `ViewToggle.svelte` is removed; `ViewMenu.svelte` (new) uses the bits-ui Menu primitive with the global menu chrome (base.css, DR-56 layering). Items: List, Grid (check marks via the existing `data-bits-variant`/checked styling), separator, Columns row: `Auto` checkbox + `−` / count / `+` buttons (manual counts clamped 2–10).
- `ui/src/lib/virtual.ts`: `gridColumns(containerWidth, cardWidth, gap, override?: number)` — when a manual count is set it wins; Auto keeps the shipped computation. Unit tests extend the existing windowing tests: override wins, clamp bounds, Auto unchanged.
- Settings: new keys `grid_columns` (`"auto" | int`) and `sort_secondary` added to the existing settings round-trip (`settings.svelte.ts`, `app_get_settings`/`app_set_setting` — no schema change; the settings table is key-value).

### 3.3 Secondary sort (FR-13)

- `SortMenu.svelte`: add a "Then by…" section (None / Title / Date added / File size) mirroring the primary section's controls; store `{key, dir}` pairs in the existing settings key set (`sort` stays primary; `sort_secondary` new).
- `src-tauri/src/library/query.rs`: `ORDER BY <primary>, <secondary>, id` — secondary None → `id` only; favorites pinning unchanged. SQL-level unit tests: primary+secondary ordering, tie determinism, None behaves exactly as shipped.

### 3.4 Metadata display (UI-06)

- `DocumentRow.svelte`: title cell becomes a stacked block — `.title-line` (1 line, ellipsis, `title` tooltip), `.author-line` (secondary color, only when `doc.author` non-empty), `.notes-line` (tertiary, ellipsized, only when non-empty). Row min-height 48px → auto-growing; the §5.3.7 column-drop rules keep their order (filename drops below 1100px, size/date below 900px); author/notes live inside the title cell, which never gives way.
- `DocumentCard.svelte`: `.title` clamps to 2 lines (`-webkit-line-clamp: 2`) with full-text tooltip; `.author-line` under it when non-empty.
- No backend change: `author` and `notes` are already in `documents_list` DTOs (`db/mod.rs` schema, `library/service.rs`).
- Data note for the user guide: author/notes visibility is display-only; extraction/editing behavior is unchanged (FR-05/FR-06).

### 3.5 Activation fix (D1)

- `DocumentRow.svelte` / `DocumentCard.svelte`: `onclick` → `library.focusOrSelect(doc.id)` (row focus + plain click selects nothing new — focus only; Shift/Ctrl/Win-click selection unchanged); `ondblclick` → `library.open(doc.id)`. `Enter` and the Open action already match the spec and stay.
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

## 5. Open questions

| ID | Question | Blocking | Status |
|---|---|---|---|
| OQ-14 | **Where do categories live?** (a) sidebar stays as shipped; (b) sidebarless app: categories reachable through a Browse menu + active-filter chips; (c) a separate full-window Categories manager with a sidebar shortcut. | approval of v0.0.2 | **CLOSED → DR-68 (user chose (b): sidebarless is the product direction)** |

## 6. Decision Log

| ID | Date | Decision | By |
|---|---|---|---|
| DR-65 | 2026-11-03 | **v0.0.2 drafted (user set the version).** The user adopted the A1–A5 polish batch from the UI review (author display, notes display, secondary sort, grid column override, title clamp) and added three requests: window controls in the toolbar row, one View menu (List/Grid/more), open on double-click. The review's deferred items (progress, grouping, series) are explicitly out of scope. A1–A5 map to UI-06/UI-08/FR-13-MODIFIED; the requests map to UI-07/UI-08 and defect D1 | User |
| DR-66 | 2026-11-03 | **Deviation recorded: shipped code opens on single click.** The released v0.0.1 spec defines activation as double-click/Enter/Open action; `rowClick`/`cardClick` opened on plain click — an unrecorded implementation deviation discovered when the user asked for double-click. Fixing code to spec (no requirement change); regression guard added to the smoke suite | User request + Assistant (defect) |
| DR-67 | 2026-11-03 | **OQ-14 raised** (category placement) from the user's question. Options and recommendation recorded in §5; approval gate requires it CLOSED | User question |
| DR-68 | 2026-11-03 | **OQ-14 CLOSED — user chose (b): sidebarless app.** Categories leave the sidebar; navigation moves to a Browse menu + active-filter chips; Favorites/Missing and category CRUD need new homes. The rework is NOT folded into v0.0.2 (it is a UI restructure beyond patch scope — the sidebar ships unchanged in v0.0.2); it is drafted as its own release spec, version set by the user (proposed v0.1.0, per DR-29: UI restructure is not a patch) | User |

## 7. Draft history

Drafted 2026-11-03 from the two mockup reviews and the user's four requests. Status PROPOSED; approval gate per AGENTS §2 (all OQ closed — OQ-14 closed by DR-68 — + explicit "implement"). The sidebarless rework decided in DR-68 is drafted in its own release spec (version per DR-29).
