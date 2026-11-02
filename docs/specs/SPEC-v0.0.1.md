# PDF Manager — Requirements Specification

| | |
|---|---|
| Document status | **FINAL — requirements complete; awaiting implementation approval** |
| Version | 0.0.1 (semantic version — equals the target release version; see §0 versioning) |
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
- **File naming & versions.** Specs are managed **per feature release**, and **the spec version IS the release version**, following semantic versioning (`MAJOR.MINOR.PATCH`):
  - **0.x line (current):** the product starts at **v0.0.1** (user decision, DR-29) and is unstable — any requirement may still change. New capability → MINOR bump (`0.1.0`, `0.2.0`, …); bug fix → PATCH bump.
  - **MAJOR** — incompatible product change: re-scope, removed capability, data-model migration.
  - **1.0.0** is declared only by the user, when they consider the product stable; after 1.0.0 the usual semver guarantees apply (MINOR = backward-compatible additions, MAJOR = breaking).
  - **PATCH** — bug fixes only, against the requirements of the newest feature spec; **no new spec file** — the fix is a Decision Log entry plus regression tests, and the inherited spec stays authoritative.
  Each feature release gets one spec file named after its version (`docs/specs/SPEC-v0.1.0.md`, …; the first is `SPEC-v0.0.1.md`) — a complete document of what that release implements, keeping its number through its lifecycle (draft → approved → on-going → released). Pre-approval drafts edit the same file; draft history is the Decision Log and git. Lifecycle status (PROPOSED / APPROVED / ON-GOING / RELEASED / REJECTED / SUPERSEDED) is tracked only in `docs/specs/INDEX.md`, which also lists patch releases without spec files. A new feature-release spec is drafted as the previous RELEASED spec carried forward plus marked ADDED/MODIFIED (old text quoted) / REMOVED changes. RELEASED files are frozen forever. The end-user guide lives in `docs/released/features/` (plain language, one page per capability); the developer reference lives in `docs/released/technical-specs/` (one document per feature: design, commands, schema, tests, change history). Both document the product **as released**: pages are drafted when a capability enters an APPROVED feature-release spec but marked Planned/Draft, and their content changes only in a release Ship commit. Rule documents (`AGENTS.md`, `RULES.md`) are unversioned, live at the repo root, and reference the spec by pattern; all documentation lives under `docs/`. (DR-21..DR-31)
- **Feature specs.** A release spec may split feature-level requirements into `docs/specs/SPEC-v<VERSION>-<slug>.md` files linked from its feature index (§3). The parent is the only registry entry: feature specs inherit its lifecycle status and freeze with it. Every ID is defined in exactly one file. Cross-cutting content (overview, scope, NFRs, interface architecture, data model, Decision Log, open questions, cross-cutting ACs) stays in the parent. Slugs match the `docs/released/` pairs. (DR-32)
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

AC-01…AC-06 live in the owning feature specs (DR-32); this table is the index. Each feature ships together with its AC test (AGENTS workflow 3).

| ID | Lives in | Verification method |
|---|---|---|
| AC-01 | SPEC-v0.0.1-importing-pdfs.md | Automated service + UI test |
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
