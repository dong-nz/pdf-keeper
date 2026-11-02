# PDF Manager — Requirements Specification

| | |
|---|---|
| Document status | **FINAL — requirements complete; awaiting implementation approval** |
| Version | 0.7 |
| Last updated | 2026-11-03 |
| Implementation | **NOT STARTED and NOT APPROVED** — all OQs are closed; the only remaining gate is explicit user approval (AGENTS.md Rule 1). Coding rules: RULES.md |

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
- **File naming.** The current spec is always `docs/specs/SPEC-v<VERSION>.md` (this file). When a version is superseded, its file is frozen and moved to `docs/specs/archive/`, and the new version starts as a new versioned file. Every spec and change proposal is registered in `docs/specs/INDEX.md`. Incremental development runs through change folders `docs/specs/changes/CHG-###-slug/` (proposal/delta/tasks); their deltas merge into a new baseline at ship time. The end-user guide lives in `docs/features/` (one page per capability, drafted from approved spec text, flipped to Shipped at ship time). Rule documents (`AGENTS.md`, `RULES.md`) are unversioned, live at the repo root, and reference the spec by pattern; all documentation lives under `docs/`. (DR-21, DR-22)
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
| Cloud sync, accounts, multi-user | Not requested | — |
| Additional UI languages | English-only shipped; i18n-ready string layer agreed instead | DR-17 |

## 3. Functional requirements

| ID | Requirement | Status |
|---|---|---|
| FR-01 | **Library model — reference in place.** The app indexes PDFs at their existing filesystem paths. It never copies, moves, renames, or rewrites indexed files (except when the user explicitly chooses "delete file from disk", FR-09). | **AGREED** (DR-02) |
| FR-02 | **Categories.** Create, rename, delete categories. A document may belong to **zero or more** categories (many-to-many). Sidebar lists categories with live document counts; selecting a category filters the library. Deleting a category detaches it from documents but never deletes the documents. | **AGREED** (DR-03) |
| FR-03 | **Search.** Instant search as the user types, matching against: title, filename, author, notes. Prefix matching (typing `repo` finds "Report"). Search combines with a category filter and the favorites filter (AND semantics). No full-text/content search. | **AGREED** scope (DR-01); instant UX is part of P1 |
| FR-04 | **Favorites.** Star/unstar a document. Favorited documents sort to the top of every list. A "Favorites" filter entry exists in the sidebar. | **AGREED** (DR-08) |
| FR-05 | **Metadata auto-extraction.** On import, attempt to read title and author from the PDF's internal info dictionary. If unreadable (encrypted, compressed object streams, malformed), fall back to the filename (without `.pdf`). Extracted or derived title is always editable afterwards. | **AGREED** (DR-07) |
| FR-06 | **Metadata editing.** User can edit title, author, and free-text notes of any indexed document at any time; these fields are searchable (FR-03). | **AGREED** (DR-07, "always editable") |
| FR-07 | **Bulk category operations.** Multi-select documents → add and/or remove categories in one action. | **AGREED** (DR-08) |
| FR-08 | **Open externally.** Activating a document opens it with the OS default application for `.pdf`. Activating a **missing** document shows an error toast offering a **Relink…** action; no open is attempted. | **AGREED** (DR-04, DR-13c) |
| FR-09 | **Delete semantics.** Deleting offers both options per action: (a) remove from library only — disk file untouched; (b) delete file from disk — with confirmation. | **AGREED** (DR-06) |
| FR-10 | **Import.** Manual import via: file picker (multi-select), drag-and-drop onto the window, and a one-time "Import folder…" action (adds all PDFs in a chosen directory; not watched). Importing while a category is selected auto-assigns the imported documents to it; with no category selected, nothing is assigned. No watched/auto-import (see §2). | **AGREED** (DR-13a, DR-15) |
| FR-11 | **Duplicate handling.** Importing a path already in the library is skipped with a notice. No content-hash dedup in v1. | **AGREED** (DR-15) |
| FR-12 | **Missing-file handling.** The app checks indexed paths on **startup and on manual "Rescan"** only (no background scanning). Vanished files are marked **missing** in the UI and never auto-removed. A **relink** action points the entry at a new path. | **AGREED** (DR-13b) |
| FR-13 | **Sorting.** Sort library by title, date added, file size (asc/desc); default title A→Z; favorites always pinned first. | **AGREED** (DR-16) |
| FR-14 | **Views.** Table (list) view and card (grid) view, switchable by the user; both virtualized (NFR-01). | **AGREED** (DR-16) |
| FR-15 | **Status feedback.** Status bar shows total documents, favorites count, missing count; import/rescan results reported via toasts. | **AGREED** (DR-18) |
| FR-16 | **Cover thumbnails.** Every document displays a first-page cover in list rows and grid cards. Covers are generated at import, regenerated by Rescan when the file changed or the cover is absent, cached in the app-data directory keyed by path+size+mtime, and removed when the library entry is removed. Unrenderable pages fall back to a generic PDF glyph. Covers are in-app thumbnails only — documents still open externally (DR-04 unchanged). | **AGREED** (DR-16, DR-17) |

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
| UI-02 | Document editor modal: title, author, notes, category checkboxes, favorite toggle, relink button (when missing), delete actions. | **AGREED** (DR-16) |
| UI-03 | Row content: selection checkbox, favorite star, cover thumbnail, title, category badges, filename, size, date added, missing badge, action buttons. Grid cards show the cover as the card image. | **AGREED** (DR-16) |
| UI-04 | Default sort: title A→Z (favorites always first). | **AGREED** (DR-16) |
| UI-05 | Context menus (right-click) on rows and categories. | **AGREED** (DR-16) |

## 6. Conceptual data model (technology approved by DR-14; structure informative)

- `documents` — one row per indexed file: path (unique), filename, title, author, notes, favorite, size, added_at, missing flag, title-source flag (auto vs user-edited).
- `categories` — name (unique, case-insensitive).
- `document_categories` — many-to-many join (FR-02).
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

## 9. Acceptance criteria (final — implementation gated on user approval)

| ID | Criterion | Verification method |
|---|---|---|
| AC-01 | Import 10 000 generated fixture PDFs (picker/folder/drag-drop paths exercised); all listed; duplicates skipped with notice | Automated service + UI test |
| AC-02 | Search returns correct results for title/filename/author/notes prefixes within the NFR-02 budget (< 100 ms at 10 000 docs) | Automated test with timing assertion |
| AC-03 | A document can hold ≥2 categories; bulk add/remove applies to a multi-selection | Automated test |
| AC-04 | Deleting via "library only" leaves the file on disk; "delete file" removes it (confirmed flow) | Automated test |
| AC-05 | Moving a file outside the app → Rescan marks it missing → relink restores it; missing activation shows toast with Relink… | Automated test |
| AC-06 | Cover thumbnails appear for list rows and grid cards after import; regenerate on Rescan after file change; unrenderable fixture falls back to glyph | Automated test + visual proof |
| AC-07 | App launches on Windows (proof here); macOS/Linux builds produced by CI matrix | Build + run proof per platform |

## 10. Discussion protocol

1. Assistant raises OPEN questions with concrete options and trade-offs.
2. User answers → assistant records DR entry + flips statuses in this file **before** any further work.
3. Implementation begins only when: zero OPEN OQs, document status changed from DRAFT, and the user has said "implement" (see AGENTS.md).

## 11. Version history

| Version | Date | Summary |
|---|---|---|
| 0.2 | 2026-11-02 | First full draft: scope from user decisions DR-01…DR-10; stack proposal DR-11 |
| 0.3 | 2026-11-03 | DR-12 stack → Tauri + Rust; DR-13 import/rescan/missing behavior; FR-08, FR-12 AGREED; OQ-5/6/7 opened |
| 0.4 | 2026-11-03 | DR-14 Svelte + rusqlite/lopdf + toolchain plan; DR-15 import mechanisms & duplicate handling; OQ-5/6/7 CLOSED |
| 0.5 | 2026-11-03 | DR-16 sorting/views/layout/editor/context menus AGREED; user added cover requirement → FR-16, OQ-8 |
| 0.6 | 2026-11-03 | DR-17 pdfium-render cover pipeline; NFR-02…NFR-07 confirmed incl. i18n-ready strings; OQ-8 CLOSED |
| 0.7 | 2026-11-03 | DR-18 FR-15 confirmed; **all OQs CLOSED; status FINAL, awaiting implementation approval**; renamed to versioned filename; RULES.md introduced |
