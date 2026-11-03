# Specs Index

Status registry for the specification system. **Start here.** Specs are managed **per release version**: every release has one spec file describing completely what that release implements. This index tracks each spec's lifecycle status.

## Spec registry

| Spec file | Release | Status | Brief |
|---|---|---|---|
| `docs/specs/SPEC-v0.0.1.md` | v0.0.1 | **RELEASED** | PDF Keeper first release requirements: reference-in-place PDF library, many-to-many categories, metadata search (no full-text), favorites, cover thumbnails, external viewer, missing-file relink; Tauri + Rust + Svelte stack; performance budgets; acceptance criteria AC-01…AC-07. Parent document; 10 linked feature specs reached via its §3 feature index. |

Statuses: **PROPOSED** (drafted, not approved) → **APPROVED** (agreed, awaiting build go) → **ON-GOING** (being built) → **RELEASED** (implemented, verified, frozen) · **REJECTED** (abandoned, with reason) · **SUPERSEDED** (replaced by a later release spec).

**Semantic versioning (DR-28, DR-29).** The spec version IS the release version: `MAJOR.MINOR.PATCH`. The product starts at **v0.0.1 on the 0.x unstable line** — new capabilities bump MINOR (`0.1.0`, `0.2.0`, …), bug fixes bump PATCH; **1.0.0 is declared only by the user** when the product is considered stable.
- **MAJOR** — incompatible product change (re-scope, removed capability, data-model migration).
- **MINOR** — new or changed requirements.
- **PATCH** — bug fixes only. **No spec file**: the newest feature spec stays authoritative; the patch is a registry row, a Decision Log entry in that spec, and regression tests.
Feature-release specs are named after their version (`SPEC-v0.0.1.md`, `SPEC-v0.1.0.md`, …), created when that release is first drafted and keeping its number through its lifecycle. A release spec may split feature-level requirements into linked feature specs `SPEC-v<VERSION>-<slug>.md` (DR-32): the parent is the only registry row — feature specs are reached through the parent's feature index and inherit its status. Pre-approval discussion edits the same files — draft history is the Decision Log and git, never new version numbers. Bumps are proposed by agents with justification, set only by the user.

## Lifecycle

1. **Draft** — a new feature-release spec `SPEC-v<version>.md` (MINOR/MAJOR bump) is created as a complete document: the previous released spec carried forward, plus the planned changes marked **ADDED / MODIFIED (old text quoted) / REMOVED**. Review happens on the diff: `git diff docs/specs/SPEC-v<prev>.md docs/specs/SPEC-v<new>.md`. Status PROPOSED.
2. **Approve** — user approval flips status to APPROVED; the explicit "implement" go opens the build gate (ON-GOING).
3. **Build** — code is built against that spec file; implementation-time decisions append to its Decision Log (RULES R9.1). The requirement text is not rewritten mid-build.
4. **Release** — after verification (AGENTS workflow 4), the spec file is frozen: status → RELEASED, never edited again. The Ship commit also flips matching `docs/released/features/` guide pages to Shipped. Patch releases (`.1`, `.2`, …) skip steps 1–2: they fix bugs against the newest RELEASED spec and are recorded in its Decision Log and this registry.
5. Next feature release starts at step 1 from the newest RELEASED spec. Abandoned drafts become REJECTED (kept for history) and produce no release.

## Spec size discipline

- **Read selectively:** requirement groups are located via this index and stable IDs; agents read cited sections, not whole specs. During ON-GOING work the spec file *is* the working document — only its cited sections are read.
- **Decision-log cap:** a new release spec carries forward only decisions that still affect current behavior; superseded decisions remain in the older spec files and in git history. The live log stays under ~50 entries.
- **Split trigger:** if a spec would exceed ~1,000 lines, it splits into module files under `docs/specs/modules/` (e.g. `library.md`, `search.md`), registered in this index as the authoritative set.

## Registration

Every new **parent** spec file and every status flip updates this registry in the same commit; feature specs are registered in their parent's feature index, not as registry rows.

## Documentation layers

`docs/released/features/` is the end-user guide — plain language only, no requirement IDs or technical terms; pages are drafted when a capability enters an APPROVED feature-release spec, marked Draft. `docs/released/technical-specs/` is the developer reference **for released features only** — a document is created at the Ship commit that first ships the feature, migrated from the design sections of the spec that shipped it, and updated in later Ship commits. The technical design of in-development features lives in the current spec's feature specs ("Technical design" sections) — never in `docs/released/`. Neither released-layer directory may claim unreleased behavior as shipped.

## Related documents

| Document | Role |
|---|---|
| `AGENTS.md` (repo root) | Process rules and workflow stages |
| `RULES.md` (repo root) | Strict coding rules, binding from implementation approval |
| `docs/released/features/` | End-user guide (plain language; updated every release) |
| `docs/released/technical-specs/` | Developer reference per feature — released features only (created at Ship, updated every later release) |
