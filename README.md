# PDF Keeper

A cross-platform desktop app for managing a PDF library. PDFs stay where they are — the app keeps a library index (SQLite) with metadata, categories, favorites, cover thumbnails and search; files are read in the app's own reader or opened with the OS viewer, never imported into a private store.

Current release: **v0.0.6** (see `docs/specs/INDEX.md` for the release registry; the product line is 0.x until the user declares 1.0.0).

## Features (shipped)

- Import PDFs by file or folder picker — files are referenced in place, never moved or copied
- Many-to-many categories, favorites, cover thumbnails, list and grid views
- Metadata search (title / author / notes / filename — no full-text), sorting, live counts
- Metadata extraction from PDF info dictionaries, editing with instant reindex
- Built-in PDF reader: a document opens in its own reading window with page navigation and zoom; opening with the OS application remains available from the context menu
- Light/dark appearance, the dark ramp authored to the Dracula palette
- Missing-file detection and relinking; delete from library or with the file
- Status bar, toasts with actions, keyboard shortcuts

User-facing documentation: [`docs/release/features/`](docs/release/features/).
Developer reference for shipped features: [`docs/release/technical-specs/`](docs/release/technical-specs/).
Release notes per version: [`docs/release/notes/`](docs/release/notes/).

## Stack

Tauri 2 + Rust core (`rusqlite` bundled SQLite + FTS5, `lopdf` metadata, `pdfium-render` covers, `image` PNG cache) · Svelte 5 + Vite frontend, headless `bits-ui` primitives styled with the project's own design tokens. Decisions: DR-12/14/17/44/45 in the current spec's Decision Log.

## Repository map

| Path | Role |
|---|---|
| `docs/specs/` | Release specs + status registry (`INDEX.md` is the entry point; specs are the requirements source of truth) |
| `docs/release/features/` | End-user guide, one page per capability |
| `docs/release/technical-specs/` | Developer reference for released features (design, commands, invariants, test mapping, change history) |
| `docs/release/notes/` | Release notes, one page per shipped version (plain language; written at Ship, never edited afterwards) |
| `src-tauri/` | Rust core: `db` → `library` (service + query) → `pdfmeta` → `covers`, Tauri commands in `commands.rs` |
| `ui/` | Svelte frontend: `src/lib/state/` stores, `src/components/` |
| `scripts/` | Project scripts: fixture generator, pdfium fetcher, UI verification runner (`ui-verify.mjs` + flow suites) |
| `RULES.md` / `AGENTS.md` | Coding rules / process rules — binding for any contributor |

## Build & run

Prerequisites: Rust toolchain (rustup; MSVC build tools on Windows), Node.js with pnpm, and the Pdfium dynamic library.

```sh
node scripts/fetch-pdfium.mjs      # downloads pdfium into src-tauri/binaries/ (cover rendering)
cd ui && pnpm install
pnpm run tauri:dev                 # dev app with hot reload (Vite dev server + tauri dev)
pnpm run tauri:build               # release build
```

Library data lives in the OS app-data directory of `com.pdfkeeper.app`: `library.db` plus the `covers/` thumbnail cache. Without `pdfium.*` in `src-tauri/binaries/` the app runs fully, just without cover thumbnails.

## Production builds by platform

`pnpm run tauri:build` (run from `ui/`) compiles in release mode and bundles installers for the platform it runs on, under `src-tauri/target/release/bundle/`. `scripts/fetch-pdfium.mjs` always downloads the Pdfium library of the current platform, and the bundle config (`resources: ["binaries/*pdfium*"]`) ships it in `binaries/` next to the executable — where the app binds it at startup. A packaged app without the library simply shows no cover thumbnails.

### Windows (x64)

- Prerequisites: rustup + Microsoft C++ Build Tools ("Desktop development with C++"), WebView2 runtime (preinstalled on Windows 10/11), and the VBSCRIPT optional feature for MSI builds; Node LTS + pnpm.
- Artifacts: `bundle/nsis/PDF Keeper_<ver>_x64-setup.exe` (NSIS) and `bundle/msi/PDF Keeper_<ver>_x64_en-US.msi`; the installer places `pdfkeeper.exe` with `binaries/pdfium.dll` beside it.
- This path is built and run-verified in this repository.

### Linux (x64)

- Prerequisites: rustup, Node LTS + pnpm, plus system packages — on Debian/Ubuntu: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Arch/Fedora/… variants in the [Tauri prerequisites docs](https://v2.tauri.app/start/prerequisites/)).
- Artifacts: `.deb` and `.AppImage`. Build on the same distro family you ship to (glibc compatibility); the AppImage is the portable artifact.
- `fetch-pdfium` downloads `libpdfium.so`.

### macOS (Apple Silicon / Intel)

- Prerequisites: rustup, Xcode Command Line Tools (`xcode-select --install`), Node LTS + pnpm.
- Artifacts: `.app` + `.dmg` for the host architecture; cross-compile with `pnpm run tauri:build --target aarch64-apple-darwin` (or `x86_64-apple-darwin`) — pnpm forwards flags to `tauri` directly; do not use `--` as a separator (it forwards the rest to cargo).
- `fetch-pdfium` downloads `libpdfium.dylib`. Unsigned builds run locally; Gatekeeper blocks downloaded unsigned copies — signing/notarization (and CI) are deliberately deferred to a later release (DR-48).

The Linux and macOS artifact paths are the documented Tauri behavior; only the Windows path is exercised on this machine.

## Tests & verification

```sh
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
cd ui && pnpm test && pnpm run check         # vitest + svelte-check
node scripts/ui-verify.mjs                   # full UI verification against the real built app
```

`ui-verify.mjs` is the UI verification entry point: it runs **every UI test case as its own lane** — each with its own app data directory and driver ports — in barrier-separated phases (build first; the timing-sensitive flows one at a time; the 10 000-document import measured while nothing else runs; the rest in parallel), with the combined run asserted against a 300 s budget. Exit 0 only if all lanes pass. Add `--report` to save a final summary (verdict, tallies, the per-lane table, failed check names) as `tmp/test-reports/verify-<timestamp>.md`, or `--report <path>` to choose the file.

Debugging aids when a lane fails: `SMOKE_FLOW=flowX node scripts/ui-smoke.mjs` reproduces a single flow standalone; `SMOKE_SET=<area>` runs one feature area; `node scripts/ui-10k.mjs` runs the 10 000-document suite alone; `node scripts/ui-verify.mjs --coarse` is the documented two-suite fallback. The full test inventory is `docs/specs/SPEC-ALL-TESTS.md`.

The UI harness drives the built app through WebDriver (`tauri-driver` + a version-matched `msedgedriver` on PATH); fixtures are generated on demand by `scripts/make-fixtures.mjs` (never committed). Verification policy: RULES R6 — unit tests plus a real-app verification run are both required before a release ships.

## Contributing

Read [`AGENTS.md`](AGENTS.md) first: the workflow is spec-driven — requirements live in `docs/specs/`, code follows [`RULES.md`](RULES.md), and implementation only starts from an APPROVED spec with an explicit user go.
