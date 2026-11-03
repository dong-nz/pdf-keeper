# PDF Keeper - Requirements Specification

| | |
|---|---|
| Document status | **ON-GOING (per `docs/specs/INDEX.md` — the registry is the single authority; this line is descriptive)** |
| Version | 0.0.1 (semantic version — equals the target release version; see §0 versioning) |
| Last updated | 2026-11-03 |
| Implementation | **STARTED (DR-49)** — building per AGENTS workflow stage 3 (Rust core → Tauri commands → Svelte UI). Coding rules: RULES.md |

## 0. How this document is tracked

- Requirements have stable IDs: `FR-` (functional), `NFR-` (non-functional), `UI-` (interface), `DR-` (decision record), `OQ-` (open question), `AC-` (acceptance criterion). IDs are never reused or renumbered.
- Status markers:

| Marker | Meaning |
|---|---|
| **AGREED** | Explicitly decided by the user in discussion; recorded in §7 Decision Log |
| **PROPOSED** | Assistant-proposed default, awaiting explicit confirm/veto by the user |
| **OPEN** | Unresolved; tracked as an OQ |
| **OUT-OF-SCOPE** | Explicitly excluded from v1 |

- Only the user may change PROPOSED/OPEN → AGREED. Every status flip adds a Decision Log entry (§7) with date and who decided.
- **File naming & versions.** Specs are managed **per feature release**, and **the spec version IS the release version**, following semantic versioning (`MAJOR.MINOR.PATCH`):
  - **0.x line (current):** the product starts at **v0.0.1** (user decision, DR-29) and is unstable — any requirement may still change. New capability → MINOR bump (`0.1.0`, `0.2.0`, …); bug fix → PATCH bump.
  - **MAJOR** — incompatible product change: re-scope, removed capability, data-model migration.
  - **1.0.0** is declared only by the user, when they consider the product stable; after 1.0.0 the usual semver guarantees apply (MINOR = backward-compatible additions, MAJOR = breaking).
  - **PATCH** — bug fixes only, against the requirements of the newest feature spec; **no new spec file** — the fix is a Decision Log entry plus regression tests, and the inherited spec stays authoritative.
  Each feature release gets one spec file named after its version (`docs/specs/SPEC-v0.1.0.md`, …; the first is `SPEC-v0.0.1.md`) — a complete document of what that release implements, keeping its number through its lifecycle (draft → approved → on-going → released). Pre-approval drafts edit the same file; draft history is the Decision Log and git. Lifecycle status (PROPOSED / APPROVED / ON-GOING / RELEASED / REJECTED / SUPERSEDED) is tracked only in `docs/specs/INDEX.md`, which also lists patch releases without spec files. A new feature-release spec is drafted as the previous RELEASED spec carried forward plus marked ADDED/MODIFIED (old text quoted) / REMOVED changes. RELEASED files are frozen forever. The end-user guide lives in `docs/released/features/` (plain language, one page per capability), drafted when a capability enters an APPROVED feature-release spec, marked Draft, and changed only in a release Ship commit. The **technical implementation design of in-development features lives in the current spec itself**: every feature spec carries a "Technical design" section (modules, commands, schema, pipelines, test mapping); cross-cutting design lives in parent §5.1/§5.2. The developer reference `docs/released/technical-specs/` documents **released features only**: a document appears at the Ship commit of the release that first ships the capability, migrated from the spec's design sections, corrected to the verified code as released, and is updated only in later Ship commits. Rule documents (`AGENTS.md`, `RULES.md`) are unversioned, live at the repo root, and reference the spec by pattern; all documentation lives under `docs/`. (DR-21..DR-31, modified by DR-39)
- **Feature specs.** A release spec may split feature-level requirements into `docs/specs/SPEC-v<VERSION>-<slug>.md` files linked from its feature index (§3). The parent is the only registry entry: feature specs inherit its lifecycle status and freeze with it. Every ID is defined in exactly one file. Cross-cutting content (overview, scope, NFRs, interface architecture, data model, technical design of cross-cutting concerns, Decision Log, open questions, cross-cutting ACs) stays in the parent. Each feature spec carries its own requirements, acceptance criteria, and **Technical design section** — the implementation detail of the in-development feature belongs here, not in `docs/released/`. Slugs match the `docs/released/features/` pages (and, after release, the released technical docs). (DR-32, modified by DR-39)
- **Version bumps are user decisions** — an agent proposes the bump with justification; only the user sets it.
- **Coding rules.** `RULES.md` binds coding agents from implementation approval onward; process rules live in `AGENTS.md`.
- No implementation code exists in this repository while implementation is not approved.

## 1. Product overview

A desktop application for managing a personal library of PDF documents:

- PDFs stay where they are on disk; the app maintains an index (library).
- Documents are organized into categories (a document may belong to many categories).
- The library is searchable by title, filename, and metadata (author, notes) — **not** by full-text content.
- Opening a PDF delegates to the operating system's default PDF application.
- Cross-platform: Windows, macOS, Linux.

Product principles stated by the user (2026-11-02):

- **P1** — The application must be fast and have a responsive UI.
- **P2** — The UI must be modern.

## 2. v1 scope boundary

**In scope:** library index, categories, metadata search, favorites, external open, missing-file handling.

**Explicitly out of scope for v1** (each was a conscious choice, see DR entries):

| Item | Why excluded | Recorded |
|---|---|---|
| Full-text search inside PDF content | User chose title/filename/metadata search only | DR-01 |
| Copying files into a managed library | User chose reference-in-place model | DR-02 |
| Watched folders / auto-indexing | User chose manual import over watched folders | DR-02 |
| In-app PDF viewer | User chose system default app | DR-04 |
| Backup / export of the index | Not selected by user from offered extras | DR-08 |
| OCR | Follows from DR-01 (no content processing at all) | DR-01 |
| Automatic app updates (OTA) | Deferred: v0.0.1 ships fully offline with no updater; the capability is planned as v0.1.0 | DR-47 |
| Cloud sync, accounts, multi-user | Not requested | — |
| Additional UI languages | English-only shipped; i18n-ready string layer agreed instead | DR-17 |

## 3. Core model & feature index

Feature-level requirements live in per-feature spec files (convention in §0); every ID is defined in exactly one file. The core library model is cross-cutting and stays here.

| ID | Requirement | Status |
|---|---|---|
| FR-01 | **Library model — reference in place.** The app indexes PDFs at their existing filesystem paths. It never copies, moves, renames, or rewrites indexed files (except when the user explicitly chooses "delete file from disk", FR-09). | **AGREED** (DR-02) |
| FR-02…FR-16 | **Moved** to per-feature specs (DR-32); IDs and text unchanged there. | moved |

### Feature index

| Feature | Spec file | IDs | Status |
|---|---|---|---|
| Import | [SPEC-v0.0.1-importing-pdfs.md](SPEC-v0.0.1-importing-pdfs.md) | FR-10, FR-11 | AGREED |
| Categories | [SPEC-v0.0.1-categories.md](SPEC-v0.0.1-categories.md) | FR-02, FR-07 | AGREED |
| Search | [SPEC-v0.0.1-searching.md](SPEC-v0.0.1-searching.md) | FR-03 | AGREED |
| Metadata extraction & editing | [SPEC-v0.0.1-metadata-editing.md](SPEC-v0.0.1-metadata-editing.md) | FR-05, FR-06, UI-02 | AGREED |
| Favorites | [SPEC-v0.0.1-favorites.md](SPEC-v0.0.1-favorites.md) | FR-04 | AGREED |
| Sorting & views | [SPEC-v0.0.1-sorting-and-views.md](SPEC-v0.0.1-sorting-and-views.md) | FR-13, FR-14, UI-03, UI-04 | AGREED |
| Cover thumbnails | [SPEC-v0.0.1-covers.md](SPEC-v0.0.1-covers.md) | FR-16 | AGREED |
| Open & delete | [SPEC-v0.0.1-opening-and-deleting.md](SPEC-v0.0.1-opening-and-deleting.md) | FR-08, FR-09 | AGREED |
| Missing files & relink | [SPEC-v0.0.1-missing-files-relinking.md](SPEC-v0.0.1-missing-files-relinking.md) | FR-12 | AGREED |
| Status feedback | [SPEC-v0.0.1-status-feedback.md](SPEC-v0.0.1-status-feedback.md) | FR-15 | AGREED |

Cross-cutting material — product principles (§1), scope boundary (§2), NFR-01…NFR-07 (§4), interface architecture (§5), data model & technology (§6) — remains in this document.

## 4. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-01 | **Scale target.** Designed for **thousands to tens of thousands** of documents. Index-backed search; virtualized (windowed) rendering so DOM size stays bounded regardless of library size. | **AGREED** (DR-05) |
| NFR-02 | **Performance budget** (confirmed): search response < 100 ms at 10 000 documents; import of 10 000 files < 30 s with cover generation queued in a background pipeline (non-blocking); scrolling smooth (no frame drops from re-rendering whole list). | **AGREED** (DR-17) |
| NFR-03 | **Offline.** No network calls, no accounts, no telemetry, no auto-updater. Index stored in the OS user-data directory (per user). | **AGREED** (DR-17) |
| NFR-04 | **Platforms.** Windows 10+, macOS 12+, Linux via AppImage + .deb. Installers built per-platform. | **AGREED** (DR-17) |
| NFR-05 | **Language & theme.** English-only UI shipped; **i18n-ready**: all UI strings externalized from day one (translation layer), no extra languages shipped in v1. Follows the system light/dark theme. | **AGREED** (DR-17, modified by user) |
| NFR-06 | **Keyboard operability.** Core flows keyboard-accessible: Ctrl+F focus search, Ctrl+I import, Enter open, Delete delete-flow, Esc close/clear. Full keyboard navigation of the list. | **AGREED** (DR-17) |
| NFR-07 | **Responsiveness of UI** (user-stated P1): no blocking operations on the UI thread during normal use; search input debounced ~150 ms. | **AGREED** (P1, DR-17) |

## 5. Interface requirements (agreed — DR-16; renderer framework: Svelte, per DR-14)

```
┌────────────┬──────────────────────────────────────────────┐
│ Sidebar    │ Toolbar: [search…………] [Import] [sort▾] [view]│
│ ● All docs │ ── bulk bar (when rows selected) ────────────│
│ ★ Favorites│                                            ▲  │
│ Categories │  Document rows (virtualized list / grid)     │
│  Finance(12)│  ☐ ★ ▢ Title · badges · size · date         │
│  Legal(3)  │  actions: Open · Edit · Delete               │
│ + new cat  │                                            ▼  │
├────────────┴──────────────────────────────────────────────┤
│ Status: 1,204 documents · 37 favorites · 3 missing        │
└───────────────────────────────────────────────────────────┘
Modals: document details/editor, bulk-category picker, delete
confirmation, toasts for import/rescan/open results.
Legend: ▢ = cover thumbnail (FR-16).
```

| ID | Requirement | Status |
|---|---|---|
| UI-01 | Layout as sketched above: sidebar (library filters + categories), toolbar (search, import, sort, view toggle), virtualized document area with cover thumbnails (FR-16), status bar. | **AGREED** (DR-16) |
| UI-05 | Context menus (right-click) on rows and categories. | **AGREED** (DR-16) |

UI-02 moved to SPEC-v0.0.1-metadata-editing.md; UI-03 and UI-04 moved to SPEC-v0.0.1-sorting-and-views.md (DR-32).

### 5.1 App shell, data layout & platform integration (design)

- **Shell:** Tauri v2. Rust backend `src-tauri/` exposes typed commands (`library_…`, `categories_…`, `app_…` per RULES R7.2); Svelte frontend in `ui/` calls them through a thin typed `api.ts` wrapper. No HTTP layer, no side servers.
- **Error boundary:** backend functions return `AppError` (RULES R1.2); commands map it to a typed error payload consumed by the UI for toasts. No panics crossing the command boundary.

#### Data layout (RULES R8.4)

- SQLite database and cover cache live in the OS per-user data directory (Tauri path API): `%APPDATA%` (Windows), `~/Library/Application Support` (macOS), `$XDG_DATA_HOME` (Linux). NEVER in the repo or next to the executable.
- No network code paths at all: no accounts, telemetry, auto-updater (NFR-03).

#### Startup sequence

1. Open DB, run migrations (additive only on 0.x — see RULES R2.1).
2. Kick off async startup rescan (missing-file check, FR-12) — never blocks first paint (NFR-07).
3. Load window state (view mode, sort, last sidebar selection) from persisted app settings.

#### i18n & theme (NFR-05)

- All UI strings externalized from day one: `ui/src/i18n/` message catalogs, English shipped; components never hardcode literals.
- Light/dark theme follows the system (CSS `prefers-color-scheme` + Tauri theme API).

#### Packaging (NFR-04, RULES R8.1)

Tauri bundler: Windows NSIS + MSI, macOS DMG, Linux AppImage + .deb; CI builds all three on native runners (AC-07).


### 5.2 Keyboard operability (design)

| Keys | Action | Implementation |
|---|---|---|
| Ctrl+F / Cmd+F | Focus search box | Global keydown handler in the app shell; `Cmd` via Tauri platform detection |
| Ctrl+I / Cmd+I | Import PDFs | Same handler → toolbar action |
| Enter | Open selected document | Row/grid focus handler → `app_open_document` |
| Delete | Delete flow for selection | Row focus handler → delete dialog |
| Esc | Close dialog / clear selection / clear search | Context-sensitive: innermost active consumer wins |
| ↑ ↓ | Navigate rows | Roving tabindex over the virtualized window |

#### Rules

- All bindings are scoped: they do NOT fire while a text input owns focus (typing `f` in notes must not steal focus).
- Modals trap focus until closed (Esc or explicit close) — no focus leaks to the list behind.
- The full app must be operable without a mouse: sidebar, toolbar, rows, bulk bar, dialogs (NFR-06).

#### Tests / acceptance

- UI smoke script drives the flows by keyboard only (import → search → open → delete).

### 5.3 UI implementation design (Svelte frontend)

**AGREED (design proposed DR-43; status agreed by the user 2026-11-03, DR-49).** The concrete frontend design implementing UI-01…UI-05 under RULES R4. It introduces no requirements and changes no agreed behavior. Every dependency, capability and tooling choice it raised is decided: **DR-44** (OQ-10…OQ-13) and **DR-45** (OQ-9 — `bits-ui` headless primitives under our own tokens). Feature-specific UI detail lives in each feature spec's "UI" section; this section is the cross-cutting architecture, the design system, and the shared interaction rules.

#### 5.3.1 Frontend stack

- **Svelte 5 (runes) + Vite + TypeScript**, single-page app: no router, no SvelteKit, no HTTP layer (§5.1). Tauri serves `ui/dist` (`frontendDist`); development runs the Vite dev server (`devUrl`). State is runes (`$state`, `$derived`, `$effect`) — no store libraries.
- Runtime packages: `svelte`, `@tauri-apps/api` (`invoke`, `listen`, `convertFileSrc`), `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener` (approved with their Rust crates by DR-44). Dev packages: `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, `svelte-check`, `vitest` (DR-44).
- **Component kit: `bits-ui`** (headless primitives — Menu, Dialog, Popover, Combobox, Checkbox, Switch; DR-45; the installed 2.20.3 ships no Toast primitive — `ToastStack` is implemented directly per DR-52). The kit supplies **behavior only** — focus management, ARIA, keyboard handling — while **every visual comes from our design tokens** (§5.3.7). No Tailwind, no kit palette, no kit stylesheet: each primitive is wrapped once in `components/` (`ContextMenu.svelte`, `Modal.svelte`, `ToastStack.svelte`, `StarButton.svelte`, `SortMenu.svelte`), and no other component imports the kit (R1.6). Melt UI is not used — it wraps the same primitives and adds components this app does not need.
- Virtualization, chips, segmented controls, skeletons and the status bar stay hand-written: they are product logic under NFR-01/FR-15, not generic widgets.
- Nothing remote at runtime: system font stacks and inline SVG icons only — no web fonts, no CDN, no icon fonts (NFR-03, R8.2).

#### 5.3.2 Source layout (extends RULES R7.1)

```
ui/
  index.html  vite.config.ts  svelte.config.js  tsconfig.json
  src/
    main.ts                    # mount App, import styles/design-tokens.css
    App.svelte                 # app shell: layout grid, startup order, global key map, drag-drop target
    api.ts                     # ONLY place that calls invoke(); typed mirror of the Rust command whitelist (R1.3)
    lib/
      types.ts                 # DTOs mirroring the Rust serde types (see 5.3.3)
      actions.ts               # one action definition per target (document, category) — consumed by buttons AND context menus (R4.7)
      virtual.ts               # pure windowing math (no DOM) — unit-testable
      format.ts                # bytes, dates, counts via Intl; no hand-rolled formatting
      debounce.ts  focus.ts    # 150 ms debounce (R4.3); shortcut guard + search-focus hand-off (R4.4; DR-57)
      state/
        library.svelte.ts      # query state, loaded row slices, selection
        settings.svelte.ts     # view mode, sort, last filter; persisted via app_get_settings / app_set_setting (DR-44)
        feedback.svelte.ts     # toast queue + job progress (FR-15)
      design-tokens.css        # the only color/spacing/type/motion values (R4.5)
      base.css                 # reset, focus-visible ring, forced-colors and reduced-motion overrides
    components/
      Sidebar.svelte  CategoryList.svelte  CategoryRow.svelte  NewCategoryField.svelte
      Toolbar.svelte  SearchBox.svelte  FilterChips.svelte  SortMenu.svelte  ViewToggle.svelte  ImportButton.svelte
      DocumentArea.svelte  DocumentList.svelte  DocumentGrid.svelte  DocumentRow.svelte  DocumentCard.svelte
      Cover.svelte  CategoryChips.svelte  MissingBadge.svelte  StarButton.svelte  RowActions.svelte
      BulkBar.svelte  ContextMenu.svelte  Modal.svelte  DetailsModal.svelte  CategoryPickerModal.svelte
      DeleteDialog.svelte  RelinkDialog.svelte  ToastStack.svelte  Toast.svelte
      StatusBar.svelte  ProgressBar.svelte
      EmptyState.svelte  SkeletonRows.svelte  Icon.svelte  icons.ts
      # ContextMenu / Modal / StarButton / SortMenu wrap the bits-ui primitives —
      # the only files allowed to import the kit (DR-45); ToastStack is written
      # directly against UI-05 (DR-52)
  src/i18n/
    index.ts                   # t(key, params), typed key union, Intl.PluralRules for counts
    en.ts                      # the shipped catalog (NFR-05)
  src/styles/                  # component-scoped CSS lives in each component's <style>; global files are in lib/
```

`DocumentRow.svelte` / `DocumentCard.svelte` are the only components that subscribe to a document; every other component subscribes to chrome state. That boundary is what makes R4.3 (no row re-render on selection/hover/theme) structurally true rather than a discipline.

#### 5.3.3 Command client, DTOs, events

- `api.ts` exports one typed function per whitelisted command and is the only `invoke()` caller (R1.2/R1.3). It holds `const COMMANDS = [...]` as the client-side mirror.
- **Whitelist enforcement test:** a Rust test reads `ui/src/api.ts`, extracts the command names, and asserts set equality with the Tauri command list gathered from the router — a mismatch fails `cargo test`, so the two lists cannot drift (R1.3 "the two MUST match").
- DTOs (`lib/types.ts`) mirror the Rust serde types one-to-one: `DocumentDto` (id, path, filename, title, author, notes, favorite, size, added_at, missing, title_source), `CategoryDto` (id, name, count), `CountsDto` (total, favorites, missing), `ImportResult` (imported, skipped[]), `RescanResult` (missing_found, restored), `JobProgress` (kind, processed, total), `SettingsDto` (view, sort, dir, last_filter — DR-44), `AppErrorPayload` (kind, message, document_id?).
- **Events** (backend → UI, subscribed only in `state/`): `status_updated` with `CountsDto` (status-feedback.md), `library_job_progress` with `JobProgress` for import / rescan / cover queue (R3.5). Components never call `listen` directly.
- Error boundary: every `api.ts` call returns `Promise<T>` rejecting with `AppErrorPayload`; `feedback.svelte.ts` turns any rejection into an actionable toast (R4.6). No component handles a raw command error.

#### 5.3.4 State model and data flow

Three rune-backed modules, no other state:

| Module | Owns | Never owns |
|---|---|---|
| `state/library.svelte.ts` | current query (`q`, `category_id`, `favorites_only`, `missing_only`, `sort`, `dir`), loaded slices, `total`, `Set<id>` selection + shift anchor | any library data written optimistically |
| `state/settings.svelte.ts` | view mode, sort, last sidebar selection | library data |
| `state/feedback.svelte.ts` | toast queue, active job progress | library data |

Data-flow rules (binding):

1. **No optimistic writes.** A mutation awaits its command, then applies the returned DTO and refreshes counts from `status_updated`. The DB is the single source of truth (R1.4); a failed command leaves the UI exactly as the DB is.
2. **Slice loading.** `library_search(…, offset, limit)` with `limit = 200`; the store appends the next slice when the scroll is within 20 rows of the loaded end. A full library is never held in memory, and the DOM stays bounded by 5.3.5. `total` comes from the count query in the same call.
3. **Query reset.** Any change of query text, filter, or sort resets slices to `offset = 0` and scrolls to top — one code path, shared by search box, sidebar, sort menu and filter chips.
4. **Stale-response guard.** A monotonic `querySeq` is stamped on each request; responses with a lower seq are discarded (Tauri `invoke` cannot be aborted, so superseded queries are dropped, never merged).
5. **Select-all semantics.** `Ctrl+A` selects the loaded rows; the bulk bar then offers **"Select all N matching"**, which calls `library_ids(q, filters, sort)` (ids-only query, added to the whitelist) and selects the whole result set. Selection is therefore never silently partial.
6. UI-only state (selection, scroll offset, hover, which modal is open) is never persisted and never sent to the backend.
7. **Settings** (view mode, sort, last filter) are read once at startup through `app_get_settings` and written through `app_set_setting`, debounced 300 ms; `localStorage` is not used anywhere (DR-44). A settings write failure is silent — a lost preference is not a user-facing error.

#### 5.3.5 Windowed virtualization (R4.2, NFR-01)

- `lib/virtual.ts` is pure: `window(scrollTop, viewportHeight, count, itemSize, overscan = 6) → { start, end, padTop, padBottom, totalHeight }`. No DOM, no measurement — item sizes are fixed by the design system (5.3.7), so offsets are computable from the index alone.
- DOM shape: `scroller` → `spacer` (`height: totalHeight`, `position: relative`) → the mounted window absolutely positioned at `translateY(padTop)`. Mounted nodes stay ≈ viewport + 2×overscan (tens of rows) at any library size.
- List: `itemSize = 48`. Grid: columns are derived from the container width (`columns = floor((width + gap) / (220 + 12))`, `itemSize` = one row block of cards = 401), computed once per resize, not per item.
- Scroll: one `scroll` listener throttled through `requestAnimationFrame`; the window is recomputed only when the visible range actually changes. No per-item `IntersectionObserver`, no `content-visibility` fallback — one mechanism (R1.6).
- Rows/cards receive their DTO as a prop and derive their own selection state (`$derived(selection.has(id))`); theme, hover and bulk-bar changes re-render chrome only (R4.3).
- Proof: the UI smoke script asserts the mounted-row node count stays bounded with 10 000 fixtures (§5.3.12).

#### 5.3.6 Search and filter interaction (FR-03, NFR-07)

- `SearchBox.svelte`: search glyph, input, clear button when non-empty; **150 ms debounce** (`lib/debounce.ts`), each keystroke updates the local echo immediately so typing never feels laggy; `Ctrl+F` focuses and selects the text; `Esc` clears (innermost-consumer rule, §5.2).
- Results **replace atomically**: one assignment to the rows array, scroll to top, no diffing of previous rows (R4.3).
- `FilterChips.svelte` above the list shows the active combination (category ∧ favorites ∧ search term ∧ missing) each individually removable; the status bar shows the result count. Search never changes library-wide counts (FR-15 invariant).
- No matched-term highlighting in v0.0.1 (it would require the backend to return match offsets — deferred, not a v0.0.1 requirement).

#### 5.3.7 Design system — what "modern" means concretely (P2, DR-09)

All values exist **only** as custom properties in `lib/design-tokens.css`; components reference tokens, never literals (R4.5). Dark and light ramps are authored independently — dark is not an inversion of light. `prefers-color-scheme` selects the ramp; there is no in-app theme override.

Color tokens (AA contrast on their intended background; single accent, neutrals carry structure):

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-0/1/2/3` | `#ffffff` `#f7f8fa` `#eef0f4` `#e2e6ec` | `#14161a` `#1b1e24` `#242830` `#2f343e` | window / panels / hover / selected |
| `--border-hairline` `--border-strong` | `#e4e7ec` `#c9cfd8` | `#2a2f38` `#3b424e` | 1px structure lines (borders, not shadows) |
| `--text-primary/-secondary/-tertiary` | `#14181f` `#4a5261` `#6b7484` | `#eef1f5` `#a8b0bd` `#7c8493` | body / meta / hints |
| `--accent` `--accent-hover` `--accent-quiet` `--text-on-accent` | `#3b7cff` `#2f6ae0` `rgba(59,124,255,.12)` `#ffffff` | `#6aa6ff` `#8bbcff` `rgba(106,166,255,.16)` `#0d1117` | selection, primary action, focus |
| `--warning` `--danger` `--success` | `#b45309` `#c23b3b` `#1a7f4b` | `#f0a860` `#f28b82` `#5cc98d` | missing badge / destructive / confirmation |
| `--focus-ring` | 2px `--accent`, `outline-offset: 2px` | same | every interactive control (R4.4) |

Type — system stacks only (no bundled or remote fonts): UI `system-ui, "Segoe UI Variable", "Segoe UI", -apple-system, "Helvetica Neue", Ubuntu, sans-serif`; paths/sizes `ui-monospace, "Cascadia Mono", Consolas, monospace`. Scale: 11 (badge), 12 (meta), 13 (controls), 14 (primary), 16 (modal title), 22 (empty-state heading); `font-variant-numeric: tabular-nums` on every count, size and date so columns stay aligned.

Metrics (the fixed numbers virtualization and every component use):

| Region | Metric |
|---|---|
| App grid | `grid-template-areas: "side toolbar" "side main" "side status"`; columns `264px 1fr` (collapsible to a 56px icon rail); window default 1280×800, minimum 900×600 |
| Sidebar | row height 32, category count chip, inline "+ New category" field at the list end |
| Toolbar | height 52, sticky; search field min 320px and grows; control height 32 |
| List row | height 48: checkbox 18 · star 20 · cover 34×48 · title 14px single line ellipsis · category chips (max 3 + `+N`) · filename 12px mono · size + date 12px tabular-nums right-aligned · missing badge · row actions |
| Grid card | 220 wide: cover 220×311 (A4 aspect), 10px padding, title 13px 2-line clamp, chips + meta line → card 220×389, gap 12 (cell pitch 232×401) |
| Status bar | height 28 |
| Overlays | modal widths 560 (details) / 420 (delete, relink); context menu min-width 200; menu radius 10, modal radius 14, controls 6, chips 999 |

Responsive collapse via CSS **container queries** on the document area: below 1100px the filename column drops, below 900px the size/date columns drop — the title and cover never give way.

Elevation & motion: flat panels with 1px hairline borders; shadows only on overlays (`0 8px 24px` rgba(0,0,0,.18) light / `.45` dark). Durations 120ms (hover/press), 180ms (menu and modal: 4px translate + fade), 220ms (toast in/out), easing `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion: reduce` → all durations 1ms, no transforms, no shimmer. `@media (forced-colors: active)` (Windows high contrast) → system colors with borders retained.

Icons: `components/icons.ts` holds ~22 inline SVG path sets (search, import, folder, star, star-fill, list, grid, sort, dots-vertical, close, check, trash, external-link, relink, tag, alert-triangle, rescan, chevrons, plus, filter, pdf-glyph, keyboard) rendered by `<Icon name size />` at 16/20px, `stroke-width: 1.6`, `currentColor`. No icon font, no sprite file, no network.

Visual rules that keep it modern rather than decorated: color is reserved for state (accent = selection/primary, warning = missing, danger = destructive), never for headings; 8px baseline grid everywhere; one hairline between regions and no double borders; skeletons instead of spinners; density is fixed (48px rows) and information is dropped by width, never by shrinking type below 11px.

#### 5.3.8 States and affordances

| Situation | Rendering |
|---|---|
| First paint | Shell renders synchronously; `SkeletonRows.svelte` in the document area and `…` in counts while the startup queries and rescan run (§5.1 order, NFR-07) |
| Empty library | `EmptyState` heading + "Import PDFs" primary button + `Ctrl+I` hint |
| No search matches | `EmptyState` "No documents match “term”" + Clear action |
| Empty category / favorites | `EmptyState` with the action that fills it (assign categories / star a document) |
| Import, rescan, cover queue | `ProgressBar` in the status bar driven by `library_job_progress`; completion toast with counts (FR-15) |
| Missing file | row dimmed, `MissingBadge` in `--warning`, stored path in the tooltip; opening it → error toast with **Relink…** button (R4.6) |
| Cover unavailable | `Cover.svelte` falls back to the generic PDF glyph (R5.3); never a broken-image icon |
| Drag over window | full-window overlay, 2px dashed `--accent`, "Drop PDFs to add them"; second line "Adds to *category*" when a category is selected (FR-10) |
| Selection active | `BulkBar` replaces the toolbar's right side: count, "Categories…", "Select all N matching", Delete, Clear |
| Command failure | actionable toast; inline field errors inside modals for validation errors (empty title, duplicate category name) |

#### 5.3.9 Accessibility and keyboard implementation (NFR-06, R4.4)

- Landmarks: `nav` sidebar, `toolbar`, `main` document area (`role="grid"`, rows `role="row"` + `aria-selected`), `contentinfo` status bar.
- Roving tabindex in the document area: one tab stop in, `↑ ↓ Home End PageUp PageDown` move focus, `Space` toggles selection, `Enter` opens, `Delete` opens the delete flow — implemented in `DocumentList.svelte` / `DocumentGrid.svelte` over the mounted window only (§5.2; location corrected per DR-57 — it was never in `lib/focus.ts`).
- Focus management for overlays (trap Tab inside, initial focus → first control, restore focus to the trigger on close, Esc closes) is provided by the kit primitives inside the four wrapper components (DR-45; corrected by DR-57 — the hand-written focus trap formerly in `lib/focus.ts` became dead code when the kit took over and was removed). `lib/focus.ts` retains only the `isTextTarget` shortcut guard and the `searchFocus` hand-off (R4.4).
- The global key map lives in `App.svelte` behind one guard: `isTextTarget(e)` returns true whenever a text input or contenteditable owns focus, so no shortcut fires while typing (§5.2 rule).
- `aria-live="polite"` region for result counts and toasts; every icon-only button has an accessible name from the i18n catalog; visible focus ring on all controls, hover-only actions become visible on keyboard focus (R4.4).
- Context menus (UI-05) are focus-trapped, arrow-navigable, Esc-closable, and built from `lib/actions.ts` — the same definition the buttons use, so menu-only and button-only actions cannot diverge (R4.7).

#### 5.3.10 i18n implementation (NFR-05, R4.1)

`i18n/en.ts` exports a flat message object keyed `section.action` (R7.3); `i18n/index.ts` provides `t(key, params?)` with `{count}`-style interpolation and a `MsgKey` union derived from the catalog, so an unkeyed literal fails `svelte-check` — the "every string goes through i18n" rule (R4.1) is enforced by the compiler, not review. Counts use `Intl.PluralRules`/`Intl.NumberFormat`/`Intl.DateTimeFormat` (no hand-rolled plural or size formatting). The catalog is a static module: nothing is fetched at runtime (NFR-03). Only `en` ships.

#### 5.3.11 Window, shell, CSP

- Native OS window decorations (no custom titlebar: native chrome is the modern choice on each platform and avoids a second implementation path). Drag-and-drop is handled through Tauri's `tauri://drag-enter / drag-over / drag-leave / drag-drop` events, which give real filesystem paths (the HTML file input does not).
- `tauri.conf.json`: `app.windows[0] = { width: 1280, height: 800, minWidth: 900, minHeight: 600 }`; window geometry persistence is **not** in v0.0.1 (no plugin; a later MINOR candidate).
- CSP stays on (R1.5) with the two exceptions granted by **DR-44**: `default-src 'self'; img-src 'self' asset:; style-src 'self' 'unsafe-inline'`. `asset:` is required for cover thumbnails (covers.md, R5.4 — no image bytes in payloads) and `unsafe-inline` for `style` is required because Svelte injects component `<style>` blocks at runtime. `assetProtocol` scope is limited to `<user-data>/covers/**` and nothing else.
- Capabilities in `capabilities/default.json`: the two plugins' dialogs (open, confirm) + opener permissions, `asset` read for the covers scope. No other capability is granted.
- Startup order per §5.1: shell + skeletons first, then `categories_list` + first `library_search` slice + `status_updated`, rescan and the cover queue run as background jobs and only ever update state through events.

#### 5.3.12 UI verification mapping (R6.1, R6.4)

- `scripts/ui-smoke.mjs` drives the **real app** through `tauri-driver` (W3C WebDriver, shipped with the Tauri CLI) using plain `fetch` calls — no test framework involved. Scripted flows: keyboard-only import → search → open → delete (AC-01 UI part, §5.2 tests); category create + bulk assign (AC-03 UI part); move-a-file-outside → rescan → Relink… from the toast (AC-05 UI part); cover presence in both views (AC-06 visual proof).
- Assertions the script makes: mounted document nodes stay bounded (< 60) with 10 000 fixtures (NFR-01); debounced search reaches the correct result set and stale responses are never rendered; Esc closes the innermost overlay, and closing an overlay (menu or dialog) leaves the row selection intact — the same selection re-opens the dialog (§5.2); every action reachable by keyboard; a failed command produces a toast with its action; the Rescan control is disabled while a job runs and re-enables when the cover queue drains (FR-15 busy gate); a window drag-drop reaches the import pipeline end-to-end. (Assertion list corrected per DR-57: the former "one query per debounced burst" UI assertion was flaky by harness physics — WebDriver typing speed is not controllable — and moved to the unit-test scope below.)
- Static gates before any "done" claim: `svelte-check --tsconfig ./tsconfig.json` clean, `cargo fmt --check`, `cargo clippy` zero warnings (R3.1), plus launching the real app and observing the changed flows (R6.4). Fixture PDFs come from `scripts/` generators (R6.2).
- Frontend unit tests run under **Vitest (dev-only, DR-44)** over the pure logic that has no UI: `virtual.ts` windowing math (window bounds at 0 / middle / end of a 10 000-item list, overscan, grid column counts), `format.ts` (byte/date/count formatting), `debounce.ts` (a burst collapses to one trailing call; cancellation; pending-call replacement — the burst-count assertion moved here per DR-57), and an i18n coverage test asserting every `MsgKey` used in components exists in `en.ts` (R4.1). Nothing that touches the DOM is unit-tested — those flows are proven by the smoke script and the real-app run (R6.4).

## 6. Conceptual data model (technology approved by DR-14; structure informative)

- `documents` — one row per indexed file: path (unique), filename, title, author, notes, favorite, size, added_at, missing flag, title-source flag (auto vs user-edited).
- `categories` — name (unique, case-insensitive).
- `document_categories` — many-to-many join (FR-02).
- `settings(key, value)` — UI preferences only (view mode, sort key/direction, last filter), written through `app_get_settings` / `app_set_setting` (DR-44). Never used for library data.
- Search index over title/filename/author/notes with prefix support (FR-03).

Technology — **AGREED (DR-14, DR-17)**: SQLite with FTS5 via `rusqlite` (bundled build) for storage + prefix search index; `lopdf` for reading the PDF Info dictionary (FR-05) with graceful fallback to filename; `pdfium-render` for cover-thumbnail rasterization (FR-16). Frontend framework: Svelte (DR-14).

## 7. Decision Log

| ID | Date | Decision | By |
|---|---|---|---|
| DR-01 | 2026-11-02 | Search = title/filename/metadata only; no full-text content search in v1 | User |
| DR-02 | 2026-11-02 | Library model = reference files in place (not managed copies, not watched folders) | User |
| DR-03 | 2026-11-02 | A PDF may belong to multiple categories (many-to-many) | User |
| DR-04 | 2026-11-02 | No in-app PDF viewer; open with system default app | User |
| DR-05 | 2026-11-02 | Scale target: thousands–tens of thousands of documents | User |
| DR-06 | 2026-11-02 | Delete = both options per action (library-only / delete file with confirm) | User |
| DR-07 | 2026-11-02 | Auto-read title/author from PDF properties on import, editable, filename fallback | User |
| DR-08 | 2026-11-02 | v1 extras: bulk category assign/remove + favorites/pinned. Export/backup not in v1 | User |
| DR-09 | 2026-11-02 | User-stated product principles: modern UI; fast, responsive application | User |
| DR-10 | 2026-11-02 | Spec-first workflow: all implementation removed; requirements must be written here for tracking before any code | User |
| DR-11 | 2026-11-02 | Stack proposal: Electron + SQLite(FTS5) + electron-builder, business logic in plain Node modules, vanilla renderer. | Assistant (proposal) — **superseded by DR-12** |
| DR-12 | 2026-11-03 | **Stack = Tauri + Rust** (user chose the smallest-binary option). Consequences: Rust toolchain required on dev machines (OQ-7); frontend framework and backend crate choices become explicit decisions (OQ-5, OQ-6). Replaces DR-11 | User |
| DR-13 | 2026-11-03 | OQ-3 resolved: (a) import auto-assigns the currently selected category; (b) missing-file scan = startup + manual Rescan, no background scanning; (c) activating a missing document → error toast with Relink… action | User |
| DR-14 | 2026-11-03 | OQ-5/6/7 resolved: frontend = **Svelte**; backend crates = **rusqlite (bundled SQLite/FTS5) + lopdf**; Rust toolchain (rustup + MSVC build tools) installed by the assistant via winget **at implementation start** | User |
| DR-15 | 2026-11-03 | OQ-2 items FR-10/FR-11 resolved: import via file picker (multi-select) + drag-and-drop + one-time folder import; duplicates = skip same-path only, no content hashing | User |
| DR-16 | 2026-11-03 | OQ-2 items FR-13/FR-14 and UI-01/UI-02 confirmed as written; OQ-4 resolved (context menus on rows and categories in v1). User added requirement: **cover thumbnails for every PDF** → new FR-16; generation technology → OQ-8. Opening documents stays external (DR-04 unchanged) | User |
| DR-17 | 2026-11-03 | OQ-8 resolved: cover rendering = **pdfium-render**, rendered at import in a background queue, PNG cache keyed by path+size+mtime. NFR-02 performance budgets confirmed. NFR-03: fully offline, **no auto-updater**. NFR-04 platforms/packaging confirmed. NFR-05 modified by user: English-only but **i18n-ready** string layer. NFR-06 keyboard operability confirmed as proposed | User |
| DR-18 | 2026-11-03 | OQ-2 final item FR-15 confirmed (status bar + counts + toasts). **All open questions closed; spec status → FINAL, awaiting implementation approval** | User |
| DR-19 | 2026-11-03 | User doc review: spec renamed to versioned filename (`SPEC-v<VERSION>.md`, archive convention), strict coding rules split into `RULES.md`, AGENTS.md reduced to process rules; consistency review fixed AGENTS Rule 2 gate, RULES R1.2 error boundary, RULES R4.3 scope. No requirement statuses changed | User |
| DR-20 | 2026-11-03 | User doc review 2: specs live in `specs/` (with `specs/INDEX.md` catalog + `specs/archive/`); `docs/` reserved for non-spec documents; AGENTS.md gains a Development workflow section so coding agents can orient themselves. No requirement statuses changed | User |
| DR-21 | 2026-11-03 | User doc review 3: all documentation consolidated under `docs/` — specs in `docs/specs/` (INDEX + versioned specs + archive). AGENTS.md rewritten for clarity (v1.4). Supersedes the top-level `specs/` layout of DR-20. No requirement statuses changed | User |
| DR-22 | 2026-11-03 | Incremental-development spec management adopted: frozen baselines + change proposals (`docs/specs/changes/CHG-###-slug/` with proposal/delta/tasks, merged into a new baseline at ship time); **released features tracked separately in `docs/FEATURES.md`** (implemented-state only); AGENTS.md slimmed to essential agent-facing process — version-history tables removed from AGENTS.md and RULES.md, history consolidated into this spec's Decision Log. No requirement statuses changed | User |
| DR-23 | 2026-11-03 | Feature documentation restructured: `docs/features/` folder written as the **application user guide** — `README.md` home + one page per user-facing capability, drafted from approved spec text with status Draft, flipped to Shipped with verified behavior at ship time (replaces the single FEATURES.md registry of DR-22). Guide pages for all v0.7 capabilities created as Draft | User |
| DR-24 | 2026-11-03 | Git initialized with current docs as baseline commit; version-to-version spec diffs are read via `git diff` between the archived file and the new baseline; docs changes committed at stage boundaries per RULES R9.2. No requirement statuses changed | Assistant |
| DR-25 | 2026-11-03 | Spec-size management adopted: selective reading via INDEX + stable IDs (never full-baseline reads during increments); decision-log cap at release (new baselines carry only behavior-affecting decisions; full history lives in archives + git); module-split trigger if a baseline exceeds ~1,000 lines (`docs/specs/modules/`). No requirement statuses changed | User |
| DR-26 | 2026-11-03 | Spec management restructured **per release version**: one complete spec file per release (`SPEC-vX.Y.md`; drafts carry the previous RELEASED spec carried forward with marked ADDED/MODIFIED/REMOVED changes); lifecycle status tracked only in `docs/specs/INDEX.md` (PROPOSED/APPROVED/ON-GOING/RELEASED/REJECTED/SUPERSEDED); the separate `changes/CHG-###` folders and `archive/` directory of DR-22 are retired — frozen files stay in `docs/specs/`, history in git. No requirement statuses changed | User |
| DR-27 | 2026-11-03 | **Spec version equals release version.** The current spec is renamed `SPEC-v1.0.md` (git mv, history preserved); it keeps number 1.0 through its lifecycle — pre-approval draft revisions (0.2–0.7) do not mint version numbers, draft history lives in the Decision Log and git; the spec's §11 version table is replaced by a draft-history note. No requirement statuses changed | User |
| DR-28 | 2026-11-03 | **Semantic versioning applied**: versions are `MAJOR.MINOR.PATCH` — MAJOR = incompatible product change, MINOR = new/changed requirements (backward-compatible), PATCH = bug fixes only (no spec file; inherits newest feature spec; Decision Log entry + regression tests). Feature-release specs are `.0`; current spec renamed `SPEC-v1.0.0.md`. Version bumps proposed by agents, set by the user. No requirement statuses changed | User |
| DR-29 | 2026-11-03 | **First version is v0.0.1**: the product starts on the 0.x (unstable) line — current spec renamed `SPEC-v0.0.1.md`; capabilities during 0.x bump MINOR (`0.1.0`…), fixes bump PATCH; **1.0.0 is declared only by the user** when the product is considered stable. No requirement statuses changed | User |
| DR-30 | 2026-11-03 | **Two documentation layers adopted**: `docs/features/` is the end-user guide (plain language only — technical IDs and terms removed from all pages) and `docs/technical-specs/` is the per-feature developer reference (design, commands, schema, invariants, test mapping, per-release change history). Both created on approval, updated by every release's Ship commit (RULES R8.5/R8.6, AGENTS §2a). Technical docs for all v0.0.1 features created as Planned. No requirement statuses changed | User |
| DR-31 | 2026-11-03 | Documentation layers moved under **`docs/released/`** — `docs/released/features/` (end-user guide) and `docs/released/technical-specs/` (developer reference) — to reflect that they describe the product as released and their content changes only at release time; pre-release pages carry Draft/Planned markers. No requirement statuses changed | User |
| DR-32 | 2026-11-03 | **Feature specs supported**: a release spec may link per-feature specs `SPEC-v<VERSION>-<slug>.md` (parent = sole registry entry, feature specs inherit its lifecycle and freeze with it, IDs defined once, cross-cutting content stays in parent). Applied to v0.0.1: FR-02…FR-16, UI-02/03/04, AC-01…AC-06 moved verbatim into 10 feature-spec files; parent keeps FR-01, NFRs, UI-01/UI-05, AC-07, §1–§8, Decision Log, plus feature-index tables. No requirement text or statuses changed | User |
| DR-33 | 2026-11-03 | Consistency review after DR-32: created the missing `status-feedback` docs/released pair (FR-15 violated R8.6 one-page-one-doc), added it to both README maps; INDEX registration clarified (parents are registry rows; feature specs register in the parent's index); AGENTS stage 3 and RULES R8.5 updated to reference feature-spec-owned ACs and feature-spec supersession. No requirement text or statuses changed | Assistant |
| DR-34 | 2026-11-03 | Rust backend directory renamed `src-tauri/` → `tauri/` (user decision; RULES R7.1 updated with the Tauri-CLI convention caveat — custom backend dir support is verified at implementation start, no silent deviation). All technical docs retargeted. No requirement statuses changed | User |
| DR-35 | 2026-11-03 | **DR-34 reverted**: backend directory stays `src-tauri/`, following the Tauri CLI convention (user decision after seeing the tooling constraint). R1.1/R7.1, AGENTS, and technical docs restored. No requirement statuses changed | User |
| DR-36 | 2026-11-03 | **Recommendation duty**: AGENTS Rule 7 extended — whenever the agent sees a better option than what was agreed or planned, it MUST raise it, name its recommendation with reasons, and wait for the user's decision before proceeding. No requirement statuses changed | User |
| DR-37 | 2026-11-03 | Clarity audit of AGENTS.md: the **registry is the single gate authority** (spec-header status lines are descriptive only; AGENTS Rule 2, spec §10 retargeted); registry flips defined as records of user acts (APPROVED←approval, ON-GOING←"implement", RELEASED←passed stage-4 verification — AGENTS Rule 4); Rule 1 aligned with parent-only registration (DR-33). No requirement statuses changed | Assistant |
| DR-38 | 2026-11-03 | **Traceability chain made explicit** (user noted specs contain no implementation details — by design, they live in `docs/released/technical-specs/`): every feature spec header now links its implementation-design doc; every technical doc header links back to its feature spec (`—` marker for the two cross-cutting pages); technical README map gains a Feature spec column. No requirement text or statuses changed | User |
| DR-39 | 2026-11-03 | **Spec owns the development-time design** (supersedes DR-30/DR-38's "Planned technical docs" model, per user): technical implementation detail moves into the current spec — every feature spec gains a "Technical design" section (migrated verbatim from the 12 Planned technical docs); cross-cutting design into parent §5.1 (app shell/data layout/packaging) and §5.2 (keyboard). `docs/released/technical-specs/` becomes a **released-features-only** archive: documents are created at the Ship commit migrated from the shipped spec's design sections, marked "Since vX.Y.Z"; the 12 Planned docs are deleted (map empty until v0.0.1 ships); specs never link into it. AGENTS map/stage 3+5/§2a, RULES R8.5/R8.6, INDEX, parent §0 aligned. No requirement text or statuses changed | User |
| DR-41 | 2026-11-03 | **No automatic commit/push**: the agent runs `git commit`/`git push` only with the user's explicit approval per operation (standing grants allowed, revocable). AGENTS §2 and RULES R9.2 updated. Earlier commits (through DR-39) were made under the prior auto-commit practice; history unchanged. No requirement statuses changed | User |
| DR-42 | 2026-11-03 | Pre-implementation review: links, RULES cross-refs, ID uniqueness, spec completeness, guide purity, registry state all verified clean. Two amendments (user-approved): **AC-01** now asserts the NFR-02 import budget (< 30 s for 10 000 fixtures) in its criterion, verification method, and test mapping; **parent §9** states that requirements without a formal AC-ID are bound by their feature spec's "Tests / acceptance" design tests (favorites, status-feedback, metadata-editing, sorting-and-views, keyboard). Scroll-smoothness budget stays verified by stage-4 observation only (no automated proxy). No requirement statuses changed | User |
| DR-43 | 2026-11-03 | **UI implementation design written into the spec** (user request: the UI must be modern): parent **§5.3** (frontend stack Svelte 5 runes + Vite + TypeScript with no router/SvelteKit; `ui/` source layout extending R7.1; single typed command client with a Rust↔JS whitelist equality test; DTO and event contracts; three-module state model with no optimistic writes and slice loading; windowed virtualization with fixed item metrics; search/filter interaction; a token-based design system with authored light+dark ramps, single accent, AA contrast, fixed density metrics, motion + reduced-motion/forced-colors handling, inline SVG icon set; state/affordance table; keyboard + ARIA implementation; typed i18n catalog enforced by `svelte-check`; window/CSP configuration; UI verification mapping via `tauri-driver`), plus a "UI" section in each of the 10 feature specs. All of it **PROPOSED** — no requirement text or status changed. Also fixed a stale cross-reference in §5.1 step 1 (RULES R4 → R2.1), corrected covers.md's "Tauri custom protocol (`asset:`)" to the **built-in asset protocol** (R1.5 forbids custom protocols) and retargeted opening-and-deleting.md's "Tauri shell opener" to the mechanism chosen in OQ-10. Opened **OQ-9…OQ-13** for the choices the design cannot decide alone (frontend dependency policy, native dialog/opener mechanism, settings persistence location, asset-protocol + CSP exceptions, frontend test tooling): the build gate now requires those closed as well | Assistant |
| DR-44 | 2026-11-03 | **OQ-10…OQ-13 decided by the user** (dependencies and capabilities the UI design required): **OQ-10** native pickers and the OS opener = official **`tauri-plugin-dialog`** + **`tauri-plugin-opener`** (their Rust crates and `@tauri-apps/plugin-*` packages are the approved dependencies here, per R3.3 / AGENTS §2); **OQ-11** UI preferences persist in a SQLite **`settings(key, value)`** table through **`app_get_settings` / `app_set_setting`** — added to §6; window-geometry persistence stays out of v0.0.1; **OQ-12** the R1.5 exceptions are granted: Tauri's built-in **asset protocol** scoped to `<user-data>/covers/**` and `style-src 'unsafe-inline'` (Svelte injects component styles); **OQ-13** **Vitest (dev-only)** approved for pure frontend logic. **OQ-9**: the user chose to **allow a component kit** rather than the recommended zero-extra-deps route — the concrete kit is now the open question (headless primitives styled with our own tokens vs a kit that brings its own styling layer). No requirement text or statuses changed | User |
| DR-45 | 2026-11-03 | **OQ-9 closed**: the component kit is **bits-ui** (headless primitives — Menu, Dialog, Popover, Combobox, Checkbox, Switch, Toast), used through one wrapper component per widget so no application component imports the kit directly. All visuals come from our design tokens; **no Tailwind, no kit palette, no kit stylesheet** — `tailwindcss` is deliberately not added. Melt UI is not taken: it sits on the same primitives and adds components we do not need. First implementation step is verifying the current bits-ui release against Svelte 5; if that check fails the deviation is raised under Rule 7 before any code is written (not resolved silently). Approved runtime dependencies now: `svelte`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-opener`, `bits-ui`; dev-only: `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, `svelte-check`, `vitest`. No requirement text or statuses changed | User |
| DR-46 | 2026-11-03 | **Rescan control placement decided: the status bar** (user decision), beside the missing-file count it acts on; the toolbar keeps exactly the four controls UI-01 sketches. `docs/released/features/getting-started.md` (Draft) had placed it in the toolbar — corrected to the status bar; draft pages are editable because nothing is shipped yet, and this is the only guide page that contradicted §5.3. The UI design sections remain **PROPOSED**: the user asked for the pros and cons of the UI technical stack before deciding their status | User |
| DR-47 | 2026-11-03 | **Automatic app updates agreed as a v0.1.0 feature release** (user decisions after an options review grounded in the official updater docs and a published delta implementation). No code, no spec file yet: the lifecycle starts a feature release from the newest **RELEASED** spec, so `SPEC-v0.1.0.md` + `SPEC-v0.1.0-app-updates.md` are drafted after v0.0.1 ships. Decisions: **behavior** — check at startup after first paint plus a manual "Check for updates"; the update downloads in the background; the status bar shows "Update ready"; installation runs automatically **when the app quits**, with a "Restart now" action — no automatic install ever interrupts the user. **Mechanism** — official `tauri-plugin-updater` with full-installer downloads; **delta/incremental delivery is deferred** to a later MINOR decision taken against measured installer size and release cadence (upstream Tauri has no delta support, open issue tauri-apps/tauri#11863; the community delta plugin lacks Linux and MSI support, which NFR-04 requires). **Publishing** — GitHub Releases manifest + artifacts signed with our own minisign key; **no OS code signing in this phase**, accepted consequence: SmartScreen/Gatekeeper friction on automatic installs. **Amendments to apply in the v0.1.0 draft, not to v0.0.1** (which stays network-free): NFR-03 MODIFIED to permit exactly one network use — the update check and download, HTTPS, host-pinned, nothing sent beyond target/arch/current_version, opt-out, failures silent; RULES R8.2 MODIFIED in the same terms. Reserved for that draft: `FR-17` and onward, the `app-updates` slug, and the items it must close before approval — minisign private-key custody and rotation, the endpoint layout, the settings toggle and "Check for updates" entry point, the MAJOR-version consent rule, the `.deb` limitation, the offline-failure policy. **v0.0.1's gate is unchanged**: its OQ set stays closed, its scope stays offline-only | User |
| DR-48 | 2026-11-03 | **0.0.x → 0.1.0 bridge accepted**: because the updater lives in the installed app, 0.0.x installs **cannot self-update** — those users install 0.1.0 manually once, and every update after that is automatic. Rejected alternatives: a dormant updater plugin in v0.0.1 (dead code under RULES R7.4) and an early signing/CI pipeline with no user-visible benefit before 0.1.0. The limitation is to be stated plainly in the v0.1.0 spec and in its user-guide page when that release is drafted. v0.0.1's scope, dependencies and build gate are unchanged | User |
| DR-49 | 2026-11-03 | **UI design AGREED; build gate opened** (user decisions): §5.3 and every feature spec's "UI (parent §5.3)" section flip **PROPOSED → AGREED** exactly as written — the user explicitly accepted the design **without** the pros/cons review of the UI technical stack that DR-46 had requested (waived). The user then gave the implementation go ("start implementing"); registry status → **ON-GOING**. No requirement text, ID or dependency changed; the approved dependency list stays exactly DR-44/DR-45 | User |
| DR-50 | 2026-11-03 | **Implementation design decisions recorded before stage-3 code** (R9.1; no requirement text changed): **(a)** "Import folder…" walks the chosen directory **recursively** (importing-pdfs.md: "walks the directory for `*.pdf`" — a walk traverses subdirectories; non-`.pdf` entries and directories are skipped per the pipeline). **(b)** `library_delete_document_and_file` performs `fs::remove_file` **before** the row-deletion transaction: a file error leaves every row intact and the operation is retriable (a file already gone counts as deleted, so a retry completes); cover-cache cleanup runs after the commit. This reconciles opening-and-deleting.md's wording ("after the transaction commit" vs. "leave the row intact") — the stated observable behavior (row stays, toast names the path, retriable) is authoritative. **(c)** Pdfium sourcing: `pdfium-render` binds dynamically at runtime (its default mode; default features `thread_safe` + `image_latest` kept); the app ships a pinned pre-built **`pdfium.dll`** from `bblanchon/pdfium-binaries`, fetched by `scripts/fetch-pdfium.mjs` into `src-tauri/binaries/` (git-ignored, documented in README as a build prerequisite) and packaged as a Tauri resource; bind order = exe directory → `binaries/` beside the exe → `binaries/` in the working directory (dev); if no Pdfium can be bound, every cover falls back to the generic glyph per R5.3 and nothing else fails | Assistant (design) |
| DR-51 | 2026-11-03 | **DTO extension for row/card rendering** (design decision before the affected code; §5.3.3's field list extended additively): `DocumentDto` carries two extra fields — `categories` (ordered names; UI-03 badges and chips need them per-row; an extra per-window query would add a second data path against R1.6) and `cover_path` (the expected cache file path, computed in Rust from path+size+mtime; the frontend cannot recompute the hash, and R5.4 forbids image bytes in payloads — the row renders `convertFileSrc(cover_path)` and falls back to the glyph on `onerror` when the file does not exist yet). Field names, existing fields and all commands unchanged | Assistant (design) |
| DR-52 | 2026-11-03 | **`ToastStack` implemented directly, not as a kit wrapper** (verified against the installed `bits-ui@2.20.3` exports during the compatibility check, before the affected code): the kit ships Dialog, ContextMenu, Switch, Tooltip and friends but **no Toast primitive** (§5.3.9's "wraps a kit primitive" assumed one). Options: hand-rolled accessible stack, or a new third-party toast dependency. Choice: hand-rolled — a new dependency needs user approval (AGENTS §2) and UI-05's requirements (polite live region, `role="alert"` for errors, focusable actions, dismiss) are small and fully under our token system; behavior and appearance are unchanged from the agreed design. §5.3.9's table row updated to match | Assistant (design) |
| DR-53 | 2026-11-03 | **Explicit `image = { version = "0.25", default-features = false, features = ["png"] }` dependency** (found by the cover-render test during implementation: `image.save("…png")` failed `Unsupported(Format(Png))`, so covers fell back to the glyph for every file — AC-06 failed silently). Cause: `pdfium-render@0.9.5` pulls `image` with `default-features = false, features = ["jpeg"]` — no PNG encoder in the resolved feature set. Options: our own hand-rolled PNG encoder in `covers/` (~80 lines of format code, larger files), or add the `image` crate explicitly with the `png` feature. Choice (user-approved): the explicit dependency — `image@0.25` is already in the lockfile as pdfium-render's own dependency, so the build graph gains no new crate; the entry only declares the PNG capability our own code uses (R3.3 satisfied: same approved crate, explicit feature). Covers now encode real PNGs; glyph remains the fallback only for genuinely unrenderable files | User |

| DR-54 | 2026-11-03 | **UI store singleton duplication fixed** (found during stage-4 UI smoke verification: no toast ever rendered — an R4.6 violation — although the store push executed and other state updated normally). Cause: the store modules were imported under two specifier spellings — `$lib/state/<name>.svelte` (13 files) and relative spellings `./feedback.svelte`, `./settings.svelte`, `./state/library.svelte` (`actions.ts`, `importFlow.ts`, `state/library.svelte.ts`). Vite resolves the two spellings of a `.svelte.ts` module to different module ids, so the production bundle contained two copies of `FeedbackStore` (verified: the compiled class appears twice in the built `index-*.js`): the library store pushed toasts into an instance `ToastStack` never renders. Fix: one canonical spelling — every store import is `$lib/state/…` (relative spellings removed); regression test `ui/src/lib/state/import-discipline.test.ts` (static source scan, same convention as the i18n coverage test) asserts no store module is ever imported by a non-canonical spelling; rule added as RULES R7.5 | Assistant (fix) |

| DR-55 | 2026-11-03 | **Toast counts are grouped through `format.ts` (R8.1)** (found by the UI smoke run: the import toast rendered "Imported 10000 PDFs" while the status chip, bulk bar and result count all group digits via `Intl.NumberFormat`). `tp()` now interpolates the `{count}` placeholder with `formatCount(count)` — every count-bearing message (import/skip/delete/rescan toasts) shows the same grouping as the rest of the product; plural selection keeps using the raw number via `Intl.PluralRules`. Regression test `ui/src/lib/i18n/plural-count.test.ts` (locale-independent, same pattern as `format.test.ts`) | Assistant (design) |

| DR-56 | 2026-11-03 | **Kit-rendered chrome moves to the global design-system layer (base.css)** (found during stage-4 verification: the category picker rendered unpositioned — `position: static`, appended below the viewport, its checkbox "not interactable"; same for every dialog, menu and the star toggle). Cause: Svelte 5 scopes a component's CSS to elements in that component's own template — it does not reach DOM nodes rendered by another component. All four kit wrappers (Modal, ContextMenu, SortMenu, StarButton) styled the kit's DOM with scoped selectors, and the modal animation hook targeted `data-bits-dialog-content`, an attribute bits-ui 2.20 does not emit (verified rendered attributes: `data-dialog-content`, `data-state="open"`). Fix, consistent with the existing layering (base.css already carries `.control`, `.field`, `.chip`, `.dialog-*` as the shared-chrome layer): menu chrome (`.menu`/`.menu-item`/`.menu-sep` + `[data-highlighted]`/`[data-active]`/`[data-danger]`), dialog chrome (`.modal-overlay`/`.modal`/`.modal-title`/`.modal-close` + corrected animation hook) and the star toggle (`.star`/`.star-thumb`) live in base.css; the four wrappers keep no style blocks; `ImportButton` keeps only its menu's anchor position (its own DOM); `.sort-menu` namespace for the sort variant's one differing rule; renames to avoid collisions with the new globals: Modal's overlay class `.overlay` → `.modal-overlay`, DocumentCard's star wrapper `.star.overlay` → `.card-star`. Context-menu trigger keeps `display: contents` globally so wrapped rows/cards are unaffected | Assistant (fix) |
| DR-57 | 2026-11-03 | **Overlay Esc semantics fixed in code; verification mapping and focus-management text corrected** (found during stage-4 verification: Esc closing a dialog or menu silently wiped the row selection — §5.2 violated; the UI assertion "one query per debounced burst" was flaky by harness physics — WebDriver input speed is not controllable). Code fixes: (1) `feedback.overlayCount` was `$state` and `beginOverlay()` read+wrote it inside registration effects — a reactive loop (thousands of begin/end cycles per open overlay, oscillating count); the counter is now a plain field (its only reader is App's imperative keydown handler). (2) Overlay registration moved to component mount-lifecycle (`components/OverlayAnchor.svelte`, mounted inside each kit wrapper's Content/Menu) — no dependence on the kit's `open` binding. (3) The overlay-count decrement is deferred past the current task (`queueMicrotask`, pinned by `state/feedback.test.ts`), and App's global Esc branch defers to an overlay on either signal — `event.defaultPrevented` (the kit marks a consumed Escape; measured 1 on both menu and dialog paths) or a non-zero overlay count (covers Escape while focus sits outside the overlay): a dialog's close chain drains microtasks before App's window-level listener runs, so the count alone can read 0. (4) The `isTextTarget` guard was placed after all bindings in App's handler (inert — Ctrl+F fired while typing in notes, violating line 170); it now guards the whole handler as §5.3 states, and Ctrl+F-selects-text inside the search box lives in `SearchBox.svelte` per §5.3's SearchBox item. (5) `trapFocus` removed from `lib/focus.ts` — dead code superseded by the kit's native focus management (verified: initial focus, trap, restore-to-trigger after Esc). Spec text updated with user approval: §5.3 focus-trap sentence, §5.3.12 assertion list (debounce assertion moves to the Vitest pure-logic scope — `debounce.ts` unit tests; stale-response UI assertions kept; the suite's selection-preservation, busy-gate, context-menu and drag-drop assertions recorded) | User (approved 2026-11-03) |
| DR-58 | 2026-11-03 | **Package manager for the frontend switched to pnpm** (user request; no spec text pinned one — §5.3.1 names the toolchain, not a package manager). `ui/` installs via `pnpm install` (`pnpm-lock.yaml` replaces `package-lock.json`; dependency versions unchanged — same `package.json`); `ui/package.json` pins `"packageManager": "pnpm@12.4.1"`; `tauri.conf.json` `beforeDevCommand`/`beforeBuildCommand` switch to `pnpm run …` (the Tauri CLI runs them from `ui/` — verified empirically: the literal strings fail from the repo root and work through `tauri build`). Rust side, product dependencies and all commands unchanged. Full gate re-run after the switch (vitest, svelte-check, `tauri build`, UI smoke) | User |
| DR-59 | 2026-11-03 | **Pdfium bundled on every platform** (found while writing the per-platform production guide): `bundle.resources` listed the literal `binaries/pdfium.dll`, so Linux/macOS packages (`libpdfium.so` / `libpdfium.dylib` — never matched) would ship without the library and silently lose covers, contradicting DR-50c's "bundled pdfium library". Fix: `"resources": ["binaries/*pdfium*"]` — a glob matching exactly the library `fetch-pdfium.mjs` downloaded for the build platform. Windows path verified end-to-end: release build produces NSIS + MSI; administrative extraction shows `pdfkeeper.exe` with `binaries/pdfium.dll` beside it — the layout `covers::bind_candidates` searches (exe dir → `binaries/` beside the exe → dev `cwd/binaries`); the installed exe runs from that layout. Linux/macOS layouts follow the same bundling rule but are not exercised on this machine | Assistant (fix) |
| DR-60 | 2026-11-03 | **Product name renamed: "PDF Manager" → "PDF Keeper"** (user decision). Matches the name the codebase already used everywhere else: Cargo package `pdfkeeper`, binary `pdfkeeper.exe`, identifier `com.pdfkeeper.app`, repo `pdf-keeper`. Renamed sites (all occurrences of the old string): `productName` + window `title` (`tauri.conf.json`), `app.title` (`en.ts`), startup panic message (`lib.rs`), spec title + INDEX brief, `AGENTS.md` project map (edited in place per §1.8 — this entry is its record), README title + artifact names, user-guide README + getting-started, one technical-reference sentence. Unchanged by design: bundle identifier `com.pdfkeeper.app` (data directory stable — no migration), binary name, all IDs. Historical Decision Log entries keep the wording they were written with (append-only records). Windows installer names become `PDF Keeper_0.0.1_x64-setup.exe` / `PDF Keeper_0.0.1_x64_en-US.msi` — rebuild verifies them | User |
| DR-61 | 2026-11-03 | **Sidebar rail fix (user-reported: a horizontal scrollbar appeared under the collapsed sidebar).** Two defects against §5.3 ("columns 264px 1fr, collapsible to a 56px icon rail"): (a) neither sidebar state had the spec's widths — `--side-width`/`--side-rail` tokens existed but the grid column was `auto`, so the sidebar sized to its content (measured 225px open, 49px rail); (b) in the rail the category rows kept their name and count chip — Sidebar's scoped hiding never reached child-component DOM (the DR-56 scoping trap), the 40px nav overflowed, and WebView2 rendered the scrollbar the user saw. Fix in `Sidebar.svelte`: `.sidebar { width: var(--side-width) }`, `.collapsed { width: var(--side-rail) }` (global `border-box` in `base.css` makes both exact), and `.collapsed :global(.category-name)` + `.collapsed :global(.category-row .chip)` hidden — the rail is icons only, matching the design. New smoke flow `flowSidebarRail` asserts collapsed 56px / zero horizontal overflow / rows present, and expanded 264px. Full suite 58/58; svelte-check 0 | Assistant (fix found via user report) |
| DR-62 | 2026-11-03 | **Rail scrollbar returned on hover (user-reported follow-up).** CategoryRow's own `.category-row:hover .category-actions { display: inline-flex }` (specificity 0-3-0) out-ranked Sidebar's plain `.collapsed :global(.category-actions)` hiding (0-2-0): on hover/focus the rename/delete buttons reappeared inside the 40px rail, overflowed it, and re-drew the horizontal scrollbar — clipped beyond the rail edge, so they were also unreachable (part of the user's "cannot rename or delete"). Fix: the hiding rules spell out the `:hover`/`:focus-within` variants (0-5-0 wins). Smoke flow gains a hover probe: pointer moved onto a rail row, then asserts zero overflow and zero revealed elements | Assistant (fix found via user report) |
| DR-63 | 2026-11-03 | **Category rename/delete dialogs never opened — in ANY sidebar state (root cause of the user's "cannot rename or delete").** `Modal`'s `open` prop defaults to `false` (`Dialog.Root bind:open` renders nothing when open=false); every other dialog wrapper passes `bind:open` with a local `let open = $state(true)` (DeleteDialog pattern). Sidebar's category rename/delete rendered bare `<Modal>` inside `{#if}` without `open` — the dialogs mounted closed, invisible, unresponsive. Proven by temporary probes: menu selection ran (`openRename` fired), Modal mounted, no dialog visible. Fix: new `RenameCategoryDialog.svelte` (prefilled field, duplicate-name inline error, Discard/Rename) and `DeleteCategoryDialog.svelte` (confirmation stating documents keep their files, Discard/Delete), both following the DeleteDialog pattern (`open = $state(true)` + `bind:open` + `$effect → ondone`); Sidebar keeps only `renaming`/`deleting` state. Verified from the rail end-to-end: menu → prefilled dialog → commit → renamed name shows after expanding; delete confirmation → Discard → category survives. Harness lessons recorded in `scripts/ui-smoke.mjs`: menu overlays animate open — `clickAtStable` clicks only after the target rect is stable; one W3C action chain dispatches every key against the focus captured at chain start, so ArrowDown and Enter must be separate chains. Full suite 69/69; svelte-check 0/0; vitest 25/25 | Assistant (fix found via user report) |
| DR-64 | 2026-11-03 | **Deviation recorded and adopted (user decision): category rename/delete are dialog-based.** The categories feature spec's design promised rename via inline row input or `F2`; the implementation shipped a dialog with neither — an unrecorded deviation discovered while fixing DR-63. Options raised (record-and-keep / add `F2`→dialog / implement inline rename too); user chose record-and-keep: the dialog works in both sidebar states (an inline input cannot fit the 40px rail) and matches the delete/relink/details dialog pattern. `F2` is NOT added; no inline input. The feature spec's Rename/Delete design lines are marked MODIFIED with their old text quoted (the spec is pre-Ship and editable); the technical reference is corrected to the actual components | User |

## 8. Open questions

| ID | Question | Blocking | Status |
|---|---|---|---|
| OQ-1 | ~~Technical stack~~ | — | **CLOSED → DR-12 (Tauri + Rust)** |
| OQ-2 | ~~Confirm or veto each PROPOSED default item by item~~ | — | **CLOSED → DR-15/16/17/18 (all items AGREED)** |
| OQ-4 | ~~UI polish scope~~ | — | **CLOSED → DR-16** |
| OQ-8 | ~~Cover-thumbnail generation technology~~ | — | **CLOSED → DR-17 (pdfium-render, render at import, PNG cache)** |
| OQ-5 | ~~Frontend framework~~ | — | **CLOSED → DR-14 (Svelte)** |
| OQ-6 | ~~Backend crate choices~~ | — | **CLOSED → DR-14 (rusqlite bundled + lopdf)** |
| OQ-7 | ~~Rust toolchain install~~ | — | **CLOSED → DR-14 (assistant installs via winget at implementation start)** |
| OQ-9 | ~~Which component kit~~ | UI build | **CLOSED → DR-45 (bits-ui headless primitives, styled only with our design tokens; no Tailwind, no kit palette)** |
| OQ-10 | ~~Native file dialog and OS opener mechanism~~ | import / relink / open | **CLOSED → DR-44 (official `tauri-plugin-dialog` + `tauri-plugin-opener`)** |
| OQ-11 | ~~Where UI preferences persist~~ | startup restore | **CLOSED → DR-44 (SQLite `settings` table via `app_get_settings` / `app_set_setting`; window geometry deferred)** |
| OQ-12 | ~~Capability/CSP exceptions~~ | covers, styling | **CLOSED → DR-44 (asset protocol scoped to `<user-data>/covers/**` + `style-src 'unsafe-inline'`)** |
| OQ-13 | ~~Frontend test tooling~~ | AC test mapping (§5.3.12) | **CLOSED → DR-44 (Vitest, dev-only)** |

## 9. Acceptance criteria (final — implementation gated on user approval)

AC-01…AC-06 live in the owning feature specs (DR-32); this table is the index. Each feature ships together with its AC test (AGENTS workflow 3). A requirement without a formal AC-ID is bound by the tests listed in its feature spec's "Tests / acceptance" design section — those tests ship with the feature exactly like an AC test (covers: favorites, status-feedback, metadata-editing, sorting-and-views, keyboard operability).

| ID | Lives in | Verification method |
|---|---|---|
| AC-01 | SPEC-v0.0.1-importing-pdfs.md | Automated service + UI test with timing assertion (< 30 s / 10 000 files) |
| AC-02 | SPEC-v0.0.1-searching.md | Automated test with timing assertion |
| AC-03 | SPEC-v0.0.1-categories.md | Automated test |
| AC-04 | SPEC-v0.0.1-opening-and-deleting.md | Automated test |
| AC-05 | SPEC-v0.0.1-missing-files-relinking.md | Automated test |
| AC-06 | SPEC-v0.0.1-covers.md | Automated test + visual proof |

Cross-cutting criteria stay here:

| ID | Criterion | Verification method |
|---|---|---|
| AC-07 | App launches on Windows (proof here); macOS/Linux builds produced by CI matrix | Build + run proof per platform |

## 10. Discussion protocol

1. Assistant raises OPEN questions with concrete options and trade-offs.
2. User answers → assistant records DR entry + flips statuses in this file **before** any further work.
3. Implementation begins only when: zero OPEN OQs, the spec's registry status is APPROVED, and the user has said "implement" (see AGENTS.md — the registry is the single authority).

## 11. Draft history

This v0.0.1 spec was drafted as internal revisions 0.2–0.7 on 2026-11-02/03 before approval (first full draft; stack decisions DR-12/DR-14; cover requirement FR-16 added by the user; final confirmations DR-17/DR-18). Per the version rules (DR-27..DR-29), drafts do not mint version numbers — the step-by-step history is §7 Decision Log and `git log --follow` on this file.
