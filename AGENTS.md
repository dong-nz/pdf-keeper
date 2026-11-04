# AGENTS.md — Process rules for this repository

Binds any AI agent working on **PDF Keeper** (a cross-platform desktop app for managing a PDF library — see the current spec for the full definition).

**Orientation in one line:** the current spec says WHAT to build, `RULES.md` says HOW code must be written, this file says WHAT YOU MAY DO NOW. Check the actual repo state before acting; if it contradicts what you were told, stop and report instead of resolving it silently.

## Project map

| Path | Role |
|---|---|
| `docs/specs/INDEX.md` | **Read first.** Status registry: every release spec with lifecycle status (PROPOSED / APPROVED / ON-GOING / RELEASED / REJECTED / SUPERSEDED) |
| `docs/specs/SPEC-v*.md` | One complete spec per release version (parent) + linked feature specs `SPEC-v<VERSION>-<slug>.md` — requirements, acceptance criteria, **and the technical design of the in-development release** (feature specs' "Technical design" sections; parent §5.1/§5.2); the ON-GOING/APPROVED parent is the working document |
| `docs/release/features/` | **User guide** (end users, plain language, no technical content): one page per capability; updated by every release |
|`docs/release/technical-specs/`|**Developer reference for released features only**: created at the Ship commit that first ships a feature (migrated from the spec's design sections); updated by every later release|
|`docs/release/notes/`|**Release notes**: one page per shipped version — what changed for the user, what is not there yet, known issues; written at the Ship commit, never edited afterwards|
| `RULES.md` | Strict coding rules (binding from implementation approval) |
| `AGENTS.md` | Process rules (this file) |

## Development workflow

1. **Requirements / release drafting** — discuss with the user; record decisions in the current spec (Decision Log + status flips) the same turn. No code in this stage. A new feature release starts as a complete `SPEC-v<version>.md` draft (previous released spec + marked ADDED/MODIFIED/REMOVED changes), status PROPOSED; feature-level detail may live in linked feature specs (parent's feature index, spec §0). Version bumps follow semantic versioning on the 0.x unstable line (spec §0): agent proposes the bump, user sets it; 1.0.0 is declared by the user only.
2. **Approval gate** — build only when: all `OQ-` in the current spec are CLOSED, the spec status is APPROVED, and the user explicitly said to implement. Never inferred.
3. **Implementation** — strictly per `RULES.md` and the current spec's Technical design sections (feature specs; parent §5.1/§5.2), in order: Rust core (`db` → library service → `pdfmeta` → covers) with `cargo test`; then Tauri commands; then Svelte UI. Each requirement ships together with the test for its acceptance criterion (defined in the owning feature spec; index in parent §9). If implementation must deviate from a spec's Technical design, the deviation follows Rule 7 (raise, recommend, decide, record) before the code is written. **Build ledger:** every release spec carries a `## Build ledger` section **from drafting** (all rows `⬜`) — one row per requirement ID and AC in the release, with build stage (Rust core → Tauri commands → UI), status (`⬜` not started / `🔨` in progress / `✅` implemented and verified), commit ref and test ref. The agent maintains it as a factual record while building (this is not a status decision under Rule 4) and updates it whenever work lands. Released specs are never edited (the one-time 2026-11-03 v0.0.1 ledger retrofit DR-71 and the same-day path-name retrofit DR-76 are the only exceptions).
4. **Verification** — `cargo test` + clippy clean + UI smoke script + launch the real app and observe the changed flows (RULES R6). Tests alone are never proof.
5. **Ship** — one commit that: freezes the release spec (status → RELEASED in `docs/specs/INDEX.md`; the file — including its Build ledger — is never edited again), flips the matching `docs/release/features/` pages to *Shipped* with verified behavior and real limitations, **creates or updates the matching `docs/release/technical-specs/` documents by migrating the design from the shipped spec's Technical design sections** (first-time feature: new document marked "Since vX.Y.Z", corrected to the verified code as released; existing feature: change-history entry + design updated to match the code as released), and marks any prior spec it superseded as SUPERSEDED, **and writes `docs/release/notes/v<version>.md`** — plain-language release notes (what changed for the user, what is not in this version, known issues), never edited afterwards.

## 1. Workflow rules (non-negotiable)

1. **Entry point: `docs/specs/INDEX.md`.** Requirements live in the current release spec, never in chat history. New parent specs are registered in the INDEX in the same change that creates them; feature specs are registered in their parent's feature index.
2. **No implementation until the current spec's registry status is APPROVED *and* the user explicitly said to implement.** The registry (`docs/specs/INDEX.md`) is the single authority for release lifecycle; a spec header's own status line is descriptive only. "Implementation" = source code (`src-tauri/`, `ui/`), dependencies (`Cargo.toml`/`package.json` deps, lockfiles, `node_modules`), build configs, product scripts. Documentation is always allowed.
3. **Implementation starts only when:** every `OQ-` closed, registry status APPROVED, and the user explicitly said "implement". All three.
4. **Status markers are user-owned.** Only the user flips PROPOSED/OPEN → AGREED. Agents label their own proposals PROPOSED. Registry flips are records, not decisions: the agent may write APPROVED only after the user's explicit approval, ON-GOING only after the user's "implement", RELEASED only after stage-4 verification passed — and nothing else, ever.
5. **IDs are stable.** `FR-`, `NFR-`, `UI-`, `DR-`, `OQ-`, `AC-` are never renumbered or reused. A MODIFIED requirement in a draft release spec quotes its old text.
6. **Stop means stop.** On "stop implementing", halt immediately and report the exact on-disk state.
7. **Questions before assumptions.** Material forks → present options with trade-offs; never pick silently. Whenever the agent sees a better option than the one agreed or planned — during requirements or while implementing — it MUST raise it, name its recommendation and why, and wait for the user's decision before proceeding.
8. **History lives in the Decision Log.** Spec decision records are append-only; spec versions equal release versions (no draft version numbers). `AGENTS.md` and `RULES.md` are edited in place — any change to them gets a dated Decision Log entry in the current spec.

## 2. Repository state rules

- **Current stage: v0.0.3 requirements drafting** (corrected 2026-11-04 by DR-97 — the previous text still described the pre-implementation state of 2026-11-03). `docs/specs/SPEC-v0.0.1.md` (v0.0.1) and `docs/specs/SPEC-v0.0.2.md` (v0.0.2) are **RELEASED** and frozen; the implementation exists and is verified (`src-tauri/`, `ui/`, dependencies, `scripts/`). `docs/specs/SPEC-v0.0.3.md` is the working document (registry status PROPOSED). `docs/specs/INDEX.md` is the authority for every lifecycle state; this bullet is descriptive.
- The repository uses **git**. **The agent NEVER runs `git commit` or `git push` without the user's explicit approval for that operation** (DR-41). It prepares changes in the working tree, proposes the commit message (imperative, referencing DR/requirement IDs — RULES R9.2), and commits only after the user says to commit. The standing "commit whenever you finish a change" grant was **revoked by the user on 2026-11-03 (DR-72)** — every commit now needs its own explicit approval. Documentation changes are committed at each stage boundary (spec edit, registry status flip, guide page change) once approved. RELEASED spec files are never edited (the only exceptions, both one-time and both 2026-11-03: the Build-ledger retrofit of the v0.0.1 spec set DR-71, and the `docs/released/` → `docs/release/` path-name retrofit of the same set DR-76); release-to-release diffs use `git diff docs/specs/SPEC-v<prev>.md docs/specs/SPEC-v<new>.md`.
- Non-implementation stages: repo contains only `AGENTS.md`, `RULES.md`, and `docs/` (`docs/specs/` with INDEX + release specs; `docs/release/features/` user guide; `docs/release/technical-specs/` developer reference; `docs/release/notes/` release notes; other docs as needed). No `src-tauri/`, `ui/`, no dependencies.
- Any new dependency requires a user-approved Decision Log entry first.
- Toolchain: rustup + MSVC build tools are installed by the assistant via winget at implementation start (approved by DR-14).

## 2a. Documentation rules (`docs/release/features/` + `docs/release/technical-specs/` + `docs/release/notes/`)

**User guide (`docs/release/features/`)** — for end users only:
- Plain language: no requirement IDs, no technology names, no internal settings. One page per user-facing capability, named after the user's task (`importing-pdfs.md`, not `fr-10.md`).
- A page is created when its capability enters an APPROVED feature-release spec — behavior comes from spec text only, status marker 📝 Draft. No invented UI, no unapproved behavior.
- A page flips to ✅ Shipped only in the Ship commit, after verification (stage 4), describing real tested behavior plus actual limitations. Shipped pages are corrected via added "Amendment" notes, never rewritten.
- Every release updates the guide: new capability → new page; changed behavior → corrected text; removed capability → page stays, marked `REMOVED in v…`.

**Technical reference (`docs/release/technical-specs/`)** — for developers, **released features only**:
- One document per feature, same slug as its user-guide page: requirement IDs, design (modules, commands, schema), invariants, test mapping, and a dated **Change history** section.
- Created only in a Ship commit: content migrated from the shipped release spec's Technical design sections (cross-cutting features: parent §5.1/§5.2), corrected to the verified code as released, marked "Since vX.Y.Z". No technical documents exist for unreleased features — the development-time design lives in the current spec's feature specs. Specs never link into `docs/release/technical-specs/`.
- Updated in every later Ship commit that touches the feature: change-history entry + design sections matching the code as released. Documents are never deleted; removed features keep a "Removed in v…" marker.

**Release notes (`docs/release/notes/`)** — one page per **shipped** version, `v<version>.md`:
- End-user language: what the release changed for the user, what it does not do yet, and its known issues. No requirement IDs, no technology names.
- Content comes only from what shipped: the release spec's change summary, the guide pages that release updated, and the verified limitations of the build. Nothing here describes unreleased behavior.
- Written in the Ship commit (stage 5). Patch releases get a page too — their content is the fixed bugs.
- Pages are never edited, deleted or merged after Ship; later corrections live in the guide (Amendment note) and the technical reference (change-history entry).

## 3. Engineering rules

All code rules live in **RULES.md**. On conflict about code, RULES.md wins; about process, this file wins; the user always wins.

## 4. Communication rules

- Report exact file/dependency state when pausing or resetting.
- Proposals are labeled as proposals with trade-offs; agreed items are cited by ID ("per FR-02").
- Never claim AGREED for something the current spec marks PROPOSED.
