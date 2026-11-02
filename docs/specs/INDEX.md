# Specs Index

Dashboard of the specification system. **Start here.** The highest-version *Active* baseline is the source of truth for requirements; *Active changes* lists in-progress increments; `docs/FEATURES.md` shows what is actually implemented.

## Active baselines

| Spec file | Version | Status | Brief |
|---|---|---|---|
| `docs/specs/SPEC-v0.7.md` | 0.7 | **FINAL — awaiting implementation approval** | PDF Manager v1 requirements: reference-in-place PDF library, many-to-many categories, metadata search (no full-text), favorites, cover thumbnails, external viewer, missing-file relink; Tauri + Rust + Svelte stack; performance budgets; acceptance criteria AC-01…AC-07. |

## Active change proposals

| Folder | Target baseline | Status | Brief |
|---|---|---|---|
| — | — | — | None yet. Post-1.0 increments start here as `CHG-###-slug/`. |

## Archived

| Item | Superseded by | Note |
|---|---|---|
| — | — | None yet. |

## Conventions

**Baselines.** `docs/specs/SPEC-v<MAJOR.MINOR>.md`. A baseline is frozen forever; a new version is a new file, and the superseded file moves to `docs/specs/archive/` unchanged. New/changed requirements → MINOR bump; re-scope or breaking product decisions → MAJOR.

**Spec size discipline.**
- Read selectively: requirement groups are located via this index and stable IDs; agents read cited sections, not whole baselines. Increment work reads `delta.md`/`tasks.md` + cited sections only.
- Decision-log cap: a new baseline carries forward only decisions that still affect current behavior; superseded decisions remain in the archived baselines and git history. The live log stays under ~50 entries.
- Split trigger: if a baseline would exceed ~1,000 lines, it splits into module files under `docs/specs/modules/` (e.g. `library.md`, `search.md`), registered in this index as the authoritative set.

**Change proposals (incremental development).** Each increment gets `docs/specs/changes/CHG-<###>-<slug>/`:
- `proposal.md` — why, what, options, user decision
- `delta.md` — `ADDED` / `MODIFIED` (quoting old text) / `REMOVED` requirement IDs
- `tasks.md` — build checklist, each item mapped to requirement + acceptance criterion

Lifecycle: draft → approved (user) → in-build → **shipped** (delta merged into a new baseline; FEATURES.md updated; folder archived) or **rejected** (archived with reason). Status lives in this index.

**Registration.** Every new baseline, change folder, or archive move updates this index in the same commit.

**User guide.** `docs/features/` documents the application for end users — one page per capability. Pages are drafted from approved spec text (status Draft) and flipped to Shipped only in the Ship commit with verified behavior. The guide never claims unshipped behavior.

**Status vocabulary** is defined by the current spec §0 (AGREED / PROPOSED / OPEN / OUT-OF-SCOPE; document status DRAFT / FINAL).

## Related documents

| Document | Role |
|---|---|
| `AGENTS.md` (repo root) | Process rules and workflow stages |
| `RULES.md` (repo root) | Strict coding rules, binding from implementation approval |
| `docs/features/` | User guide (Draft from approved spec → Shipped at ship time) |
