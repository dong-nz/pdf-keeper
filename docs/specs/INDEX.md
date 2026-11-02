# Specs Index

Status registry for the specification system. **Start here.** Specs are managed **per release version**: every release has one spec file describing completely what that release implements. This index tracks each spec's lifecycle status.

## Spec registry

| Spec file | Release | Status | Brief |
|---|---|---|---|
| `docs/specs/SPEC-v1.0.0.md` | v1.0.0 | **APPROVED — awaiting build go** | PDF Manager v1 requirements: reference-in-place PDF library, many-to-many categories, metadata search (no full-text), favorites, cover thumbnails, external viewer, missing-file relink; Tauri + Rust + Svelte stack; performance budgets; acceptance criteria AC-01…AC-07. |

Statuses: **PROPOSED** (drafted, not approved) → **APPROVED** (agreed, awaiting build go) → **ON-GOING** (being built) → **RELEASED** (implemented, verified, frozen) · **REJECTED** (abandoned, with reason) · **SUPERSEDED** (replaced by a later release spec).

**Semantic versioning (DR-28).** The spec version IS the release version: `MAJOR.MINOR.PATCH`.
- **MAJOR** — incompatible product change (re-scope, removed capability, data-model migration).
- **MINOR** — new or changed requirements, backward-compatible with released data.
- **PATCH** — bug fixes only. **No spec file**: the newest feature spec stays authoritative; the patch is a registry row, a Decision Log entry in that spec, and regression tests.
Feature-release specs are always `.0` (`SPEC-v1.1.0.md`, …), created when that release is first drafted and keeping its number through its lifecycle. Pre-approval discussion edits the same file — draft history is the Decision Log and git, never new version numbers. Bumps are proposed by agents with justification, set only by the user.

## Lifecycle

1. **Draft** — a new feature-release spec `SPEC-vX.Y.0.md` is created as a complete document: the previous released spec carried forward, plus the planned changes marked **ADDED / MODIFIED (old text quoted) / REMOVED**. Review happens on the diff: `git diff docs/specs/SPEC-v<prev>.0.md docs/specs/SPEC-vX.Y.0.md`. Status PROPOSED.
2. **Approve** — user approval flips status to APPROVED; the explicit "implement" go opens the build gate (ON-GOING).
3. **Build** — code is built against that spec file; implementation-time decisions append to its Decision Log (RULES R9.1). The requirement text is not rewritten mid-build.
4. **Release** — after verification (AGENTS workflow 4), the spec file is frozen: status → RELEASED, never edited again. The Ship commit also flips matching `docs/features/` guide pages to Shipped. Patch releases (`.1`, `.2`, …) skip steps 1–2: they fix bugs against the newest RELEASED spec and are recorded in its Decision Log and this registry.
5. Next feature release starts at step 1 from the newest RELEASED spec. Abandoned drafts become REJECTED (kept for history) and produce no release.

## Spec size discipline

- **Read selectively:** requirement groups are located via this index and stable IDs; agents read cited sections, not whole specs. During ON-GOING work the spec file *is* the working document — only its cited sections are read.
- **Decision-log cap:** a new release spec carries forward only decisions that still affect current behavior; superseded decisions remain in the older spec files and in git history. The live log stays under ~50 entries.
- **Split trigger:** if a spec would exceed ~1,000 lines, it splits into module files under `docs/specs/modules/` (e.g. `library.md`, `search.md`), registered in this index as the authoritative set.

## Registration

Every new spec file and every status flip updates this registry in the same commit.

## User guide

`docs/features/` documents the application for end users — one page per capability. Pages are drafted from approved spec text (status Draft) and flipped to Shipped only in the Ship commit with verified behavior. The guide never claims unshipped behavior.

## Related documents

| Document | Role |
|---|---|
| `AGENTS.md` (repo root) | Process rules and workflow stages |
| `RULES.md` (repo root) | Strict coding rules, binding from implementation approval |
| `docs/features/` | User guide (Draft from approved spec → Shipped at release) |
