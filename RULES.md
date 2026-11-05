# RULES.md — Strict Rules for Coding Agents

**Binding from the moment implementation is approved** (SPEC decision log entry). These rules are hard constraints, not guidance.

Language convention: **MUST / MUST NOT / NEVER** are binding. A violation is a defect that blocks "done". Requirement IDs (`FR-`, `NFR-`, `UI-`, `AC-`) refer to the current spec located via `docs/specs/INDEX.md` (`docs/specs/SPEC-v*.md`).

Conflict resolution: this file governs **code**; `AGENTS.md` governs **process**. Neither overrides the user.

---

## R1. Architecture

- R1.1 All product logic — database, library operations, search, category management, PDF metadata extraction, cover generation — MUST live in the Rust backend (`src-tauri/src/`) as plain library modules testable with `cargo test` without any UI.
- R1.2 Tauri commands MUST be thin wrappers only: validate input → call a service module → return serializable data or an error. Service modules return `Result<_, AppError>` (R3.2); the command boundary converts `AppError` to a user-presentable message string. A command body MUST NOT contain business logic.
- R1.3 The frontend MUST call only the whitelisted commands. The whitelist is defined in one place in Rust and mirrored in one typed client module in the frontend; the two MUST match, and the frontend MUST NOT call any other command.
- R1.4 The frontend MUST NOT persist library data. UI-only preferences (view mode, sort) MAY use `localStorage`. The SQLite database is the single source of truth for everything else.
- R1.5 Tauri's default security model MUST stay on: CSP enabled, no custom protocols, no additional capabilities — except those explicitly granted by a Decision Log entry.
- R1.6 NEVER add a second implementation path for the same behavior (no fallback stacks, no parallel APIs).

## R2. Data and search

- R2.1 SQLite access MUST use the `rusqlite` bundled build only. Schema changes MUST be additive migrations behind the `user_version` pragma and MUST have a migration test.
- R2.2 Every SQL statement MUST use bound parameters. NEVER interpolate user input into SQL text.
- R2.3 Search MUST use FTS5 `MATCH` with prefix tokens. A `LIKE` path is permitted ONLY as a caught-error fallback for malformed queries, never as the primary path.
- R2.4 `foreign_keys` MUST be ON. Every multi-table write (import with categories, bulk category ops, delete) MUST run inside a transaction.
- R2.5 Stored paths MUST be absolute and normalized; uniqueness MUST be enforced by the DB constraint (FR-11). Duplicate-path imports MUST be skipped with a user-visible notice.
- R2.6 File existence checks MUST never follow symlinks outside the indexed file itself, and MUST NOT auto-remove entries (FR-12).

## R3. Rust quality

- R3.1 `cargo fmt --check` and `cargo clippy` with zero warnings MUST pass before any claim of done.
- R3.2 NEVER `unwrap()`, `expect()`, or panic in product code paths. All fallible operations MUST return `Result<_, AppError>`; `AppError` MUST convert to a user-presentable message at the command boundary.
- R3.3 Dependencies MUST be exactly those approved in the SPEC (rusqlite bundled, lopdf, pdfium-render, tauri, serde, thiserror, and tooling already in the approved toolchain). Adding any crate REQUIRES a user-approved Decision Log entry first.
- R3.4 NEVER `unsafe` unless a binding requires it; then it MUST carry a `// SAFETY:` comment.
- R3.5 Import, rescan, and cover generation MUST run on spawned blocking tasks / async workers with progress events. Commands MUST NOT block the UI thread (NFR-02, NFR-07).
- R3.6 File I/O errors MUST include the offending path in the error message.

## R4. UI (Svelte)

- R4.1 Every user-facing string MUST come from the i18n message module (NFR-05), even though only `en` ships in v1.
- R4.2 List and grid MUST use windowed virtualization: DOM size MUST stay bounded (≈ viewport + buffer) regardless of library size (NFR-01).
- R4.3 Search input MUST be debounced 150 ms; results MUST replace atomically. NEVER re-render document rows/cards on incremental UI state changes (selection, hover, theme) — virtualized window updates only. Static chrome (sidebar, toolbar, status bar) MAY re-render locally. Cover images load lazily per R5.
- R4.4 Every interactive control MUST be keyboard-reachable with visible focus. Modals MUST trap focus and close on Esc (NFR-06).
- R4.5 Theming MUST follow the OS `prefers-color-scheme` by default and the user's explicit choice when one is set (UI-17, DR-102): the document root carries one concrete `data-theme` value and the ramps are CSS custom properties selected by it. NEVER hardcode a fixed palette in a component, and NEVER duplicate a ramp's values in a second block.
- R4.6 Every user-visible failure MUST be an actionable toast; where the SPEC defines an action (e.g. Relink… per FR-08), the toast MUST offer it. NEVER fail silently.
- R4.7 Context menus (UI-05) MUST expose exactly the same actions as buttons — no menu-only commands, and vice versa.

## R5. Covers (FR-16)

- R5.1 Covers MUST be generated only by the background queue (import/rescan), never synchronously in a command or during rendering.
- R5.2 Cache key MUST be path + size + mtime + the renderer's current target width (FR-16 as modified by DR-113: a render-size change must re-key entries, never leave a smaller stored image authoritative); files MUST live in the app-data covers directory; cache entries MUST be deleted when the library entry is deleted.
- R5.3 A cover failure MUST fall back to the generic glyph and MUST NOT block or fail the import.
- R5.4 The renderer MUST load covers from the approved asset path only; NEVER embed image bytes in command payloads.

## R6. Testing and verification

- R6.1 Every implemented requirement MUST ship with tests covering its acceptance criterion (SPEC §9). Core logic: `cargo test`; user flows: a UI smoke script driving the real app.
- R6.2 Test fixtures (PDFs) MUST be generated by scripts in `scripts/`, deterministic, and NEVER committed as binaries.
- R6.3 Performance-sensitive criteria (AC-02) MUST assert the timing budget in the test, not by manual observation.
- R6.4 "Done" REQUIRES: tests pass + clippy clean + the real app was launched and the changed flow was observed. Tests alone are never proof.
- R6.5 A bug fix MUST add the failing-before/passing-after regression test unless provably impractical, in which case the report MUST state why.

## R7. Naming and structure

- R7.1 Repository layout (once implementation exists):
  ```
  src-tauri/src/{main.rs, lib.rs, db/, library/, pdfmeta/, covers/, error.rs}
  ui/src/{lib/, components/, api.ts, i18n/}
  scripts/          # fixture generators, UI smoke driver
  docs/             # user guide + technical reference + release notes + non-spec documentation
  docs/release/features/    # README.md + one guide page per user-facing capability (end-user language only)
  docs/release/technical-specs/  # README.md + one technical document per feature (developer reference)
  docs/release/notes/  # README.md + one release-notes page per shipped version, v<version>.md (end-user language)
  docs/specs/       # INDEX.md (status registry) + SPEC-v<version>.md parents (+ SPEC-v<version>-<slug>.md feature specs; patches: no file)
  ```
- R7.2 Rust: modules and functions `snake_case`; types `UpperCamelCase`. Tauri commands: `library_…`, `categories_…`, `app_…` prefixes matching their module.
- R7.3 Svelte components `UpperCamelCase.svelte`; CSS classes `kebab-case`; i18n keys `section.action` dotted lowercase.
- R7.4 NEVER dead code, commented-out code, unused commands, `TODO` stubs, or speculative abstractions in merged work. Remove what the cutover makes obsolete.
- R7.5 A shared frontend module MUST be imported by exactly one canonical specifier (`$lib/…`). NEVER mix relative and `$lib` spellings of the same module: the bundler resolves the two spellings to different module instances, silently duplicating module-level state (store singletons).

## R8. Packaging and delivery

- R8.1 Packaging MUST use the Tauri bundler targeting: Windows (NSIS + MSI), macOS (DMG), Linux (AppImage + .deb) — per NFR-04. CI MUST build all three on their native runners.
- R8.2 The app MUST make no network calls at all (NFR-03): no updater, no telemetry, no remote assets. All fonts/icons bundled.
- R8.3 README MUST document features, dev setup (incl. rustup + MSVC prerequisites), run/build/test commands, and limitations (FR-05 metadata extraction caveats).
- R8.4 App data (SQLite DB, cover cache) MUST live in the platform user-data directory; NEVER next to the executable or inside the repo.
- R8.5 Shipping a release MUST, in the same Ship commit: flip its spec status to RELEASED in `docs/specs/INDEX.md` (parent and feature specs are never edited again), flip the matching `docs/release/features/` pages to Shipped (verified behavior + real limitations), and bring `docs/release/technical-specs/` in line with the code as released — creating a document for each first-time shipped feature by migrating it from the shipped spec's Technical design sections (marked "Since vX.Y.Z"), appending change-history entries and updating design sections for existing ones — and mark superseded specs (parents and their feature specs) SUPERSEDED — and write `docs/release/notes/v<version>.md` (plain end-user language: what changed for the user, what is not in this version, known issues; written from what shipped, never edited afterwards). Guide pages MUST NOT claim unreleased behavior as available.
- R8.6 When a capability enters an APPROVED feature-release spec, its `docs/release/features/` guide page (end-user language only — no requirement IDs, no technical terms) is created, drafted strictly from spec text (AGENTS §2a), marked Draft; its Technical design lives in the feature spec's "Technical design" section (cross-cutting: parent §5.1/§5.2). The `docs/release/technical-specs/` document is created only at the release Ship commit (R8.5). One guide page per capability, same slug as its feature spec.
- R8.7 A PATCH release creates no spec file and no new requirements: it inherits the newest RELEASED feature spec, MUST pass that spec's acceptance criteria unchanged, adds a regression test per fixed bug, records the fix as a Decision Log entry in the inherited spec plus a registry row, and gets its own `docs/release/notes/v<version>.md` page (the fixed bugs, end-user language).

## R9. Change discipline

- R9.1 Any implementation-time decision that affects behavior MUST be written into the current SPEC's Decision Log **before** the code that depends on it.
- R9.2 Commits (when a VCS is in use) MUST be small, imperative, and reference requirement IDs (e.g. `library: prefix-token search per FR-03`). `git commit` and `git push` require the user's explicit approval per operation (AGENTS §2, DR-41); uncommitted work stays in the working tree until approved.
- R9.3 A change that would alter an AGREED requirement MUST stop coding and reopen a question in the spec first — agents do not silently amend requirements.
- R9.4 This file and `AGENTS.md` are edited in place (no version-history tables); every change to them is recorded as a dated Decision Log entry in the current spec (AGENTS Rule 8).
