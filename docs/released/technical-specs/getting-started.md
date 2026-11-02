# App shell, data layout, platform integration — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md §4 NFR-03/04/05, §5 UI-01; stack per DR-14/DR-17). Not implemented.

## Architecture

- **Shell:** Tauri v2. Rust backend `tauri/` exposes typed commands (`library_…`, `categories_…`, `app_…` per RULES R7.2); Svelte frontend in `ui/` calls them through a thin typed `api.ts` wrapper. No HTTP layer, no side servers.
- **Error boundary:** backend functions return `AppError` (RULES R1.2); commands map it to a typed error payload consumed by the UI for toasts. No panics crossing the command boundary.

## Data layout (RULES R8.4)

- SQLite database and cover cache live in the OS per-user data directory (Tauri path API): `%APPDATA%` (Windows), `~/Library/Application Support` (macOS), `$XDG_DATA_HOME` (Linux). NEVER in the repo or next to the executable.
- No network code paths at all: no accounts, telemetry, auto-updater (NFR-03).

## Startup sequence

1. Open DB, run migrations (additive only on 0.x — see RULES R4).
2. Kick off async startup rescan (missing-file check, FR-12) — never blocks first paint (NFR-07).
3. Load window state (view mode, sort, last sidebar selection) from persisted app settings.

## i18n & theme (NFR-05)

- All UI strings externalized from day one: `ui/src/i18n/` message catalogs, English shipped; components never hardcode literals.
- Light/dark theme follows the system (CSS `prefers-color-scheme` + Tauri theme API).

## Packaging (NFR-04, RULES R8.1)

Tauri bundler: Windows NSIS + MSI, macOS DMG, Linux AppImage + .deb; CI builds all three on native runners (AC-07).

## Change history
- v0.0.1 (planned): introduced.
