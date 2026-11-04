# Specs Index

Status registry for the specification system. **Start here.** Specs are managed **per release version**: every release has one spec file describing completely what that release implements. This index tracks each spec's lifecycle status.

## Spec registry

| Spec file | Release | Status | Brief |
|---|---|---|---|
| `docs/specs/SPEC-v0.0.1.md` | v0.0.1 | **RELEASED** | PDF Keeper first release requirements: reference-in-place PDF library, many-to-many categories, metadata search (no full-text), favorites, cover thumbnails, external viewer, missing-file relink; Tauri + Rust + Svelte stack; performance budgets; acceptance criteria AC-01…AC-07. Parent document; 10 linked feature specs reached via its §3 feature index. |
| `docs/specs/SPEC-v0.0.2.md` | v0.0.2 | **RELEASED** (2026-11-04) | UI restructure + polish from the 2026-11-03 review: sidebarless navigation — Browse menu + filter chips + Categories manager dialog (UI-09/UI-10, UI-01 MODIFIED; OQ-14 closed DR-68/DR-69), author/notes/title display (UI-06), frameless window with controls in the toolbar (UI-07), single View menu incl. grid column override (UI-08), custom scrollbars across every scroll container (UI-11), app menu + About dialog showing the app version (UI-12), secondary sort key (FR-13 MODIFIED), multi-select category filter with union semantics and import assignment to every active category (FR-02/FR-10 MODIFIED, DR-82), activation aligned to the released double-click design (defect D1). Verified 2026-11-04: 132/132 real-app smoke checks, 48 Rust tests, 38 frontend tests, clippy + fmt clean; Build ledger §8 all ✅. Frozen; implementation-time decisions DR-80…DR-90 are in its Decision Log. |
| `docs/specs/SPEC-v0.0.3.md` | v0.0.3 | **RELEASED** (2026-11-04) | Draft opened 2026-11-04. Version set by the user (DR-91); Windows-only packaging with the NFR-04 cross-platform gap accepted as a known limitation (DR-92). **Two batches.** (1) UI minimalism: icon-only toolbar controls with tooltips (UI-13), import inside the search field (UI-14), filter chips removed and the Browse menu becomes the only filter display plus the counts and *Rescan files* (UI-09 MODIFIED, supersedes DR-46's placement), scope-naming search placeholder (UI-16), category badges removed (UI-03 MODIFIED), conditional status bar (UI-15), uniform control rhythm (UI-01 MODIFIED), window-drag defect D2 (root cause verified in Tauri's `drag.js`). (2) Navigation + density rework (DR-98/DR-99): View menu absorbs Sort by / Then by and the Sort control is removed (UI-08 MODIFIED), the app menu is removed and About moves under a new **Settings menu + Settings dialog** with a **System/Light/Dark theme override** persisted as a seventh settings key (UI-12 MODIFIED, UI-17 ADDED, §5.3.7 MODIFIED), a **Select mode** toolbar toggle changing what a plain click does while activation stays double-click/Enter/Open (UI-18 ADDED, D1's alignment MODIFIED), selection checkbox and persistent star removed with the Details action taking the `info` glyph (UI-03), list row 48→64 px with a 45×64 cover, and grid cards derived from the container width capped at 320 px with the row block computed from the card height (§5.3.5 MODIFIED). Design §3.1–§3.10, AC-19…AC-31, build ledger complete — every row ✅ with its test reference (one Rust-core row, no Tauri-command row: `app_get_settings` / `app_set_setting` already carry the key). All `OQ-` closed: OQ-15/OQ-17/OQ-18/OQ-19/OQ-20…OQ-25 (DR-95/DR-96/DR-97/DR-99) and OQ-16 **unchanged** — DR-47/DR-48's reservation of v0.1.0 for the app-updates release stands, and what the release after v0.0.3 is stays a question for that draft. `AGENTS.md` §2 stage text corrected (DR-97). Verified 2026-11-04: **187/187 real-app smoke checks** (three verification passes; the last two found and fixed DR-103…DR-106), 49 Rust tests, 45 frontend unit tests, svelte-check clean, clippy + fmt clean. Frozen; implementation-time decisions DR-101…DR-106 are in its Decision Log. |

Statuses: **PROPOSED** (drafted, not approved) → **APPROVED** (agreed, awaiting build go) → **ON-GOING** (being built) → **RELEASED** (implemented, verified, frozen) · **REJECTED** (abandoned, with reason) · **SUPERSEDED** (replaced by a later release spec).

**Semantic versioning (DR-28, DR-29).** The spec version IS the release version: `MAJOR.MINOR.PATCH`. The product starts at **v0.0.1 on the 0.x unstable line** — new capabilities bump MINOR (`0.1.0`, `0.2.0`, …), bug fixes bump PATCH; **1.0.0 is declared only by the user** when the product is considered stable. **Applied on the 0.0.x line (DR-91, first applied by DR-65):** feature releases increment the third position (`v0.0.1` → `v0.0.2` → `v0.0.3`); a fix-only release keeps the PATCH definition below — no spec file. MINOR/MAJOR semantics apply from `0.1.0`, whose content is reserved by DR-47 unless the user re-sequence it (OQ-16).
- **MAJOR** — incompatible product change (re-scope, removed capability, data-model migration).
- **MINOR** — new or changed requirements.
- **PATCH** — bug fixes only. **No spec file**: the newest feature spec stays authoritative; the patch is a registry row, a Decision Log entry in that spec, and regression tests.
Feature-release specs are named after their version (`SPEC-v0.0.1.md`, `SPEC-v0.1.0.md`, …), created when that release is first drafted and keeping its number through its lifecycle. A release spec may split feature-level requirements into linked feature specs `SPEC-v<VERSION>-<slug>.md` (DR-32): the parent is the only registry row — feature specs are reached through the parent's feature index and inherit its status. Pre-approval discussion edits the same files — draft history is the Decision Log and git, never new version numbers. Bumps are proposed by agents with justification, set only by the user.

## Lifecycle

1. **Draft** — a new feature-release spec `SPEC-v<version>.md` (MINOR/MAJOR bump) is created as a complete document: the previous released spec carried forward, plus the planned changes marked **ADDED / MODIFIED (old text quoted) / REMOVED**. Review happens on the diff: `git diff docs/specs/SPEC-v<prev>.md docs/specs/SPEC-v<new>.md`. Status PROPOSED.
2. **Approve** — user approval flips status to APPROVED; the explicit "implement" go opens the build gate (ON-GOING).
3. **Build** — code is built against that spec file; implementation-time decisions append to its Decision Log (RULES R9.1). The requirement text is not rewritten mid-build.
4. **Release** — after verification (AGENTS workflow 4), the spec file is frozen: status → RELEASED, never edited again (the one-time 2026-11-03 retrofits DR-71 and DR-76 are the only exceptions — AGENTS §2). The Ship commit also flips matching `docs/release/features/` guide pages to Shipped and writes `docs/release/notes/v<version>.md`. Patch releases (`.1`, `.2`, …) skip steps 1–2: they fix bugs against the newest RELEASED spec, are recorded in its Decision Log and this registry, and get their own release-notes page.
5. Next feature release starts at step 1 from the newest RELEASED spec. Abandoned drafts become REJECTED (kept for history) and produce no release.

## Spec size discipline

- **Read selectively:** requirement groups are located via this index and stable IDs; agents read cited sections, not whole specs. During ON-GOING work the spec file *is* the working document — only its cited sections are read.
- **Decision-log cap:** a new release spec carries forward only decisions that still affect current behavior; superseded decisions remain in the older spec files and in git history. The live log stays under ~50 entries.
- **Split trigger:** if a spec would exceed ~1,000 lines, it splits into module files under `docs/specs/modules/` (e.g. `library.md`, `search.md`), registered in this index as the authoritative set.

## Registration

Every new **parent** spec file and every status flip updates this registry in the same commit; feature specs are registered in their parent's feature index, not as registry rows.

## Documentation layers

`docs/release/features/` is the end-user guide — plain language only, no requirement IDs or technical terms; pages are drafted when a capability enters an APPROVED feature-release spec, marked Draft. `docs/release/technical-specs/` is the developer reference **for released features only** — a document is created at the Ship commit that first ships the feature, migrated from the design sections of the spec that shipped it, and updated in later Ship commits. `docs/release/notes/` holds one release-notes page per shipped version (`v<version>.md`, end-user language: what changed, what is not in that version, known issues), written in the Ship commit and never edited afterwards. The technical design of in-development features lives in the current spec's feature specs ("Technical design" sections) — never in `docs/release/`. No `docs/release/` directory may claim unreleased behavior as shipped.

## Related documents

| Document | Role |
|---|---|
| `AGENTS.md` (repo root) | Process rules and workflow stages |
| `RULES.md` (repo root) | Strict coding rules, binding from implementation approval |
| `docs/release/features/` | End-user guide (plain language; updated every release) |
| `docs/release/technical-specs/` | Developer reference per feature — released features only (created at Ship, updated every later release) |
| `docs/release/notes/` | Release notes, one page per shipped version (end-user language; written at Ship, never edited afterwards) |
