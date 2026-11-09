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
|`docs/specs/SPEC-ALL-TESTS.md`|**Test inventory** (DR-160): every test case the repository implements, per layer — a living factual document, not a release spec; updated with the changes that add, rename or remove tests and verified against the tree at each Ship|
|`RULES.md`|Strict coding rules (binding from implementation approval)|
| `AGENTS.md` | Process rules (this file) |

## Development workflow

1. **Requirements / release drafting** — discuss with the user; record decisions in the current spec (Decision Log + status flips) the same turn. No code in this stage. A new feature release starts as a complete `SPEC-v<version>.md` draft (previous released spec + marked ADDED/MODIFIED/REMOVED changes), status PROPOSED; feature-level detail may live in linked feature specs (parent's feature index, spec §0). Version bumps follow semantic versioning on the 0.x unstable line (spec §0): agent proposes the bump, user sets it; 1.0.0 is declared by the user only.
2. **Approval gate** — build only when: all `OQ-` in the current spec are CLOSED, the spec status is APPROVED, and the user explicitly said to implement. Never inferred.
3. **Implementation** — strictly per `RULES.md` and the current spec's Technical design sections (feature specs; parent §5.1/§5.2), in order: Rust core (`db` → library service → `pdfmeta` → covers) with `cargo test`; then Tauri commands; then Svelte UI. Each requirement ships together with the test for its acceptance criterion (defined in the owning feature spec; index in parent §9). If implementation must deviate from a spec's Technical design, the deviation follows Rule 7 (raise, recommend, decide, record) before the code is written. **Build ledger:** every release spec carries a `## Build ledger` section **from drafting** (all rows `⬜`) — one row per requirement ID and AC in the release, with build stage (Rust core → Tauri commands → UI), status (`⬜` not started / `🔨` in progress / `✅` implemented and verified), commit ref and test ref. The agent maintains it as a factual record while building (this is not a status decision under Rule 4) and updates it whenever work lands. Released specs are never edited (the one-time 2026-11-03 v0.0.1 ledger retrofit DR-71 and the same-day path-name retrofit DR-76 are the only exceptions).
4. **Verification** — `cargo test` + clippy clean + `node scripts/ui-verify.mjs` full mode as the UI verification entry point (every UI test case runs as its own lane in barrier-separated phases; `--coarse` is the documented triage fallback; direct `ui-smoke.mjs`/`ui-10k.mjs` runs are debugging aids), plus launching the real app and observing the changed flows (RULES R6), and `docs/specs/SPEC-ALL-TESTS.md` checked against the tree (§2a). Tests alone are never proof. **For the v0.0.7 build only**, the user's rule of 2026-11-08 (DR-192) reorders stage 4 into two phases with a user checkpoint; the agent MUST follow the sequence as written (deviations need the user's approval): **Phase A** — implement per stage 3, write every AC's test, and run only the tests relevant to the release's features (the changed modules' Rust tests, the frontend unit tests the release's ACs name, the release's feature lanes as named sets per the v0.0.6 DR-141 pattern); then report per-feature status and hand the real-app check to the user. **Phase B** — the user checks the changed flows manually in the running app; reported defects return to Phase A for the affected feature. **Phase C** — after the user's confirmation, the full verification named above runs unchanged: complete `cargo test`, clippy with `-D warnings`, `ui-verify.mjs` full mode, the test inventory checked against the tree. The Ship commit (stage 5) requires a green Phase C — **waived for v0.0.7 by the user's decision of 2026-11-09 (DR-248): Phase C is not run for this release; the Ship gate is the green Phase A report plus the user's Phase B real-app confirmation.** Whether the sequence generalizes past v0.0.7 is decided after the experiment (DR-192).
5. **Ship** — one commit that: freezes the release spec (status → RELEASED in `docs/specs/INDEX.md`; the file — including its Build ledger — is never edited again), flips the matching `docs/release/features/` pages to *Shipped* with verified behavior and real limitations, **creates or updates the matching `docs/release/technical-specs/` documents by migrating the design from the shipped spec's Technical design sections** (first-time feature: new document marked "Since vX.Y.Z", corrected to the verified code as released; existing feature: change-history entry + design updated to match the code as released), and marks any prior spec it superseded as SUPERSEDED, **and writes `docs/release/notes/v<version>.md`** — plain-language release notes (what changed for the user, what is not in this version, known issues), never edited afterwards.

## 1. Workflow rules (non-negotiable)

1. **Entry point: `docs/specs/INDEX.md`.** Requirements live in the current release spec, never in chat history. New parent specs are registered in the INDEX in the same change that creates them; feature specs are registered in their parent's feature index.
2. **No implementation until the current spec's registry status is APPROVED *and* the user explicitly said to implement.** The registry (`docs/specs/INDEX.md`) is the single authority for release lifecycle; a spec header's own status line is descriptive only. "Implementation" = source code (`src-tauri/`, `ui/`), dependencies (`Cargo.toml`/`package.json` deps, lockfiles, `node_modules`), build configs, product scripts. Documentation is always allowed.
3. **Implementation starts only when:** every `OQ-` closed, registry status APPROVED, and the user explicitly said "implement". All three.
4. **Status markers are user-owned.** Only the user flips PROPOSED/OPEN → AGREED. Agents label their own proposals PROPOSED. Registry flips are records, not decisions: the agent may write APPROVED only after the user's explicit approval, ON-GOING only after the user's "implement", RELEASED only after stage-4 verification passed — and nothing else, ever.
5. **IDs are stable.** `FR-`, `NFR-`, `UI-`, `DR-`, `OQ-`, `AC-` are never renumbered or reused. A MODIFIED requirement in a draft release spec quotes its old text.
6. **Stop means stop.** On "stop implementing", halt immediately and report the exact on-disk state.
7. **Questions before assumptions.** Material forks → present options with trade-offs; never pick silently. Whenever the agent sees a better option than the one agreed or planned — during requirements or while implementing — it MUST raise it, name its recommendation and why, and wait for the user's decision before proceeding. **For the v0.0.7 build only**, the user's grant of 2026-11-08 (DR-193) replaces the wait step for that build: questions and decision forks arising during the implementation are decided by the agent — the chosen answer is the best option by the agent's professional expertise, the option it would recommend if asked — and recorded in the release spec's Decision Log before the code that depends on it. The user's override at any time, rule 4 status ownership, the approval gate and R9.3 are untouched.
8. **History lives in the Decision Log.** Spec decision records are append-only; spec versions equal release versions (no draft version numbers). `AGENTS.md` and `RULES.md` are edited in place — any change to them gets a dated Decision Log entry in the current spec.

## 2. Repository state rules

- **Current stage: v0.0.7 RELEASED (2026-11-09, DR-249)** (drafted 2026-11-07 by DR-176 with the user's scope additions, OQ closures and process rules DR-177–DR-193; approved by the user 2026-11-08 (DR-194), implemented the same day (DR-195) under the DR-192 sequence — Phase C waived for this release by the user's decision of 2026-11-09 (DR-248) — and the DR-193 authority; the Ship gate (green Phase A per the Build ledger + the user's Phase-B real-app confirmation across feedback batches 1–9) met with the user's "ship" of 2026-11-09; no full-suite pass ran before the freeze — the accepted risk is stated in the release notes' known issues). `docs/specs/SPEC-v0.0.1.md` ... `SPEC-v0.0.7.md` are **RELEASED** and frozen; the implementation exists and is verified (`src-tauri/`, `ui/`, dependencies, `scripts/`). No release spec is in draft or in build; the next release starts only on the user's direction. `docs/specs/INDEX.md` is the authority for every lifecycle state; this bullet is descriptive.
- The repository uses **git**. **The agent NEVER runs `git commit` or `git push` without the user's explicit approval for that operation** (DR-41). It prepares changes in the working tree, proposes the commit message (imperative, referencing DR/requirement IDs — RULES R9.2), and commits only after the user says to commit. The standing "commit whenever you finish a change" grant was **revoked by the user on 2026-11-03 (DR-72)** — every commit now needs its own explicit approval. Documentation changes are committed at each stage boundary (spec edit, registry status flip, guide page change) once approved. RELEASED spec files are never edited (the only exceptions, both one-time and both 2026-11-03: the Build-ledger retrofit of the v0.0.1 spec set DR-71, and the `docs/released/` → `docs/release/` path-name retrofit of the same set DR-76); release-to-release diffs use `git diff docs/specs/SPEC-v<prev>.md docs/specs/SPEC-v<new>.md`.
- Non-implementation stages: repo contains only `AGENTS.md`, `RULES.md`, and `docs/` (`docs/specs/` with INDEX + release specs; `docs/release/features/` user guide; `docs/release/technical-specs/` developer reference; `docs/release/notes/` release notes; other docs as needed). No `src-tauri/`, `ui/`, no dependencies.
- Any new dependency requires a user-approved Decision Log entry first.
- Toolchain: rustup + MSVC build tools are installed by the assistant via winget at implementation start (approved by DR-14).

## 2a. Documentation rules (`docs/release/features/` + `docs/release/technical-specs/` + `docs/release/notes/` + `docs/specs/SPEC-ALL-TESTS.md`)

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

**Test inventory (`docs/specs/SPEC-ALL-TESTS.md`)** — a living factual inventory, **not a requirements source** (DR-160):
- One row per test case as it exists in the tree: Rust `#[test]` names per module file, UI unit tests per file, every smoke-harness flow with its feature-area mapping and check list, the standalone 10 000-document import runner, and the support scripts the test layers depend on. Requirement IDs are listed only where the test source names them.
- Requirements and acceptance criteria stay in the release specs; the requirement→test authority remains the spec's AC index and Build ledger. The inventory is the reverse view: test → what it asserts.
- Updated **in the same change that lands the tests**: every feature and bugfix ships its tests (workflow 3, RULES R6) — its inventory rows are added, renamed or removed at the same time. Renamed or removed tests take their rows with them.
- Verified against the tree during stage 4 (the extraction is mechanical: `#[test]`, `it()/test()`, `check()/skip()` call sites) and the counts corrected at the Ship commit. Unlike release specs it is never frozen — it keeps living after Ship.

## 3. Engineering rules

All code rules live in **RULES.md**. On conflict about code, RULES.md wins; about process, this file wins; the user always wins.

## 4. Communication rules

- Report exact file/dependency state when pausing or resetting.
- Proposals are labeled as proposals with trade-offs; agreed items are cited by ID ("per FR-02").
- Never claim AGREED for something the current spec marks PROPOSED.
