# Settings & appearance — technical reference

**Since v0.0.3** (the About dialog since v0.0.2) · Requirements: UI-13 (ADDED in v0.0.3), UI-17 (ADDED in v0.0.3), UI-12 (ADDED in v0.0.2), UI-08 (Settings dialog as a second entry point, v0.0.3), UI-15 (Library section, v0.0.3) · User guide: [features/settings-and-appearance.md](../features/settings-and-appearance.md) · Specs: [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §3.8 (UI-12); [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §3.6 (UI-13), §3.8 (UI-17), §3.10 (Settings dialog) — decisions DR-79, DR-101, DR-102, DR-102b

## Stored settings (`src-tauri/src/library/`)

`SettingsDto` (`library/mod.rs`): `view`, `sort`, `dir`, `sort_secondary`, `grid_columns`, `theme`, `last_filter` — all strings, defaults applied on read. `theme` was added in v0.0.3; the other keys are the v0.0.2 grammar unchanged (categories.md, sorting-and-views.md).

- `set_setting` rejects an unknown key (`Unknown setting: …`) and a value outside that key's grammar (`Invalid value for …`) — `Validation` errors, never a silent write. `theme` accepts exactly `"system" | "light" | "dark"` (`is_valid_theme`).
- A **stored** value that fails validation is discarded on read and the default applies: `get_settings` filters `theme` through `is_valid_theme` and falls back to `"system"`, so a corrupt row is never a theme and never an error the user can see. `grid_columns` keeps its own grammar (`"auto"` or an integer 2–10).
- Commands are thin wrappers (R1.2): `app_get_settings() -> SettingsDto`, `app_set_setting(key, value)`, `app_about() -> AboutDto { name, version }` read from `app.package_info()` — the version is never a string written in the frontend. Whitelisted in `ui/src/api.ts` alongside the rest (`app_get_settings`, `app_set_setting`, `app_about`).
- Writes reach the store through the **batched flush** introduced in v0.0.2 (sorting-and-views.md): `lib/state/settings.svelte.ts` collects changed keys in `#pending`, one debounced `#flush` writes each key once with its last value, `flushNow()` forces it. A theme change and a view change made together therefore land as separate per-key writes, not one interleaved value.

## Color ramp (`ui/src/lib/theme.ts`, `ui/src/lib/design-tokens.css`)

- The stored setting is a **choice**; the document root carries a **concrete** ramp. `applyTheme(choice)` resolves it — `"system"` → `matchMedia("(prefers-color-scheme: dark)")`, otherwise the explicit value — and writes `document.documentElement.dataset.theme`. That is why `design-tokens.css` needs exactly two blocks (the light default and `[data-theme="dark"]`) instead of duplicating the dark palette for the OS case and the override case (DR-101).
- `main.ts` calls `applyTheme("system")` synchronously before mount, so the first paint follows the OS with no stored value and no flash; `App.svelte` re-applies the stored choice once settings load.
- `onSystemThemeChange(handler)` keeps live OS following while the choice is `"system"` — the behavior a plain `prefers-color-scheme` media block gave for free — and returns the detach function so the listener is removed with the component.
- Each ramp block declares `color-scheme: light` / `color-scheme: dark`, so the parts the OS draws (scrollbars, form fields, native scroll areas) follow the chosen ramp rather than the computer's setting — the custom scrollbar chrome itself is already token-colored (UI-11, the-app-window.md).

## Entry points

Three controls reach the same settings store; none holds state of its own (R1.6):

- **`components/SettingsMenu.svelte`** (UI-13) — the toolbar control at the right end, left of the window buttons. Items in order: the theme submenu, whose trigger shows the currently chosen theme (icon + label, `data-active` on the matching item — DR-102b) and offers System / Light / Dark; **Settings…** (mounts the dialog); **About PDF Keeper…**. The theme list and its icons (`monitor`, `sun`, `moon`) are local to the menu; `current` is derived from the store, so the trigger cannot disagree with the setting.
- **`components/SettingsDialog.svelte`** (UI-08/UI-15) — a second entry point to the same state, not a copy of it. Appearance section: theme radiogroup, list/grid radiogroup, and the columns control (Auto plus the `-`/count/`+` row) — the same `settings.setTheme` / `setView` / `setGridColumns` calls the View menu makes, and the same derived effective column count from `lib/state/layout.svelte.ts`, so a change made in either place is live in the other without a reload (AC-29). Library section: `library.counts.total / favorites / missing` (the `status_updated` payload, status-feedback.md) and the name/version from `app_about`. Mounted through the shared `Modal` open-binding (DR-63), focus-trapped, closes with Esc or its close button.
- **`components/AboutDialog.svelte`** (UI-12, since v0.0.2) — name and version from `app_about`, nothing else; the same `Modal` pattern.

## Not in this release

No language setting (the app is English-only; the catalog in `ui/src/lib/i18n/` is not user-selectable). The Library section shows counts, the name and the version — not the index location, not the cover cache location, no "open folder" action. The Select-mode flag is deliberately absent (selecting-documents.md): it is session state and has no settings key.

## Invariants

- The theme choice persists; the resolved ramp is derived, never stored. `system` is both the default and the way to hand the decision back to the OS.
- One settings store, several controls. Any control that shows a setting reads it from the store and writes through the store's methods — no component keeps a local copy, no control can display a value the backend would reject (the frontend's option lists are the same whitelists the backend validates).
- An invalid stored value never reaches the UI as an error and never becomes a setting.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/service.rs` tests | `theme_defaults_to_system_and_accepts_only_the_three_states` — default is `system`, the three values round-trip, every other value is rejected by `set_setting`, and a row written directly as `"midnight"` reads back as `system` (AC-28's storage half); `settings_carry_secondary_sort_and_grid_override` (the rest of the grammar, v0.0.2) |
| `ui/src/lib/state/settings.test.ts` | every key a query change modifies is written; a burst coalesces to one write per key holding the last value; a view change and a column override stay together (v0.0.2, AC-09) |
| `scripts/ui-smoke.mjs` · `flowThemeAndSettings` | AC-28: choosing Light switches the whole window to the light ramp immediately; the theme submenu shows the chosen theme as its checked item; Dark switches it back; the chosen ramp is applied again **after a restart**; System follows the operating system. AC-29: Settings… opens the dialog with its two sections; the dialog is focus-trapped; the Library section shows the same counts the Browse menu shows and the same version About shows; a view change made in the dialog is live in the View menu and on screen without a reload, and the reverse; Esc closes the dialog |
| `scripts/ui-smoke.mjs` · `flowAbout` | the About dialog shows the packaged name and version from `app_about` (UI-12, v0.0.2) |

## Change history

- 2026-11-04 (v0.0.2 — UI-12 ADDED, DR-79) — First shipped as the About dialog: name and version read from `app.package_info()` through `app_about`, mounted through the shared `Modal` open-binding. No settings change.
- 2026-11-04 (v0.0.3 — UI-13, UI-17 ADDED; Settings dialog as a second entry point; DR-101, DR-102, DR-102b) — **The theme became a stored setting** (`theme` in the grammar, validated to `system | light | dark`, corrupt rows falling back to `system`) and **the ramp became a resolution of it**: the choice is stored, `data-theme` carries the concrete value, the stylesheet keeps two blocks, and `color-scheme` on each block carries the choice to the parts the OS draws. The Settings menu and the Settings dialog are new controls over the **same** store the View menu already used — verified by asserting both directions of a view change in the running app rather than by trusting the shared store. The batched settings flush, the `grid_columns` grammar and the About dialog are unchanged.
