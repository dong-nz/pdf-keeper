# App window — technical reference

**Since v0.0.2** · Requirements: UI-07 (ADDED), UI-11 (ADDED), UI-12 (ADDED) · User guide: [features/the-app-window.md](../features/the-app-window.md) · Spec: [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §3.1, §3.8, §3.9 — decisions DR-73, DR-79, DR-87, DR-88 (corrected by DR-90), DR-89

The OS title bar is removed and the app draws its own window controls, its own about surface, and its own scrollbar styling. No product logic is involved: this feature is window configuration, three frontend components, one thin command, and one stylesheet rule set.

## Window configuration (`src-tauri/tauri.conf.json`)

- `app.windows[0]`: `title: "PDF Keeper"`, `width: 1280`, `height: 800`, `minWidth: 900`, `minHeight: 600`, **`decorations: false`** — the frameless window the toolbar's controls replace.
- `app.security.csp` unchanged from v0.0.1 (DR-44): `default-src 'self'; img-src 'self' asset: http://asset.localhost; style-src 'self' 'unsafe-inline'`. Because `connect-src` falls back to `'self'`, Tauri's `ipc://localhost` custom-protocol fetch is blocked and every command travels over the documented fallback transport — a JSON message through `window.chrome.webview.postMessage` (measured at the command boundary, DR-89). The app behaves identically; the smoke harness observes the same boundary the app uses.
- Version identity: `productName: "PDF Keeper"`, `version: "0.0.2"` — the single source the About dialog reads. `src-tauri/Cargo.toml` and `ui/package.json` carry the same 0.0.2 so no build artifact reports a different release than the packaged app.

## Capabilities (`src-tauri/capabilities/default.json`)

`core:default`, `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `dialog:allow-open`, `dialog:allow-confirm`, `opener:allow-open-path` — unchanged in v0.0.2 except the three window action commands added for UI-07. The three action permissions are what the app's own buttons call. `core:default` additionally pulls in `core:window:default`, whose list includes the read-only commands (`allow-is-maximized`, `allow-is-decorated`, `allow-is-minimized`, …) — recorded in DR-90 after an earlier entry here claimed otherwise; the app uses exactly one of them (see below) and no read permission was added by hand.

## Window controls (UI-07)

- `components/WindowControls.svelte` — three buttons at the toolbar's right end, 44px wide, full toolbar height, `aria-label` + native `title` for Minimize / Maximize-or-Restore / Close; the close button takes the danger hover treatment. `getCurrentWindow()` from `@tauri-apps/api/window`; the buttons call `minimize()`, `toggleMaximize()`, `close()` and nothing else.
- The Maximize button mirrors the window: `win.isMaximized()` is read once on mount and again on every `onResized`, and the result drives `data-maximized`, the glyph (`maximize` / `restore`) and the label. A failed read leaves the last known glyph — the control never changes state on an error, and no error is shown for a preference the user did not ask about.
- Dragging: `Toolbar.svelte`'s root carries `data-tauri-drag-region`; controls, inputs and menus are ordinary elements inside it, so they take clicks as usual and the empty strip moves the window.
- Keyboard: the buttons are plain focusable buttons in the toolbar's tab order (`flowKeyboardAudit` asserts every toolbar control is tabbable). No new shortcut was added; the OS-level paths are untouched.

## App menu and About (UI-12)

- `components/AppMenu.svelte` — a `bits-ui` DropdownMenu trigger (icon button, accessible label "Application menu") immediately left of the window controls, with exactly one item, *About PDF Keeper…*. It owns the dialog as a component (DR-63's mount rule), never a bare `<Modal>` in an `{#if}`.
- `components/AboutDialog.svelte` — the shared `Modal` (420px, focus-trapped, Esc and close button), showing two definition rows: the application name and the version.
- `app_about(app: AppHandle) -> AboutDto { name, version }` (`src-tauri/src/commands.rs`) — a thin wrapper over `app.package_info()`, no service module needed because there is no product logic to test. The frontend contains no version string: the value the dialog displays is the value the packaged application reports, which is what `flowAbout` compares.

## Scrollbars (UI-11)

- `lib/design-tokens.css`: `--scrollbar-thumb` / `--scrollbar-track` in both ramps (light `#c9cfd8`, dark `#3b424e`, track transparent — the ramps' `--border-strong` values).
- `lib/base.css`, one rule set and nothing else: `html { color-scheme: light dark; scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track) }` and `* { scrollbar-width: thin }`. **`scrollbar-color` is inherited; `scrollbar-width` is not** — measured in the running app, which is why the width is declared for every element (DR-87; the draft's single-`html` spelling left every container but the root drawing the 15px platform bar). Older-WebKit fallback in the same block: `::-webkit-scrollbar` / `-track` / `-thumb` with the same tokens; engines that support the standard properties ignore the pseudo-elements.
- Consequence, measured: every surface that scrolls reserves a 10px gutter instead of 15px, so `containerWidth` grows 5px; `virtual.ts` measures `clientWidth` (already scrollbar-excluded) and AC-10's Auto computation re-measured unchanged (5 columns at a 1280px window). No `scrollbar-gutter` reservation (DR-73).
- Excluded deliberately: thumb hover/recolor-on-scroll — it would need per-surface `:hover` rules, which is the per-component styling UI-11 forbids (R1.6).

## Invariants

- The app's own window actions are exactly minimize / toggle-maximize / close; no capability was widened for verification (R1.5, DR-88/DR-90).
- The version shown in the About dialog is the packaged version; no version string exists anywhere in `ui/`, so the two can never disagree.
- Exactly one place in the codebase defines scrollbar appearance; no component sets `scrollbar-color`, `scrollbar-width` or the WebKit pseudo-elements.
- `color-scheme: light dark` is declared once on `html`, so UA-drawn chrome follows the OS theme instead of staying light.

## Test mapping

| Layer | Coverage |
|---|---|
| `scripts/ui-smoke.mjs` `flowWindowChrome` | the three controls exist inside the toolbar with their labels and are tabbable; the strip carries `data-tauri-drag-region`; framelessness measured as the outer/page geometry gap (1281×801 vs 1280×801); Maximize maximizes **and** the control becomes Restore (`[data-maximized]`, measured 1281×801 → 2195×1187); Restore returns to the original shape; Close ends the session and the app relaunches against the same library; Minimize observed through the `is_minimized` probe, followed by a restart (no un-minimize control exists) |
| `scripts/ui-smoke.mjs` `flowAbout` | Tab from the toolbar reaches the app menu, Enter opens it, it contains exactly one item starting "About PDF Keeper", ArrowDown + Enter selects it, the dialog opens through the shared modal wrapper with focus moved inside, Esc closes it, and the displayed name/version equal the `app_about` response captured at the command boundary |
| `scripts/ui-smoke.mjs` `flowScrollbars` | computed `color-scheme` is `light dark`; the active ramp's thumb token resolves and both ramps are present in the loaded stylesheet; every surface that actually scrolls reserves the same gutter and reports the token color; only the shared rules declare scrollbars (a component override fails the run) |
| `scripts/ui-smoke.mjs` `flowKeyboardAudit` | every toolbar control, menu item and dialog is reachable and operable by keyboard |
| `src-tauri/src/commands.rs` | `app_about` is a field copy of `package_info()`; verified at the boundary rather than by a unit test, because there is no logic to isolate |

## Change history

- 2026-11-04 (v0.0.2) — First shipped. Migrated from SPEC-v0.0.2.md §3.1 / §3.8 / §3.9, corrected to the verified code. Two design corrections are recorded in the spec: §3.8's claim that `scrollbar-width` is inherited was false and the rule set was corrected (DR-87), and DR-88's reason for verifying the window by geometry was corrected by DR-90 — the read-only window commands were always available through `core:default`; the app uses `isMaximized()` for the Restore glyph and the flow uses `is_minimized` for the minimize check, while framelessness stays a geometry measurement. The observed IPC fallback transport is recorded here per DR-89; the CSP is unchanged. `tauri.conf.json`, `Cargo.toml` and `ui/package.json` all carry 0.0.2 so the packaged app and its build artifacts report the same version.
