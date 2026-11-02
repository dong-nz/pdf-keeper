# AGENTS.md — Process rules for this repository

Binds any AI agent working on **PDF Manager** (a cross-platform desktop app for managing a PDF library — see the current spec for the full definition).

**Orientation in one line:** the current spec says WHAT to build, `RULES.md` says HOW code must be written, this file says WHAT YOU MAY DO NOW. Check the actual repo state before acting; if it contradicts what you were told, stop and report instead of resolving it silently.

## Project map

| Path | Role |
|---|---|
| `docs/specs/INDEX.md` | **Read first.** Status registry: every release spec with lifecycle status (PROPOSED / APPROVED / ON-GOING / RELEASED / REJECTED / SUPERSEDED) |
| `docs/specs/SPEC-v*.md` | One complete spec per release version; the highest-status ON-GOING/APPROVED file is the working document |
| `docs/features/` | **User guide**: one page per user-facing capability. Drafted from the agreed spec; flipped to *Shipped* with verified behavior at ship time |
| `RULES.md` | Strict coding rules (binding from implementation approval) |
| `AGENTS.md` | Process rules (this file) |

## Development workflow

1. **Requirements / release drafting** — discuss with the user; record decisions in the current spec (Decision Log + status flips) the same turn. No code in this stage. A new release starts as a complete `SPEC-vX.Y.md` draft (previous released spec + marked ADDED/MODIFIED/REMOVED changes), status PROPOSED.
2. **Approval gate** — build only when: all `OQ-` in the current spec are CLOSED, the spec status is APPROVED, and the user explicitly said to implement. Never inferred.
3. **Implementation** — strictly per `RULES.md`, in order: Rust core (`db` → library service → `pdfmeta` → covers) with `cargo test`; then Tauri commands; then Svelte UI. Each requirement ships together with the test for its acceptance criterion (spec §9).
4. **Verification** — `cargo test` + clippy clean + UI smoke script + launch the real app and observe the changed flows (RULES R6). Tests alone are never proof.
5. **Ship** — one commit that: freezes the release spec (status → RELEASED in `docs/specs/INDEX.md`; the file is never edited again), flips the matching `docs/features/` pages to *Shipped* with verified behavior and real limitations, and marks any prior spec it superseded as SUPERSEDED.

## 1. Workflow rules (non-negotiable)

1. **Entry point: `docs/specs/INDEX.md`.** Requirements live in the current release spec, never in chat history. Every new spec file and every registry status flip happens in the same change that creates it.
2. **No implementation until the current spec is FINAL *and* explicitly approved by the user.** "Implementation" = source code (`src-tauri/`, `ui/`), dependencies (`Cargo.toml`/`package.json` deps, lockfiles, `node_modules`), build configs, product scripts. Documentation is always allowed.
3. **Implementation starts only when:** every `OQ-` closed, the spec's registry status is APPROVED (not PROPOSED), and the user explicitly said "implement". All three.
4. **Status markers are user-owned.** Only the user flips PROPOSED/OPEN → AGREED. Agents label their own proposals PROPOSED.
5. **IDs are stable.** `FR-`, `NFR-`, `UI-`, `DR-`, `OQ-`, `AC-` are never renumbered or reused. A MODIFIED requirement in a draft release spec quotes its old text.
6. **Stop means stop.** On "stop implementing", halt immediately and report the exact on-disk state.
7. **Questions before assumptions.** Material forks → present options with trade-offs; never pick silently.
8. **History lives in the spec.** The Decision Log and spec version history are append-only. `AGENTS.md` and `RULES.md` are edited in place — any change to them gets a dated Decision Log entry in the current spec.

## 2. Repository state rules

- **Current stage: requirements complete.** `docs/specs/SPEC-v0.7.md` is FINAL (registry status APPROVED); zero implementation; awaiting the user's build go.
- The repository uses **git**. Documentation changes are committed at each stage boundary (spec edit, registry status flip, guide page change) with imperative messages referencing DR/requirement IDs (RULES R9.2). RELEASED spec files are never edited; release-to-release diffs use `git diff docs/specs/SPEC-v<prev>.md docs/specs/SPEC-v<new>.md`.
- Non-implementation stages: repo contains only `AGENTS.md`, `RULES.md`, and `docs/` (`docs/specs/` with INDEX + release specs; `docs/features/` user guide; other docs as needed). No `src-tauri/`, `ui/`, no dependencies.
- Any new dependency requires a user-approved Decision Log entry first.
- Toolchain: rustup + MSVC build tools are installed by the assistant via winget at implementation start (approved by DR-14).

## 2a. User guide rules (`docs/features/`)

- `docs/features/README.md` is the guide home (page list + status legend); one page per user-facing capability, named after the user's task (`importing-pdfs.md`, not `fr-10.md`).
- A page is created when its capability enters an APPROVED release spec — content comes from spec text only, status marker 📝 Draft. No invented UI, no unapproved behavior.
- A page flips to ✅ Shipped only in the Ship commit, after verification (stage 4), describing real tested behavior plus actual limitations. Shipped pages are corrected via added "Amendment" notes, never rewritten.
- A capability removed from the product keeps its page, marked `REMOVED in v…`.

## 3. Engineering rules

All code rules live in **RULES.md**. On conflict about code, RULES.md wins; about process, this file wins; the user always wins.

## 4. Communication rules

- Report exact file/dependency state when pausing or resetting.
- Proposals are labeled as proposals with trade-offs; agreed items are cited by ID ("per FR-02").
- Never claim AGREED for something the current spec marks PROPOSED.
