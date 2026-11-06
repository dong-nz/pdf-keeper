#!/usr/bin/env node
// UI smoke script (SPEC-v0.0.1.md §5.3.12): drives the REAL built app
// (src-tauri/target/debug/pdfkeeper.exe) through tauri-driver (W3C WebDriver,
// proxied to msedgedriver on Windows). Assertions are made against the live
// DOM and the real command boundary; keyboard flows use real key events.
//
// Prerequisites (toolchain, not product dependencies): tauri-driver and a
// version-matched msedgedriver on PATH (see spec §5.3.12 + DR-54).
// Usage: node scripts/ui-smoke.mjs
//   SMOKE_SET=<area>[,<area>…]  run exactly the flows of the named feature
//   areas (the SPEC-v0.0.5 §3.2 mapping, carried verbatim in AREAS below):
//   getting-started, importing-pdfs, searching, browsing-and-filtering,
//   categories, favorites, opening-and-deleting, metadata-editing,
//   missing-files-relinking, covers, sorting-and-views, status-feedback,
//   selecting-documents, settings-and-appearance, the-app-window,
//   keyboard-shortcuts. Unknown area names error.
//   SMOKE_FLOW=flowCategories,flowDelete  run only these flows (narrows
//   SMOKE_SET when both are given; debugging aid). Unknown flow names error.
// Prefix rule (§3.2): a set that names a scale flow (flowImport10k,
// flowVirtualization, flowWidthMatrix) pays the 10 000-document import
// instead of the core one — except when it names flowImport10k itself: that
// flow IS the import, so it runs first with no prefix. The full run uses the
// core tier for the functional section and runs the scale section last.
// Exit code: 0 all checks pass, 1 any check fails (including the NFR-06
// wall-time budget, AC-58).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_EXE = join(root, "src-tauri", "target", "debug", "pdfkeeper.exe");
const DATA_DIR = join(process.env.APPDATA, "com.pdfkeeper.app");
const FIXTURE_DOCS = join(root, "fixtures", "docs");
const FIXTURE_CORE = join(root, "fixtures", "core"); // core tier (DR-135)
const FIXTURE_SPECIAL = join(root, "fixtures", "special");
const CORE_DOC_COUNT = 100; // core tier size, mirroring make-fixtures.mjs
const NFR06_BUDGET_MS = 300_000; // NFR-06 wall-time budget (AC-54/AC-58)
const CARGO_BIN = join(homedir(), ".cargo", "bin");
const DRIVER_PORT = 4444;
const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- checks

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  check(name, false, detail);
}
// A check the harness itself cannot drive (not an app failure): reported,
// never counted as a failure, never silently dropped.
function skip(name, detail) {
  results.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP  ${name} — ${detail}`);
}

// ---------------------------------------------------------------- setup

// The app under test must be the working tree: the harness drives the packaged
// debug binary, so it builds it first. `tauri build --debug` is required, not
// `cargo build`: only the Tauri CLI embeds the frontend into the debug binary
// (a plain cargo build leaves the window pointed at devUrl, and the app then
// shows a browser "can't reach this page" instead of the app). `--no-bundle`
// skips the installer step; `tauri build` runs the frontend build itself.
// D15 (AC-55): the binary is owned by the working tree — a build is only owed
// when an input is newer than it. When the check passes the run says so.
// A plain `cargo build`/`cargo test` (the Rust-core stage builds with them)
// also produces target/debug/pdfkeeper.exe — but without the embedded
// frontend, so that binary opens devUrl and the window shows "localhost
// refused to connect". A binary newer than the stamp the Tauri CLI build
// leaves next to it was therefore not built by the CLI: it is stale too.
const BUILD_STAMP = join(dirname(APP_EXE), ".tauri-build-stamp");
function binaryIsStale() {
  if (!existsSync(APP_EXE)) return true;
  if (!existsSync(BUILD_STAMP)) return true;
  const built = statSync(BUILD_STAMP).mtimeMs;
  if (statSync(APP_EXE).mtimeMs > built) return true; // relinked by cargo, not by tauri
  const inputs = [
    join(root, "src-tauri", "Cargo.toml"),
    join(root, "src-tauri", "Cargo.lock"),
    join(root, "src-tauri", "tauri.conf.json"),
    join(root, "ui", "index.html"),
    join(root, "ui", "package.json"),
    join(root, "ui", "pnpm-lock.yaml"),
  ];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== "target") walk(join(dir, entry.name));
      } else inputs.push(join(dir, entry.name));
    }
  };
  walk(join(root, "src-tauri"));
  walk(join(root, "ui", "src"));
  return inputs.some((f) => existsSync(f) && statSync(f).mtimeMs > built);
}

function buildApp() {
  if (!binaryIsStale()) {
    console.log("[BUILD] skipped — every build input is older than the binary (D15)");
    return;
  }
  const cli = join(root, "ui", "node_modules", ".bin", "tauri.cmd");
  if (!existsSync(cli)) throw new Error(`tauri CLI missing: ${cli}`);
  const app = spawnSync(process.env.ComSpec || "cmd.exe", ["/C", cli, "build", "--debug", "--no-bundle"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PATH: `${CARGO_BIN};${process.env.PATH}` },
  });
  if (app.status !== 0) throw new Error("the app build failed");
  writeFileSync(BUILD_STAMP, new Date().toISOString()); // marks the binary as CLI-built
}

function prepareEnvironment() {
  spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
  rmSync(DATA_DIR, { recursive: true, force: true }); // fresh library per run
  const docs = existsSync(FIXTURE_DOCS) ? readdirSync(FIXTURE_DOCS) : [];
  const core = existsSync(FIXTURE_CORE) ? readdirSync(FIXTURE_CORE) : [];
  if (docs.length < 10_000 || !core.includes("manifest.json") || core.filter((n) => n.endsWith(".pdf")).length < CORE_DOC_COUNT) {
    console.log("fixtures missing — running scripts/make-fixtures.mjs");
    const r = spawnSync(process.execPath, [join(root, "scripts", "make-fixtures.mjs")], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("make-fixtures failed");
  }
  buildApp();
  if (!existsSync(APP_EXE)) throw new Error(`app binary not built: ${APP_EXE}`);
}

function startDriver() {
  const env = { ...process.env, PATH: `${CARGO_BIN};${process.env.PATH}` };
  const driver = spawn(
    process.platform === "win32" ? join(CARGO_BIN, "tauri-driver.exe") : "tauri-driver",
    ["--port", String(DRIVER_PORT)],
    { stdio: ["ignore", "pipe", "pipe"], env },
  );
  driver.stderr.on("data", (d) => process.stderr.write(`[driver] ${d}`));
  return driver;
}

// ---------------------------------------------------------------- WebDriver

let sessionId = null;

// A W3C error body is `{ value: { error: <standard code>, message, stacktrace } }`.
// A script's own return value can legitimately carry an `error` key (the dialog
// probes return `{ value, error }`), so only a standard status code — together
// with the failed HTTP status — counts as a driver failure.
const DRIVER_ERRORS = [
  "element not selectable", "element not interactable", "invalid element state",
  "javascript error", "no such alert", "no such element", "no such frame",
  "detached shadow root", "stale element reference", "element click intercepted",
  "invalid argument", "invalid cookie domain", "invalid cookie name",
  "invalid selector", "move target out of bounds", "no such shadow root",
  "script timeout", "session not created", "unable to set cookie",
  "unable to capture screen", "unexpected command error", "unknown command",
  "unknown error", "unknown http method", "unsupported operation", "timeout",
];

function isDriverError(data) {
  const value = data?.value;
  return !!value && typeof value.error === "string" && DRIVER_ERRORS.includes(value.error) && typeof value.message === "string";
}

async function wd(method, path, body) {
  const res = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`WebDriver ${method} ${path}: non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || isDriverError(data)) {
    const code = data.value?.error ?? res.status;
    const detail = data.value?.message ?? `unexpected driver error: ${text.slice(0, 300)}`;
    const err = new Error(`WebDriver ${method} ${path}: ${code} ${detail}`);
    err.w3cError = data.value?.error;
    throw err;
  }
  return data.value;
}

async function execute(script, args = []) {
  return wd("POST", `/session/${sessionId}/execute/sync`, { script, args });
}

async function elementId(selector, using = "css selector") {
  try {
    const el = await wd("POST", `/session/${sessionId}/element`, { using, value: selector });
    return el["element-6066-11e4-a52e-4f735466cecf"] ?? null;
  } catch (e) {
    if (e.w3cError === "no such element") return null;
    throw e;
  }
}

// Svelte re-renders rows between locating and acting; a stale id is re-located
// once (R6.4 harness robustness, not product behavior). A remount also shows
// up as "element click intercepted" with the root <html> named as the blocker
// (the located node is already detached, so its last coordinates hit bare
// page) — the same race, the same recovery: re-locate and click again.
async function withStaleRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const remountRace = e.w3cError === "stale element reference" || e.w3cError === "element click intercepted";
      if (remountRace && attempt === 0) {
        await sleep(200);
        continue;
      }
      throw e;
    }
  }
}

async function click(selector, using = "css selector") {
  await withStaleRetry(async () => {
    const id = await elementId(selector, using);
    if (!id) throw new Error(`click target not found: ${selector}`);
    await wd("POST", `/session/${sessionId}/element/${id}/click`, {});
  });
}

async function typeInto(selector, text, using = "css selector") {
  await withStaleRetry(async () => {
    const id = await elementId(selector, using);
    if (!id) throw new Error(`type target not found: ${selector}`);
    // W3C `POST /element/{id}/value` appends to whatever the field already
    // holds; every use here means "this is the field's content now", so the
    // field is cleared first.
    await wd("POST", `/session/${sessionId}/element/${id}/clear`, {});
    await wd("POST", `/session/${sessionId}/element/${id}/value`, { text });
  });
}

// Real left-click at an element's center, after its rect has been stable for
// three consecutive samples — for overlays (menus) that are still animating
// when they mount, a plain element click can land on the pre-animation
// position or fire as a synthetic (0,0) event with outside-interaction side
// effects. Coordinates come from the page in one turn: no element id to go
// stale between locate and act.
async function clickAtStable(selector) {
  let last = null;
  let stable = 0;
  const deadline = Date.now() + 5000;
  while (stable < 3 && Date.now() < deadline) {
    const r = await execute(`
      return (() => {
        const el = document.querySelector(arguments[0]);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
      })();
    `, [selector]);
    stable = r && last && JSON.stringify(r) === JSON.stringify(last) ? stable + 1 : 0;
    last = r;
    await new Promise((res) => setTimeout(res, 120));
  }
  if (!last) throw new Error(`click target not found (stable): ${selector}`);
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x: last[0] + Math.round(last[2] / 2), y: last[1] + Math.round(last[3] / 2) },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
}

// Real right-click via the W3C pointer action at the element's center.
// Coordinates are computed inside the page in one turn: no element id to go
// stale between locate and act.
async function rightClick(selector) {
  const pos = await waitForEval(
    `return (() => {
      const el = document.querySelector(arguments[0]);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 20)) };
    })();`,
    { timeout: 4000, args: [selector] },
  );
  if (!pos) {
    const diag = await execute(`
      return JSON.stringify({
        q: document.querySelector('.search-input')?.value ?? null,
        count: document.querySelector('.result-count')?.textContent ?? null,
        rowEls: document.querySelectorAll('[data-row-id]').length,
        firstIds: Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 3).map((e) => e.getAttribute('data-row-id')),
        grid: !!document.querySelector('[data-view="grid"], .card'),
        modal: !!document.querySelector('.modal'),
      });
    `);
    throw new Error(`right-click target not found: ${selector} — UI state: ${diag}`);
  }
  const x = pos.x;
  const y = pos.y;
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x, y },
          { type: "pointerDown", button: 2 },
          { type: "pointerUp", button: 2 },
        ],
      },
    ],
  });
}

// Real key events via the W3C Actions API (go to the focused element).
// msedgedriver accepts only single code points; special keys use the W3C
// WebDriver key table values (Selenium's Key enum mirrors these).
const KEY_CODES = {
  Control: "\uE009",
  Escape: "\uE00C",
  Enter: "\uE007",
  Space: "\uE00D",
  Delete: "\uE017",
  Tab: "\uE004",
  ArrowDown: "\uE015",
  ArrowUp: "\uE013",
  ArrowRight: "\uE014",
  Home: "\uE011",
  End: "\uE010",
};

async function keys(...keyActions) {
  const actions = [];
  for (const key of keyActions) {
    const value = KEY_CODES[key] ?? key;
    if (key.startsWith("^")) actions.push({ type: "keyDown", value: KEY_CODES[key.slice(1)] ?? key.slice(1) });
    else if (key.startsWith("~")) actions.push({ type: "keyUp", value: KEY_CODES[key.slice(1)] ?? key.slice(1) });
    else actions.push({ type: "keyDown", value }, { type: "keyUp", value });
  }
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [{ type: "key", id: "keyboard", actions }],
  });
}

// ---------------------------------------------------------------- menu helpers
// The app's navigation and view controls are menus (UI-08/UI-09/UI-12), so the
// harness addresses their items by the label the user reads, not by a class.

// The toast stack is fixed chrome over the whole window, dialogs included
// (ToastStack.svelte). Housekeeping, not a check: dismiss the stack through its
// own close controls so a later pointer click reaches what it was aimed at.
async function clearToasts() {
  const dismissed = await execute(`
    const closes = Array.from(document.querySelectorAll('.toast .toast-close'));
    for (const el of closes) el.click();
    return closes.length;
  `);
  if (!dismissed) return;
  await waitForEval(`return document.querySelector('.toast') ? null : true;`, { timeout: 4000 });
}

// clickStable's stable-center click, with the target resolved by a
// page-side lookup instead of a selector.
// settled=true is for a target inside an already-open, settled menu (the
// column stepper mid-walk): the position is read once, and the hit test below
// still verifies the click point belongs to the intended element.
async function clickStable(findSource, { settled = false } = {}) {
  const rectOf = () => execute(`
    return (() => {
      const el = (${findSource})();
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), window.innerWidth, window.innerHeight];
    })();
  `);
  let last = await rectOf();
  if (!settled) {
    let stable = 0;
    const deadline = Date.now() + 5000;
    while (stable < 3 && Date.now() < deadline) {
      const rect = await rectOf();
      stable = rect && last && JSON.stringify(rect) === JSON.stringify(last) ? stable + 1 : 0;
      last = rect;
      await sleep(120);
    }
  }
  if (!last) throw new Error(`stable menu target not found: ${findSource}`);
  // A long menu can reach past the window; the pointer action must stay inside
  // the viewport, so the click point is clamped to the element's visible part.
  const x = Math.max(1, Math.min(last[0] + Math.round(last[2] / 2), last[4] - 2));
  const y = Math.max(1, Math.min(last[1] + Math.round(last[3] / 2), last[5] - 2));
  // The pointer action hits whatever is topmost at that point, so a click aimed
  // at a control a toast covers lands on the toast — silently acting on a
  // different control. Verify the point belongs to the intended element; when a
  // toast is in the way, dismiss the stack as a user would and look again.
  const landedOn = () => execute(`
    return (() => {
      const el = (${findSource})();
      if (!el) return { gone: true };
      const at = document.elementFromPoint(arguments[0], arguments[1]);
      if (!at) return { none: true };
      if (at === el || el.contains(at) || at.contains(el)) return { ok: true };
      const toast = at.closest('.toast');
      const name = at.getAttribute('aria-label') ?? String(at.className ?? at.tagName);
      return { occluded: (toast ? 'toast: ' : '') + name, byToast: !!toast };
    })();
  `, [x, y]);
  let hit = await landedOn();
  if (hit && hit.byToast) {
    await clearToasts();
    hit = await landedOn();
  }
  if (!hit || !hit.ok) {
    // What the page actually looks like at this instant: which menus exist,
    // where focus is, and the last commands the app ran — the difference
    // between "the menu closed" and "the item was never there".
    const diag = await execute(`
      return {
        menus: Array.from(document.querySelectorAll('.menu')).map((m) => ({ cls: m.className, items: m.querySelectorAll('.menu-item').length })),
        active: document.activeElement ? String(document.activeElement.getAttribute('aria-label') ?? document.activeElement.className ?? document.activeElement.tagName) : null,
        seen: (window.__smokeSeen ?? []).slice(-10),
      };
    `);
    throw new Error(`the click at ${x},${y} landed on ${JSON.stringify(hit)} instead of the intended target: ${findSource} — state: ${JSON.stringify(diag)}`);
  }
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x, y },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
}

// A menu item by its visible label: exact match first, then a prefix, so a
// trailing checkmark or count never hides the item.
function itemByLabel(menuSelector, label) {
  const text = JSON.stringify(label);
  return `() => { const items = Array.from(document.querySelectorAll('${menuSelector} .menu-item')); const t = (e) => e.textContent.trim(); return items.find((e) => t(e) === ${text}) ?? items.find((e) => t(e).startsWith(${text})); }`;
}

async function openMenu(triggerSelector, menuSelector) {
  await click(triggerSelector);
  const up = await waitForEval(`return document.querySelector('${menuSelector} .menu-item') ? true : null;`, { timeout: 5000 });
  if (!up) {
    // Which half failed: a control that cannot act (disabled, gone) or a menu
    // that opened and closed before the next read.
    const state = await execute(`
      const trigger = document.querySelector(arguments[0]);
      const content = document.querySelector(arguments[1]);
      return {
        trigger: trigger
          ? { disabled: trigger.disabled === true, ariaDisabled: trigger.getAttribute('aria-disabled'), expanded: trigger.getAttribute('aria-expanded') }
          : { missing: true },
        content: content ? { items: content.querySelectorAll('.menu-item').length } : { missing: true },
      };
    `, [triggerSelector, menuSelector]);
    throw new Error(`menu did not open: ${triggerSelector} -> ${menuSelector} — ${JSON.stringify(state)}`);
  }
}

async function clickMenuItem(menuSelector, label) {
  await clickStable(itemByLabel(menuSelector, label));
}

async function menuClosed(menuSelector) {
  return waitForEval(`return document.querySelector('${menuSelector}') ? null : true;`, { timeout: 5000 });
}

// Park the pointer and the focus outside the document area. List rows reveal
// their actions line on hover and on focus, and that line takes space before
// the meta column — so any measurement of the at-rest state (row geometry, the
// meta column's edges) must run with the pointer off the list. The status
// bar's left corner carries nothing interactive.
async function parkPointer() {
  await execute(`document.activeElement?.blur(); return true;`);
  const spot = await execute(`return { x: 8, y: window.innerHeight - 8 };`);
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", x: spot.x, y: spot.y }],
      },
    ],
  });
  await sleep(150);
}

// The app disables the controls a running job would collide with: the search
// field's import control (SearchBox.svelte) and *Rescan files*
// (BrowseMenu.svelte). A check that clicks one of them has to establish the
// app's own idle state first — no progress bar in the status bar, the control
// enabled. "The toast was seen" is not that evidence: the import result arrives
// with the command result, which is not ordered against the last
// `library_job_progress` event that clears the job.
async function jobIdle() {
  const probe = `
    if (document.querySelector('.progress-wrap')) return null;
    const gated = document.querySelector('.search-box .field-action');
    return gated && gated.disabled === true ? null : true;
  `;
  const idle = await waitForEval(probe, { timeout: 30000 });
  if (!idle) {
    // Which half stayed busy, and what the status bar says about it.
    const why = await execute(`
      const bar = document.querySelector('.progress-wrap');
      const gated = document.querySelector('.search-box .field-action');
      return {
        progressBar: !!bar,
        progressText: bar ? bar.textContent.trim() : null,
        gatedDisabled: gated ? gated.disabled : null,
        gatedLabel: gated ? gated.getAttribute('aria-label') : null,
      };
    `);
    throw new Error(`the app never went idle: a progress bar or a job-gated control stayed busy — ${JSON.stringify(why)}`);
  }
}

// Browse menu paths (UI-09): the saved-search items, and *Rescan files* — the
// action item whose disabled state while a job runs is the FR-15 busy gate
// (UI-09 moved the control here from the status bar, DR-96b).
async function rescanItemEnabled() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const enabled = await execute(`
    const items = Array.from(document.querySelectorAll('.menu.browse-menu .menu-item'));
    const item = items.find((e) => e.textContent.trim().startsWith('Rescan files'));
    if (!item) return null;
    return !(item.hasAttribute('data-disabled') || item.getAttribute('aria-disabled') === 'true');
  `);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  return enabled;
}

async function runRescan() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  await clickMenuItem(".menu.browse-menu", "Rescan files");
  await waitForEval(`return document.querySelector('.menu.browse-menu') ? null : true;`, { timeout: 5000 });
}

// Opens the Browse menu and chooses a saved-search item by its label.
async function browseSelect(label) {
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', label);
  await menuClosed('.menu.browse-menu');
}

// A category filter through the Browse submenu; multi-select keeps the menu
// open, so the caller closes it explicitly (DR-82).
async function browseSelectCategory(name) {
  // A category click is the user's full path: open Browse, open Categories,
  // click the item. If the menu vanishes mid-path (the app re-rendered under
  // an event the harness did not cause), a user simply opens it again — the
  // same path, retried, bounded, and said out loud when it happens.
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await openMenuSure('.browse-trigger', '.menu.browse-menu');
      await clickMenuItem('.menu.browse-menu', "Categories");
      const sub = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
      if (!sub) throw new Error("the Categories submenu did not open");
      await clickMenuItem('.menu.browse-sub', name);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`[retry ${attempt}] Browse → Categories → ${name}: ${String(lastError).slice(0, 300)}`);
        await keys("Escape").catch(() => {});
        await sleep(250);
      }
    }
  }
  throw lastError;
}

// The counts the status bar no longer renders live on the Browse menu's items
// (UI-09), so reading one means opening the menu.
async function browseCounts() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const counts = await execute(`
    const out = {};
    for (const item of document.querySelectorAll('.menu.browse-menu .menu-item')) {
      const label = (item.querySelector('.item-label')?.textContent ?? item.textContent).trim();
      const count = item.querySelector('.item-count')?.textContent.trim();
      if (count !== undefined && count !== null) out[label] = count;
    }
    return out;
  `);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  return counts;
}

async function browseCountIs(label, expected) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const counts = await browseCounts();
    if (counts[label] === expected) return true;
    await sleep(250);
  }
  return false;
}

// The filter as displayed: the Browse menu's checked items (UI-09).
async function browseCheckedItems() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const items = await activeMenuItems(".menu.browse-menu");
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  return items;
}

// The active filter is displayed in the Browse menu (UI-09 as modified): the
// checked items are its only on-screen mirror, and choosing *All documents* is
// how it is cleared. The category set lives in the Categories submenu, so it is
// opened, read, and closed again.
// The category list as the Browse menu offers it: Browse → Categories → the
// items, optionally only the ones the app marks active. The recorded
// `categories_list` answer is deliberately not used — it can be the list from
// before a create, while the menu is what the app is showing now. The Browse
// menu carries the category scope only when categories exist
// (BrowseMenu.svelte's own gate), so no scope means no categories.
async function categoryMenuNames(activeOnly) {
  await openMenuSure('.browse-trigger', '.menu.browse-menu');
  const scope = await execute(`
    return Array.from(document.querySelectorAll('.menu.browse-menu .menu-item'))
      .some((e) => ((e.querySelector('.item-label')?.textContent ?? e.textContent).trim().toLowerCase() === 'categories')) ? true : null;
  `);
  if (!scope) {
    await keys("Escape");
    await menuClosed('.menu.browse-menu');
    return [];
  }
  await clickMenuItem('.menu.browse-menu', "Categories");
  const up = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, {
    timeout: 5000,
  });
  if (!up) throw new Error("the Categories submenu did not open");
  const names = await execute(`
    return Array.from(document.querySelectorAll('.menu.browse-sub .menu-item'))
      .filter((e) => !arguments[0] || e.hasAttribute('data-active'))
      .map((e) => e.querySelector('.item-label')?.textContent.trim() ?? e.textContent.trim());
  `, [activeOnly]);
  await keys("Escape");
  await menuClosed('.menu.browse-sub');
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
  return names;
}

const activeCategoryNames = () => categoryMenuNames(true);
const allCategoryNames = () => categoryMenuNames(false);

// ---------------------------------------------------------------- boundary capture
// The ordering and category checks below compare what the app asked the backend
// for with what the backend answered. Neither end of Tauri's own API can be
// wrapped: `__TAURI_INTERNALS__.invoke` and `window.ipc` are installed with
// `Object.defineProperty({ value })`, so they are neither writable nor
// configurable (verified live in this app). The transport the app actually uses
// is observable, though: the CSP approved in SPEC-v0.0.1 §5.3.11 (DR-44) allows
// `connect-src 'self'` only, which blocks the `ipc.localhost` custom-protocol
// fetch, so Tauri falls back to posting each command as a JSON message through
// `window.chrome.webview.postMessage` — a writable property — and delivers the
// answer through the callback registry, whose Map instance accepts an own
// `get`. Observing both ends sees the command, the arguments the app sent and
// the answer the app received. A flow then reads the newest capture that
// matches the state it just set (every filter change re-queries, so a stale
// capture is simply not accepted).

async function instrumentBoundary() {
  const installed = await execute(`
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || !window.chrome || !window.chrome.webview) return null;
    if (internals.__smokeBoundary) return true;
    internals.__smokeBoundary = true;
    internals.__smokeSearch = { args: null, rows: null, total: 0 };
    internals.__smokeAbout = null;
    internals.__smokeWindow = {};
    internals.__smokeDialog = null;
    internals.__openCalls = 0;
    internals.__smokeSeen = [];

    // Anything the page fails to handle lands in the same stream as the
    // commands, so an aborted run says what the app was doing when it broke.
    window.addEventListener('unhandledrejection', (event) => {
      internals.__smokeSeen.push('unhandled-rejection: ' + String(event.reason));
    });
    window.addEventListener('error', (event) => {
      internals.__smokeSeen.push('page-error: ' + event.message);
    });

    const record = (cmd, args, value) => {
      // The shape of the payload separates answers from errors: a failed command
      // yields a message, never a result page or a list.
      if (cmd === 'library_search' && value && Array.isArray(value.rows)) {
        internals.__smokeSearch = {
          args,
          total: value.total,
          rows: value.rows.map((r) => ({
            id: r.id,
            title: r.title,
            size: r.size,
            added_at: r.added_at,
            favorite: r.favorite,
            categories: r.categories,
          })),
        };
      } else if (cmd === 'app_about' && value) {
        internals.__smokeAbout = value;
      } else if (cmd === 'plugin:dialog|open') {
        // The pickers the search field's import control and Ctrl+I open: the
        // request is observable, the dialog itself belongs to the OS.
        internals.__smokeDialog = { args };
      } else if (cmd.startsWith('plugin:window|')) {
        internals.__smokeWindow[cmd] = { args, value };
      }
    };

    // Requests: the fallback transport posts one JSON message per command,
    // carrying the command name, its payload and the callback id the answer
    // will be delivered to.
    const pending = new Map();
    const originalPost = window.chrome.webview.postMessage;
    window.chrome.webview.postMessage = function (data) {
      let message = null;
      try {
        message = typeof data === 'string' ? JSON.parse(data) : data;
      } catch {
        message = null;
      }
      if (message && typeof message.cmd === 'string') {
        internals.__smokeSeen.push(message.cmd);
        if (message.cmd === 'app_open_document') internals.__openCalls++;
        // A native picker is answered only when the user finishes with it, so
        // the answer-side record lands late or never. The claim under test is
        // the request the app makes — record it as it is posted.
        if (message.cmd === 'plugin:dialog|open') internals.__smokeDialog = { args: message.payload };
        if (typeof message.callback === 'number') {
          pending.set(message.callback, { cmd: message.cmd, args: message.payload });
        }
      } else {
        internals.__smokeSeen.push(typeof data === 'string' ? data.slice(0, 40) : typeof data);
      }
      return originalPost.call(this, data);
    };

    // Answers: the callback registry is a Map instance, and an own property
    // shadows the prototype method the runtime uses to look the callback up.
    const originalGet = internals.callbacks.get;
    internals.callbacks.get = function (id) {
      const callback = originalGet.call(this, id);
      if (typeof callback !== "function") return callback;
      const meta = pending.get(id);
      if (!meta) return callback;
      pending.delete(id);
      return function (value) {
        // A defect in the observer must never swallow the answer: the app's
        // own callback runs whatever the recording does, and a failed
        // recording is reported as what it is.
        try {
          record(meta.cmd, meta.args, value);
        } catch (error) {
          internals.__smokeSeen.push('probe-error: ' + String(error));
        }
        return callback(value);
      };
    };

    return true;
  `);
  if (installed === null) throw new Error("the app exposes no observable command boundary");
  // Self-test: a call made through the app's own path must show up in the
  // observer, or every boundary reading below is meaningless.
  await execute(`window.__TAURI_INTERNALS__.invoke('app_about', {}); return true;`);
  const seen = await waitForEval(`return window.__TAURI_INTERNALS__.__smokeAbout ? true : null;`, { timeout: 8000 });
  if (!seen) {
    const log = await execute(`
      const internals = window.__TAURI_INTERNALS__;
      return JSON.stringify({ postsSeen: (internals.__smokeSeen || []).slice(-6) });
    `);
    throw new Error(`the boundary observer did not see its own call — ${log}`);
  }
}

async function resetOpenCounter() {
  await execute(`window.__TAURI_INTERNALS__.__openCalls = 0; return true;`);
}

// Reads back a value the app itself received from a command. The harness never
// calls a command outside the app's own path — it only repeats what the app
// already asked, which is what the capability grants allow.
async function capturedValue(source, timeout = 8000) {
  const found = await waitForEval(`
    const s = (${source})();
    return s === undefined || s === null ? null : s;
  `, { timeout });
  return found ?? null;
}

async function capturedSearch(predicate, timeout = 25000) {
  const found = await waitForEval(`
    const s = window.__TAURI_INTERNALS__.__smokeSearch;
    if (!s || !s.rows) return null;
    return (${predicate})(s) ? s : null;
  `, { timeout });
  if (!found) {
    // The newest answer the app actually got: a miss is then a fact about the
    // state the app is in, not an unexplained timeout.
    const newest = await execute(`
      const s = window.__TAURI_INTERNALS__.__smokeSearch;
      if (!s) return 'the boundary is not instrumented';
      if (!s.rows) return 'no library_search answer arrived since instrumentation';
      return JSON.stringify({ args: s.args, total: s.total, rows: s.rows.length });
    `);
    throw new Error(`no library_search answer matched: ${predicate} (newest: ${newest})`);
  }
  return found;
}

// The category set a capture was asked for, as a comparable key.
const idKey = (ids) => [...ids].map(Number).sort((a, b) => a - b).join(",");

/**
 * A page-side expression matching a capture asked for exactly these category
 * ids. Predicates handed to `capturedSearch` run inside the app's page, where
 * harness helpers are not in scope — so this returns source, not a function.
 */
function askedFor(ids) {
  return `[...s.args.categoryIds].map(Number).sort((a, b) => a - b).join(",") === ${JSON.stringify(idKey(ids))}`;
}

// ---------------------------------------------------------------- filter helpers

async function resultCount() {
  return execute(`
    const c = document.querySelector('.result-count');
    return c ? Number(c.textContent.replace(/[^0-9]/g, '')) : null;
  `);
}

// The status bar's always-present content (UI-15): the quiet document count.
async function docCount() {
  const text = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent ?? null;`);
  return text === null ? null : Number(String(text).replace(/[^0-9]/g, ""));
}

// Narrows the list to a known set of documents: the fixture titles are
// `Fixture Doc docNNNNN`, so a five-digit prefix selects exactly those rows.
async function searchFor(term) {
  const needle = JSON.stringify(term);
  await typeInto(".search-input", term);
  const applied = await waitForEval(
    `return (document.querySelector('.search-input')?.value ?? '') === ${needle} ? true : null;`,
    { timeout: 8000 },
  );
  if (!applied) throw new Error(`search term not applied: ${term}`);
  // A flow that selects rows next acts on what is on screen, so the wait is on
  // the rendered list, not on the count chip: the count says nothing about
  // which rows are mounted, and acting on a list that is still re-rendering
  // selects the wrong documents.
  const shown = await waitForEval(`
    const rows = document.querySelectorAll('[data-row-id]');
    if (rows.length === 0) return null;
    return (rows[0].querySelector('.title-line')?.textContent ?? '').includes(${needle}) ? true : null;
  `, { timeout: 15000 });
  if (!shown) throw new Error(`the search term ${term} did not reach the rendered rows`);
}

async function clearSearch() {
  await execute(`document.querySelector('.search-input')?.focus(); return true;`);
  await keys("Escape");
  const cleared = await waitForEval(
    `return (document.querySelector('.search-input')?.value ?? '') === '' ? true : null;`,
    { timeout: 5000 },
  );
  if (!cleared) throw new Error("the search term did not clear — a later step would read a filtered list");
}

async function closeDialog(name = "dialog") {
  await keys("Escape");
  const closed = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });
  if (closed) return;
  const state = await execute(`
    const active = document.activeElement;
    const probe = (() => {
      const content = document.querySelector('.modal');
      if (!content) return 'no modal left';
      // Was the first Escape swallowed by something else, or is this dialog not
      // answering Escape at all? A second Escape on the focused element answers
      // that, and the close control says whether the dialog itself is healthy.
      const first = document.querySelector('.modal .modal-close');
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (active ?? content).dispatchEvent(ev);
      return {
        secondEscapePrevented: ev.defaultPrevented,
        stateAfterSecondEscape: content.getAttribute('data-state') ?? '?',
        hasCloseControl: !!first,
      };
    })();
    return {
      focus: active ? active.tagName.toLowerCase() + " " + (active.getAttribute('aria-label') ?? String(active.className ?? "")) : "none",
      modals: document.querySelectorAll('.modal').length,
      modalStates: Array.from(document.querySelectorAll('.modal')).map((el) => el.getAttribute('data-state') ?? "?"),
      modalHeadings: Array.from(document.querySelectorAll('.modal h1, .modal h2, .modal .modal-title, .modal [data-modal-title]')).map((el) => el.textContent.trim()),
      openOverlays: Array.from(document.querySelectorAll('.menu, .tooltip')).map((el) => el.className + "[" + (el.getAttribute('data-state') ?? "") + "]"),
      // The kit routes Escape to the last registered layer whose behavior is
      // close or ignore (bits-ui use-escape-layer.svelte.js). Listing the stack
      // names which layer answered the key instead of the dialog.
      escapeLayers: Array.from(globalThis.bitsEscapeLayers ?? []).map((entry) => {
        const opts = entry[0]?.opts ?? {};
        const ref = opts.ref;
        const node = ref && typeof ref === 'object' && 'tagName' in ref
          ? String(ref.tagName).toLowerCase() + '.' + String(ref.className ?? '').split(' ')[0]
          : typeof ref;
        return {
          node,
          behavior: opts.escapeKeydownBehavior?.current ?? '?',
          enabled: opts.enabled?.current ?? '?',
          connected: !!(ref && typeof ref === 'object' && 'isConnected' in ref && ref.isConnected),
        };
      }),
      dialogHasLayer: Array.from(globalThis.bitsEscapeLayers ?? []).some((entry) => entry[0]?.opts?.ref === document.querySelector('.modal')),
      escapeProbe: probe,
    };
  `);
  throw new Error(`${name} did not close on Esc — ${JSON.stringify(state)}`);
}

async function selectFirstRows(count) {
  const focused = await execute(EVAL.focusFirstRow);
  if (!focused) throw new Error("could not focus the first row");
  for (let i = 0; i < count; i++) {
    await keys("Space");
    if (i < count - 1) await keys("ArrowDown");
  }
  const bulk = await waitForEval(`return !!document.querySelector('.bulk-bar .bulk-count') ? true : null;`, {
    timeout: 5000,
  });
  if (!bulk) throw new Error("the bulk bar did not open");
}

async function clearSelection() {
  await keys("Escape");
  const cleared = await waitForEval(`return document.querySelector('.bulk-bar') ? null : true;`, { timeout: 5000 });
  if (!cleared) throw new Error("the selection did not clear — a later step would act on the wrong rows");
}

// Assigns the current selection to exactly one category through the picker
// (UI-04): the picker pre-arms every category the selection lacks and every
// category it already has, so the step un-arms everything but the target before
// Apply is the user's confirmation.
async function applyCategoryToSelection(name) {
  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Categories"]]', "xpath");
  // The picker's baseline is the selection *as the app sees it in its loaded
  // rows*, so the wait uses the same budget as the row renders elsewhere in
  // this harness — with 10,000 documents a re-render is not a 5 s operation.
  const targetLabel = `Add: ${name}`;
  const selector = JSON.stringify(`input[aria-label="${targetLabel}"]`);
  const preTicked = await waitForEval(
    `return document.querySelector(${selector})?.checked === true ? true : null;`,
    { timeout: 15000 },
  );
  if (!preTicked) {
    const offered = await execute(`
      return Array.from(document.querySelectorAll('.modal input[type="checkbox"]')).map((i) => ({
        label: i.getAttribute('aria-label'),
        checked: i.checked,
      }));
    `);
    throw new Error(`the picker did not pre-tick the add for ${name} — offered: ${JSON.stringify(offered)}`);
  }

  // The picker pre-ticks every category the selection lacks *and* every category
  // it already has (UI-04), so Apply would write all of them. A step that
  // intends exactly one category un-ticks the rest, exactly as a user who wants
  // one category does — and the resulting state is read back before Apply.
  const others = await execute(`
    return Array.from(document.querySelectorAll('.modal input[type="checkbox"]'))
      .filter((i) => i.checked && i.getAttribute('aria-label') !== ${JSON.stringify(targetLabel)})
      .map((i) => i.getAttribute('aria-label'));
  `);
  for (const label of others) {
    await click(`//input[@aria-label=${JSON.stringify(label)}]`, "xpath");
  }
  const armed = await execute(`
    return Array.from(document.querySelectorAll('.modal input[type="checkbox"]'))
      .filter((i) => i.checked)
      .map((i) => i.getAttribute('aria-label'));
  `);
  if (armed.length !== 1 || armed[0] !== targetLabel) {
    throw new Error(`the picker was not armed for exactly ${name} — checked: ${JSON.stringify(armed)}`);
  }
  await click('//button[normalize-space()="Apply"]', "xpath");
  const closed = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });
  if (!closed) throw new Error("the category picker stayed open after Apply");
}

async function openCategoriesManager() {
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', "Manage categories");
  const up = await waitForEval(
    `return document.querySelector('.modal input[aria-label="Add category"]') ? true : null;`,
    { timeout: 5000 },
  );
  if (!up) throw new Error("the categories manager did not open");
}

async function createCategory(name) {
  await typeInto('.modal input[aria-label="Add category"]', name);
  await keys("Enter");
  const made = await waitForEval(
    `return Array.from(document.querySelectorAll('.modal .category-name')).some((e) => e.textContent.trim() === arguments[0]) ? true : null;`,
    { timeout: 8000, args: [name] },
  );
  if (!made) throw new Error(`category was not created: ${name}`);
}

// Makes sure enough category rows exist for a scroll container to overflow
// (the scrollbar checks need containers that actually scroll).
async function ensureCategories(count) {
  let existing = await allCategoryNames();
  if (existing.length < count) {
    await openCategoriesManager();
    for (let i = existing.length + 1; i <= count; i++) await createCategory(`Scrollbar Probe ${String(i).padStart(2, "0")}`);
    await closeDialog("the categories manager");
    existing = await allCategoryNames();
  }
  if (existing.length < count) {
    throw new Error(`the app offers ${existing.length} category items after creating up to ${count}: ${JSON.stringify(existing)}`);
  }
  return existing;
}

async function browseToggleCategory(name) {
  await browseSelectCategory(name);
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
}

// Makes exactly `names` the active category set (FR-02 as modified): each
// change is the user's own path, Browse → Categories → the category item.
async function setActiveCategories(names) {
  const want = new Set(names);
  const current = new Set(await activeCategoryNames());
  for (const name of current) if (!want.has(name)) await browseToggleCategory(name);
  for (const name of names) if (!current.has(name)) await browseToggleCategory(name);
}

// Clears every active category (UI-09: the Browse menu is the only place a
// filter is cleared now that no chip renders anywhere).
async function clearCategoryFilter() {
  for (;;) {
    const active = await activeCategoryNames();
    const name = active[0];
    if (!name) return;
    await browseToggleCategory(name);
    const stillActive = await activeCategoryNames();
    if (stillActive.includes(name)) throw new Error(`category not cleared: ${name}`);
  }
}

// The sort items live inside the View menu (UI-08 as modified): *Sort by*
// carries the primary key and the direction, *Then by* the secondary key. The
// standalone Sort control is gone, so opening a sort item means opening View and
// clicking its submenu trigger.
const SORT_MENU = ".menu.view-sort";
const THENBY_MENU = ".menu.view-thenby";

async function openViewSubmenu(triggerLabel, menuSelector) {
  await openMenuSure(".view-trigger", ".menu.view-menu");
  await clickStable(itemByLabel(".menu.view-menu", triggerLabel));
  const up = await waitForEval(`return document.querySelector('${menuSelector} .menu-item') ? true : null;`, {
    timeout: 5000,
  });
  if (!up) throw new Error(`the View menu's ${triggerLabel} submenu did not open`);
}

// Closes a submenu and its parent menu.
async function closeViewMenus(menuSelector) {
  if (!(await menuClosed(menuSelector))) {
    await keys("Escape");
    await menuClosed(menuSelector);
  }
  if (!(await menuClosed(".menu.view-menu"))) {
    await keys("Escape");
    await menuClosed(".menu.view-menu");
  }
}

// Opens a menu by its trigger, closing a stale open one first (a trigger click
// toggles, so an already-open menu would otherwise close instead of open).
async function openMenuSure(triggerSelector, menuSelector) {
  const open = await execute(`return document.querySelector('${menuSelector}') ? true : false;`);
  if (open) {
    await keys("Escape");
    await waitForEval(`return document.querySelector('${menuSelector}') ? null : true;`, { timeout: 4000 });
  }
  await openMenu(triggerSelector, menuSelector);
}

async function chooseSort({ primary, dir, secondary }) {
  const pick = async (triggerLabel, menuSelector, findSource) => {
    await openViewSubmenu(triggerLabel, menuSelector);
    await clickStable(findSource);
    await closeViewMenus(menuSelector);
  };
  if (primary) await pick("Sort by", SORT_MENU, itemByLabel(SORT_MENU, primary));
  if (dir) await pick("Sort by", SORT_MENU, itemByLabel(SORT_MENU, dir));
  if (secondary) await pick("Then by", THENBY_MENU, itemByLabel(THENBY_MENU, SECONDARY_LABELS[secondary]));
  // No menu read-back: the menu's active marks are a rendering of the filter
  // state, and every caller that depends on that state reads it where it acts
  // — the sort arguments of the app's next library_search answer (captured at
  // the boundary, D16). A click that did not land fails there, naming the
  // args the app really used. The one claim about the menu's own marking
  // (AC-09's active items after a restart) reads the menu directly in
  // flowSortSecondary.
}

const SECONDARY_LABELS = { none: "None", title: "Title", date_added: "Date added", size: "File size" };

async function activeMenuItems(menuSelector) {
  return execute(`
    return Array.from(document.querySelectorAll('${menuSelector} .menu-item[data-active]')).map((e) => e.textContent.trim());
  `);
}

async function setViewMode(mode) {
  await openMenuSure('.view-trigger', '.menu.view-menu');
  await clickMenuItem('.menu.view-menu', mode === "grid" ? "Grid view" : "List view");
  await waitForEval(`return document.querySelector('.menu.view-menu') ? null : true;`, { timeout: 5000 });
  const rendered = await waitForEval(
    mode === "grid"
      ? `return document.querySelector('.block .card[data-row-id]') ? true : null;`
      : `return document.querySelector('.row[data-row-id]') ? true : null;`,
    { timeout: 15000 },
  );
  if (!rendered) throw new Error(`the ${mode} view never rendered`);
}

// Closes the app and starts a fresh session — the driver launches the binary
// again against the same APPDATA library. Proves every "survives a restart"
// clause in the specs.
// Restarts the app against the same library. The close goes through the app's
// own Close control, the way a user closes it: the app holds that close until
// its settings batch is written (AC-28, DR-104), and only a close the app
// itself requests gives it the chance to do so. Dropping the WebDriver session
// from outside is the fallback for a window whose controls are not reachable.
// D16: the restart settle is a process fact, not a pause — poll until the
// app's process is gone, then open the next session at once.
async function waitProcessExit(image = "pdfkeeper.exe", timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const listed = spawnSync("tasklist", ["/IM", image, "/FO", "CSV"], { encoding: "utf8" });
    if (!listed.stdout?.includes(image)) return;
    if (Date.now() > deadline) throw new Error(`${image} did not exit within ${timeoutMs} ms`);
    await sleep(100);
  }
}

async function restartApp() {
  const closeControl = `.toolbar .window-button[aria-label="Close"]`;
  const reachable = await execute(`return document.querySelector(${JSON.stringify(closeControl)}) ? true : null;`);
  if (reachable) {
    await clickStable(`() => document.querySelector(${JSON.stringify(closeControl)})`);
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        await execute(`return 1;`);
      } catch {
        break; // the app exited on its own, after writing what it had pending
      }
      await sleep(200);
    }
  }
  try {
    await wd("DELETE", `/session/${sessionId}`);
  } catch {
    /* the session already went with the window */
  }
  sessionId = null;
  await waitProcessExit();
  await openSession();
  const ready = await waitForEval(EVAL.appReady, { timeout: 45000 });
  if (!ready) throw new Error(`the relaunched app never reached the document area — ${await notReadyDiagnosis()}`);
}

async function waitForEval(script, { timeout = 15000, args = [], interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let value = null;
    try {
      value = await execute(script, args);
    } catch {
      value = null;
    }
    if (value) return value;
    if (Date.now() > deadline) return null;
    await sleep(interval);
  }
}

async function openSession() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const session = await wd("POST", "/session", {
        capabilities: {
          alwaysMatch: {
            browserName: "MicrosoftEdge",
            "tauri:options": { application: APP_EXE },
          },
        },
      });
      sessionId = session.sessionId;
      return;
    } catch (e) {
      await sleep(250);
      if (attempt === 39) throw e;
    }
  }
}

// ---------------------------------------------------------------- DOM probes

const EVAL = {
  appReady: `return !!document.querySelector('.app .status-bar');`,
  rowCount: `return document.querySelectorAll('[data-row-id]').length;`,
  docTotal: `return document.querySelector('.status-bar .doc-count')?.textContent ?? null;`,
  toastTexts: `return Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent);`,
  toastActionLabel: `return document.querySelector('.toast.error .control')?.textContent?.trim() ?? null;`,
  rowTitles: `return Array.from(document.querySelectorAll('[data-row-id] .title-line')).map((e) => e.textContent);`,
  bodyHas: `return document.body.textContent.includes(arguments[0]);`,
  rowsWithText: `return Array.from(document.querySelectorAll('[data-row-id]')).filter((r) => r.textContent.includes(arguments[0])).length;`,
  focusFirstRow: `const r = document.querySelector('[data-row-id]'); if (!r) return false; r.focus(); return document.activeElement === r;`,
  searchValue: `return document.querySelector('.search-input')?.value ?? null;`,
  searchFocused: `return document.activeElement?.classList?.contains('search-input') === true;`,
  coverImgs: `return document.querySelectorAll('[data-row-id] .cover img').length;`,
  gridCardsWithCovers: `return document.querySelectorAll('.card[data-row-id]').length > 0 && document.querySelectorAll('.card .cover img').length > 0;`,
  listRowsWithCovers: `return document.querySelectorAll('.row[data-row-id] .cover img').length > 0;`,
  missingRow: `return !!document.querySelector('[data-row-id][data-missing]');`,
  hasErrorToast: `return !!document.querySelector('.toast.error');`,
  emitDragDrop: `
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
      event: 'tauri://drag-drop',
      payload: { paths: arguments[0], position: { x: 200, y: 200 } },
    });
    return true;
  `,
  keyboardAudit: `
    // The toolbar is Browse / search (with the import control) / Select / View /
    // Settings, then the window controls (UI-01 as modified by UI-13/UI-14/
    // UI-17/UI-18). Every control is icon-only, so each one is addressed by the
    // aria-label it is required to have (R4.4).
    const targets = [
      { sel: '.browse-trigger' },
      { sel: '.search-input' },
      { sel: 'button[aria-label="Import"]' },
      { sel: 'button[aria-pressed]' },
      { sel: '.view-trigger' },
      { sel: '.settings-trigger' },
      { sel: 'button[aria-label="Minimize"]' },
      { sel: 'button[aria-label="Maximize"]' },
      { sel: 'button[aria-label="Close"]' },
    ];
    return targets.map(({ sel }) => {
      const els = Array.from(document.querySelectorAll(sel));
      return { sel, total: els.length, tabbable: els.filter((e) => e.tabIndex >= 0).length };
    });
  `,
};

function toastContains(text) {
  return waitForEval(`
    return Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes(arguments[0]));
  `, { timeout: 30000, args: [text] });
}

async function expectNoErrorToast(name) {
  // A delayed error toast is caught by watching for one, not by pausing.
  const bad = await waitForEval(EVAL.hasErrorToast, { timeout: 1200, interval: 100 });
  const toasts = bad ? await execute(EVAL.toastTexts) : [];
  check(name, !bad, bad ? `error toast: ${toasts.join(" | ")}` : "");
}

// What the window actually contains when it never mounts — the difference
// between "the app is broken" and "the harness is looking in the wrong place".
async function notReadyDiagnosis() {
  try {
    return await execute(`
      return JSON.stringify({
        title: document.title,
        hasApp: !!document.querySelector('.app'),
        hasStatusBar: !!document.querySelector('.app .status-bar'),
        scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
        text: document.body ? document.body.innerText.slice(0, 400) : null,
      });
    `);
  } catch (error) {
    return `no page reachable: ${error.message}`;
  }
}

// ---------------------------------------------------------------- run state
// Which fixture tier this run loaded (functional flows use the core tier,
// scale flows the docs tier — DR-135), and the titles that library holds.
// Expected counts are derived from the fixture manifest, never hard-coded.
let importedTiers = [];
let importedTitles = [];
// Whether the synthesized tauri://drag-drop reached the app's real listener
// (flowDropAndSkip, mandatory prefix, is the one that establishes this). The
// scale import goes through the app's own drop handler only when it did —
// run state, not a flow parameter, so every run shape uses the same path.
let dropWorks = false;

const tierDir = (tier) => (tier === "core" ? FIXTURE_CORE : FIXTURE_DOCS);
const tierPdfPaths = (dir) =>
  readdirSync(dir).filter((n) => n.endsWith(".pdf")).sort().map((n) => join(dir, n));
const coreManifest = () => JSON.parse(readFileSync(join(FIXTURE_CORE, "manifest.json"), "utf8"));

// Loads one fixture tier through the app's own import command and waits for
// the status-bar count to reach the expected total.
async function importTier(tier) {
  const paths = tierPdfPaths(tierDir(tier));
  const expected = paths.length.toLocaleString("en-US");
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: [] }); return true;`,
    [paths],
  );
  const done = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.trim() === arguments[0] ? true : null;`,
    { timeout: 60000, args: [expected] },
  );
  if (!done) throw new Error(`the ${tier}-tier import did not complete (count: ${await execute(EVAL.docTotal)})`);
  importedTiers.push(tier);
  importedTitles = importedTitles.concat(
    tier === "core"
      ? coreManifest().docs.map((d) => (d.noInfo ? d.name.replace(/\.pdf$/, "") : d.title))
      : paths.map((p) => `Fixture Doc ${basename(p).replace(/\.pdf$/, "")}`),
  );
}

// The count a search term should return, derived from the manifest titles: a
// document matches when every term token is a prefix of one of its title
// tokens — the same rule the app's prefix-token search applies (FR-03).
function expectedSearchCount(term) {
  const tokens = term.toLowerCase().split(/\s+/).filter(Boolean);
  return importedTitles.filter((title) => {
    const titleTokens = (title.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean);
    return tokens.every((token) => titleTokens.some((tt) => tt.startsWith(token)));
  }).length;
}

// The fixture directory the current library was imported from (missing-file
// flow moves a file out of it).
function importedTierDir() {
  for (const tier of importedTiers) if (existsSync(join(tierDir(tier), "doc00500.pdf"))) return tierDir(tier);
  throw new Error(`no imported fixture tier holds doc00500.pdf (imported: ${JSON.stringify(importedTiers)})`);
}

// Self-sufficient flow setup (D14): a flow starts from a known state — full
// library, no category filter, no search, rows on screen — instead of
// inheriting whatever the previous flow left behind.
async function setupListView(minRows = 3) {
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  // Known state includes an empty selection: a selection carried over from the
  // previous flow would be toggled OFF by selectFirstRows' Space presses.
  await clearSelectionIfAny();
  const ready = await waitForEval(
    `return document.querySelectorAll('[data-row-id]').length >= ${minRows} ? true : null;`,
    { timeout: 30000 },
  );
  if (!ready) throw new Error(`the flow setup needs at least ${minRows} rendered rows (library: ${await execute(EVAL.docTotal)})`);
}

async function setupGrid(minCards = 2) {
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("grid");
  await clearSelectionIfAny();
  const ready = await waitForEval(
    `return document.querySelectorAll('.block .card[data-row-id]').length >= ${minCards} ? true : null;`,
    { timeout: 30000 },
  );
  if (!ready) throw new Error(`the flow setup needs at least ${minCards} rendered cards (library: ${await execute(EVAL.docTotal)})`);
}

// Flows build their own entities (D14): create the named categories that do
// not exist yet, through the manager dialog.
async function ensureCategoryNames(names) {
  const existing = new Set(await allCategoryNames());
  const missing = names.filter((n) => !existing.has(n));
  if (!missing.length) return;
  await openCategoriesManager();
  for (const name of missing) await createCategory(name);
  await closeDialog("the categories manager");
}

// The bounded busy-gate job (SPEC-v0.0.5 §3.1.1): delete the cached cover
// files, touch the core tier's file mtimes, and run Rescan. Rescan re-imports
// only changed files (DR-135), so the cover queue it re-enqueues is bounded
// by the core tier — a job the app can actually start and finish inside a
// functional area's budget. Returns the first progress state observed while
// the job ran (the status bar's own sample).
async function startBoundedCoverJob() {
  if (!importedTiers.includes("core")) {
    throw new Error(`the bounded job requires the core fixture tier (§3.1.1); imported: ${JSON.stringify(importedTiers)}`);
  }
  const coverDir = join(DATA_DIR, "covers");
  if (existsSync(coverDir)) {
    // Files only: the queue holds the directory itself, recreating it under a
    // running writer would drop the in-flight renders.
    for (const f of readdirSync(coverDir)) if (f.endsWith(".png")) rmSync(join(coverDir, f), { force: true });
  }
  const now = new Date();
  for (const p of tierPdfPaths(FIXTURE_CORE)) utimesSync(p, now, now);
  await runRescan();
  const first = await waitForEval(`
    const wrap = document.querySelector('.progress-wrap');
    if (!wrap) return null;
    const m = wrap.textContent.match(/([0-9,]+)\\s*\\/\\s*([0-9,]+)/);
    return { label: wrap.getAttribute('aria-label'), text: m ? m[0] : wrap.textContent.trim().slice(0, 60) };
  `, { timeout: 10000 });
  if (!first) throw new Error("the bounded rescan job never showed a progress bar (delete-covers + mtime touch + Rescan — §3.1.1)");
  return first;
}

// ---------------------------------------------------------------- flows

async function flowStartup() {
  const ready = await waitForEval(EVAL.appReady, { timeout: 45000 });
  if (!ready) throw new Error(`app window never reached the document area — ${await notReadyDiagnosis()}`);
  check("startup: app shell + document area mount", true);

  const empty = await execute(EVAL.bodyHas, ["Your library is empty"]);
  check("startup: empty-state variant for a fresh library", !!empty);
}

async function emitDrop(paths) {
  try {
    await execute(EVAL.emitDragDrop, [paths]);
    return true;
  } catch {
    return false;
  }
}

async function flowDropAndSkip() {
  // Drop wiring end-to-end: a synthesized tauri://drag-drop reaches the
  // app's real listener; a non-PDF comes back as a reported skip (FR-01/FR-11).
  if (await emitDrop([join(FIXTURE_SPECIAL, "notes.txt")])) {
    const skipped = await toastContains("file skipped");
    if (skipped) {
      check("drag-drop: synthesized drop reaches the app pipeline end-to-end", true);
      return true;
    }
  }
  // The WebView delivers native drag events through its private channel;
  // a synthesized `tauri://drag-drop` cannot reach that channel from JS.
  // The delivery itself is harness-limited (real drag needs a real OS drag);
  // the pipeline the drop handler calls is verified through the same command.
  skip(
    "drag-drop: synthesized tauri://drag-drop delivery",
    "native drag channel is not synthesizable through WebDriver — real drag&drop needs manual observation",
  );
  await execute(
    `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: [] });`,
    [[join(FIXTURE_SPECIAL, "notes.txt")]],
  );
  const skipped = await toastContains("file skipped");
  check("non-PDF import is reported as a skip, never silently ignored (FR-11)", !!skipped);
  return false;
}

async function flowImport10k() {
  const paths = tierPdfPaths(FIXTURE_DOCS);
  // The count claim is derived, not hard-coded: the batch must add exactly
  // 10,000 to whatever the library held before (in the full run that is the
  // core tier the functional section left behind).
  const before = await docCount();
  if (!Number.isFinite(before)) throw new Error(`flowImport10k could not read the library count: ${before}`);
  const target = (before + paths.length).toLocaleString("en-US");
  const started = Date.now();
  if (dropWorks) {
    await execute(EVAL.emitDragDrop, [paths]);
  } else {
    // Fallback: the same command the drop handler calls, so the pipeline and
    // UI update are still exercised end-to-end.
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: [] }); return true;`,
      [paths],
    );
  }
  // While the batch is still arriving the status bar shows the job progress
  // (UI-15 as extended by AC-22's job half); the count is the library total.
  // The same poll is the AC-57 throughput sampler: every status-bar sample of
  // the cover job is one measurement point (measured from the run log).
  const coverSamples = [];
  const sampleCovers = async () => {
    const s = await execute(`
      const wrap = document.querySelector('.progress-wrap');
      if (!wrap || (wrap.getAttribute('aria-label') ?? '') !== 'Generating covers…') return null;
      const m = wrap.textContent.match(/([0-9,]+)\\s*\\/\\s*([0-9,]+)/);
      if (!m) return null;
      return { t: Date.now(), processed: Number(m[1].replace(/,/g, '')), total: Number(m[2].replace(/,/g, '')) };
    `);
    if (s) coverSamples.push(s);
  };
  let total = null;
  let progressSeen = false;
  for (;;) {
    total = await execute(EVAL.docTotal);
    if (total === target) break;
    if (!progressSeen) progressSeen = !!(await execute(`return !!document.querySelector('.status-bar .progress-wrap');`));
    await sampleCovers();
    if (Date.now() - started > 45000) break;
    await sleep(250);
  }
  const elapsed = Date.now() - started;
  check("AC-01 UI: 10,000 documents listed via the app", total === target, `status bar count: ${total}, ${elapsed} ms`);
  check("AC-22: the status bar shows the progress bar while a job runs", progressSeen, `progress bar seen during the import: ${progressSeen}`);
  check("AC-01 UI: whole import completes < 30 s (NFR-02)", elapsed < 30000, `${elapsed} ms`);
  const toast = await toastContains("Imported 10,000 PDFs");
  check("import result toast reports the batch (FR-15)", !!toast);

  // Duplicate import: same paths again — every one skipped with a notice (FR-11).
  if (dropWorks) await emitDrop(paths);
  else
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: [] }); return true;`,
      [paths],
    );
  const dup = await toastContains("10,000 files skipped");
  check("AC-01 UI: duplicate import is skipped with a notice (FR-11)", !!dup);

  // AC-57 (real-app half): the backfill throughput, measured from this run's
  // own status-bar samples. The cover queue keeps draining after the import
  // command returned; an 8 s sampling window measures the rate over a span of
  // at least 1.5 s. Baseline: 27 covers/s — the v0.0.4 serial queue measured
  // in SPEC-v0.0.5 §5; the claim is ≥ 2× (DR-134's expected 2.9× at N=2).
  const sampleEnd = Date.now() + 8000;
  while (Date.now() < sampleEnd) {
    await sampleCovers();
    await sleep(250);
  }
  let rate = 0;
  for (let i = coverSamples.length - 1; i >= 1 && rate === 0; i--) {
    const dt = (coverSamples[i].t - coverSamples[0].t) / 1000;
    if (dt >= 1.5) rate = (coverSamples[i].processed - coverSamples[0].processed) / dt;
  }
  check(
    "AC-57: cover backfill throughput ≥ 2× the 27/s baseline (real app, 10 000-document corpus)",
    rate >= 54,
    rate ? `${rate.toFixed(1)} covers/s from ${coverSamples.length} status-bar samples (baseline 27/s)` : `no measurable cover-progress samples (${coverSamples.length})`,
  );

  importedTiers.push("docs");
  importedTitles = importedTitles.concat(paths.map((p) => `Fixture Doc ${basename(p).replace(/\.pdf$/, "")}`));
}

async function flowVirtualization() {
  // Self-sufficient (D14): the flow establishes its own full-list query
  // instead of relying on the previous flow leaving one visible.
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  const restored = await waitForEval(`return document.querySelectorAll('[data-row-id]').length >= 12;`, { timeout: 30000 });
  const mounted = await execute(EVAL.rowCount);
  const total = await execute(EVAL.docTotal);
  check(
    "NFR-01 UI: mounted document nodes stay bounded with 10,000 documents",
    !!restored && mounted >= 12 && mounted < 60,
    `${mounted} mounted rows for ${total} documents`,
  );
}

// Appends to what the field already holds — what a person typing a continuation
// does. `typeInto` replaces; this one extends.
async function appendInto(selector, text) {
  await withStaleRetry(async () => {
    const id = await elementId(selector);
    if (!id) throw new Error(`type target not found: ${selector}`);
    await wd("POST", `/session/${sessionId}/element/${id}/value`, { text });
  });
}

// Types `text` in small chunks with a gap shorter than the 150 ms debounce:
// still ONE burst, but any per-keystroke query would have time to render an
// intermediate result that observation can catch.
async function typeInChunks(selector, text, chunk = 4, gapMs = 60) {
  for (let i = 0; i < text.length; i += chunk) {
    await appendInto(selector, text.slice(i, i + chunk));
    await sleep(gapMs);
  }
}

async function flowSearchDebounce() {
  // Self-sufficient (D14): an unfiltered full library is the starting state.
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();

  // Ctrl+F focuses the search field (real key chord).
  await keys("^Control", "^f", "~f", "~Control");
  const focused = await waitForEval(EVAL.searchFocused, { timeout: 3000 });
  check("Ctrl+F focuses search (keyboard reachability)", !!focused);

  // Typing the whole query. The query-count-per-burst is NOT asserted here:
  // WebDriver character dispatch speed varies with machine load, and gaps
  // over 150 ms mid-string legitimately fire intermediate queries — the
  // debounce unit test (ui/src/lib/debounce.test.ts) pins the 150 ms
  // behavior deterministically. This flow checks the user-visible outcomes:
  // the correct result set arrives, and only the newest query is ever shown.
  // The expected count is derived from the fixture manifest (D13: this flow
  // runs against the core tier — 99 documents match "fixture doc doc00"
  // there, 999 against the docs tier; the claim is the same either way).
  const expected = expectedSearchCount("fixture doc doc00");
  await typeInto(".search-input", "fixture doc doc00");
  const shown = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === ${JSON.stringify(`${expected} shown`)} ? c.textContent : null;
  `, { timeout: 15000 });
  check("debounced search reaches the correct result set", !!shown, `status: ${shown}`);

  // Extend the query -> narrows to exactly one row.
  await typeInChunks(".search-input", "100", 1);
  const narrowed = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '1 shown' ? c.textContent : null;
  `, { timeout: 15000 });
  const titles = await execute(EVAL.rowTitles);
  const onlyTarget = titles.length === 1 && titles[0] === "Fixture Doc doc00100";
  check("stale responses are never rendered (only the newest query is on screen)", !!narrowed && onlyTarget, `rows: ${JSON.stringify(titles)}`);

  // Esc in the search box clears it (SearchBox owns that key).
  await keys("Escape");
  const cleared = await waitForEval(`
    return (document.querySelector('.search-input')?.value ?? 'x') === '' && !document.querySelector('.result-count');
  `, { timeout: 5000 });
  check("Esc clears the search and restores the full list", !!cleared);
}

async function flowCategories() {
  // Self-sufficient (D14): the flow needs its own rows to select.
  await setupListView(3);

  // UI-10: the category CRUD lives in the manager dialog, reached through
  // Browse → Manage categories.
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', "Manage categories");
  const manager = await waitForEval(`return document.querySelector('.modal input[aria-label="Add category"]') ? true : null;`, { timeout: 5000 });
  check("UI-10: Manage categories opens the categories manager", !!manager);

  await typeInto('.modal input[aria-label="Add category"]', "Smoke Cat");
  await keys("Enter");
  // Poll both halves together: the info toast auto-dismisses after 6 s, so
  // waiting out a failed list check first would erase the toast evidence.
  const both = await waitForEval(`
    const row = !!document.querySelector('.modal .category-row .category-name') &&
      Array.from(document.querySelectorAll('.modal .category-name')).some((b) => b.textContent.includes('Smoke Cat'));
    const toast = Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes('Category created'));
    return row && toast;
  `, { timeout: 15000 });
  if (both) {
    check("AC-03 UI: category creation via keyboard (manager field + Enter)", true);
  } else {
    const diag = await execute(`
      return {
        input: document.querySelector('.modal input[aria-label="Add category"]')?.value ?? null,
        rows: Array.from(document.querySelectorAll('.modal .category-name')).map((e) => e.textContent.trim()),
        toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
      };
    `);
    check("AC-03 UI: category creation via keyboard (manager field + Enter)", false, `state: ${JSON.stringify(diag)}`);
  }
  await keys("Escape"); // close the manager — the list flows continue underneath
  await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });

  // Select three rows with Space/ArrowDown only.
  const focused = await execute(EVAL.focusFirstRow);
  if (!focused) throw new Error("could not focus the first row");
  await keys("Space", "ArrowDown", "Space", "ArrowDown", "Space");
  const bulk = await waitForEval(`
    return Array.from(document.querySelectorAll('.bulk-bar')).some((b) => b.textContent.includes('3 selected'));
  `, { timeout: 5000 });
  check("Space + ArrowDown select rows and open the bulk bar", !!bulk);

  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Categories"]]', "xpath");
  const picker = await waitForEval(EVAL.bodyHas, { args: ["Categories for 3 documents"] });
  check("bulk bar opens the category picker (UI-04)", !!picker);

  // UI-04 baseline: a category none of the selection has is pre-ticked for
  // ADD; the user confirms before anything is written.
  const addChecked = () =>
    execute(`return document.querySelector('input[aria-label="Add: Smoke Cat"]')?.checked ?? null;`);
  const baseline = await waitForEval(`
    return document.querySelector('input[aria-label="Add: Smoke Cat"]')?.checked === true;
  `, { timeout: 5000 });
  check("picker pre-ticks add for a category the selection lacks (UI-04)", !!baseline);
  await click('input[aria-label="Add: Smoke Cat"]');
  const toggledOff = (await addChecked()) === false;
  await click('input[aria-label="Add: Smoke Cat"]');
  const toggledOn = (await addChecked()) === true;
  check("picker add checkbox toggles the assignment off and on", toggledOff && toggledOn);
  await click('//button[normalize-space()="Apply"]', "xpath");

  // The filter is now a Browse-menu choice (UI-09); the result count is the
  // same number the manager row shows.
  await browseSelectCategory("Smoke Cat");
  const filtered = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '3 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  const chip = await activeCategoryNames();
  check("AC-03 UI: a category filter from Browse shows exactly the assigned documents", !!filtered, `status: ${filtered}`);
  check("UI-09: the active category appears as a checked item", chip.includes("Smoke Cat"), `checked: ${JSON.stringify(chip)}`);
}

async function flowContextMenu() {
  // UI-05: right-click on a row opens the context menu on screen. The
  // action parity itself (R4.7) is structural — buttons and menu render the
  // same action list — so this checks the interaction and the chrome.
  // §5.2: the Esc that CLOSES the menu must not clear the selection —
  // this is the regression found in v0.0.1 verification (overlay count
  // dropped to 0 while the menu was open; the window-level Esc wiped the
  // selection).
  // Self-sufficient (D14): the flow builds its own rows and its own selection.
  await setupListView(3);
  await selectFirstRows(3);
  await rightClick("[data-row-id]");
  const opened = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    const r = menu.getBoundingClientRect();
    return r.width > 120 && r.height > 20 && r.x >= 0 && r.y >= 0 &&
      r.right <= window.innerWidth && r.bottom <= window.innerHeight;
  `, { timeout: 5000 });
  check("right-click opens the context menu on screen (UI-05)", !!opened);
  await keys("Escape");
  const closed = await waitForEval(`return !document.querySelector('.menu .menu-item');`, { timeout: 5000 });
  check("Esc closes the context menu", !!closed);
  const selection = await waitForEval(
    `return !!document.querySelector('.bulk-bar .bulk-count');`,
    { timeout: 3000 },
  );
  check("closing the menu with Esc leaves the selection intact (§5.2)", !!selection);
}

async function flowDelete() {
  // Self-sufficient (D14): the flow builds its own delete case — a category
  // holding exactly three documents — instead of borrowing flowCategories'
  // selection, and reads the library total before and after instead of
  // naming a corpus-specific number.
  const grouped = (n) => n.toLocaleString("en-US");
  await setupListView(3);
  await ensureCategoryNames(["Delete Probe"]);
  await selectFirstRows(3);
  await applyCategoryToSelection("Delete Probe");
  await clearSelection();
  await browseSelectCategory("Delete Probe");
  const filtered = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '3 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  if (!filtered) throw new Error(`the delete case needs exactly 3 filtered rows (status: ${filtered})`);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  const before = await docCount();
  if (!Number.isFinite(before)) throw new Error(`flowDelete could not read the library count: ${before}`);
  await selectFirstRows(3);

  const focused = await execute(EVAL.focusFirstRow);
  if (!focused) throw new Error("could not focus a selected row");
  await keys("Delete");
  const dialog = await waitForEval(EVAL.bodyHas, { args: ["Delete 3 documents?"] });
  check("AC-04 UI: Delete key opens the confirmation dialog", !!dialog);

  // §5.2 on the Modal path: Esc cancels the dialog and the selection
  // survives — the user retries the same command.
  await keys("Escape");
  const cancelled = await waitForEval(`
    return !document.body.textContent.includes('Delete 3 documents?') &&
      !!document.querySelector('.bulk-bar .bulk-count');
  `, { timeout: 5000 });
  check("Esc cancels the dialog and keeps the selection (§5.2)", !!cancelled);
  await keys("Delete");
  const reopened = await waitForEval(EVAL.bodyHas, { args: ["Delete 3 documents?"] });
  check("the same selection re-opens the dialog after cancel", !!reopened);

  await click('//button[normalize-space()="Delete from library"]', "xpath");
  const emptyCategory = await waitForEval(EVAL.bodyHas, { args: ["This category is empty"] });
  const total = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count')?.textContent;
    return t === ${JSON.stringify(grouped(before - 3))} ? t : null;
  `, { timeout: 10000 });
  const toast = await toastContains("Deleted 3 documents");
  check("AC-04 UI: 'Delete from library' removes exactly the selection", !!emptyCategory && total === grouped(before - 3) && !!toast);

  await browseSelect("All documents");
  const allBack = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count')?.textContent;
    return t === ${JSON.stringify(grouped(before - 3))} ? t : null;
  `, { timeout: 10000 });
  check("library count reflects the deletion", !!allBack);
}

async function flowFavorites() {
  // FR-04: starring pins a document to the top of every list, the counts
  // reflect it, and the sidebar Favorites view shows exactly the starred
  // document. Self-sufficient (D14): the flow builds its own All-view list.
  await setupListView(6);
  const target = await waitForEval(`
    const rows = document.querySelectorAll('.row[data-row-id]');
    if (rows.length < 6) return null;
    const r = rows[2]; // a row that is NOT at the top — pinning must move it
    return { id: r.getAttribute('data-row-id'), title: r.textContent.slice(0, 40) };
  `, { timeout: 15000 });
  check("favorites flow: a mid-list row is available", !!target);

  // Row actions are display:none until the row is hovered or focused —
  // focus the target row so its star becomes interactable.
  await execute(`
    document.querySelector('[data-row-id="${target.id}"]')?.focus();
    return true;
  `);
  await click(`//div[@data-row-id="${target.id}"]//button[contains(@class,"star")]`, "xpath");
  const starred = await browseCountIs("Favorites", "1");
  check("FR-04: starring updates the favorites count", starred);

  // Agreed UI (favorites spec): no mid-scroll jump — the row stays under
  // the cursor; the pinned position applies when the query next re-runs.
  const noJump = await waitForEval(`
    const first = document.querySelector('.row[data-row-id]');
    return first && first.getAttribute('data-row-id') !== arguments[0] ? true : null;
  `, { timeout: 3000, args: [target.id] });
  check("FR-04: the starred row does not jump mid-scroll (agreed UI)", !!noJump);

  await browseSelect("Favorites");
  const favShown = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '1 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  const checked = await browseCheckedItems();
  check("FR-04: the Favorites view shows exactly the starred document", !!favShown, `status: ${favShown}`);
  check("UI-09: the Favorites mode appears as a checked item", checked.some((text) => text.startsWith("Favorites")), `checked: ${JSON.stringify(checked)}`);

  // Clearing the filter is the Browse menu's job now (UI-09): *All documents*
  // clears it and nothing else, and the full list returns.
  await browseSelect("All documents");
  const clearedFilter = await waitForEval(`
    return document.querySelectorAll('.row[data-row-id]').length > 5 ? true : null;
  `, { timeout: 15000 });
  check("UI-09: clearing the filter in the Browse menu clears that filter and nothing else", !!clearedFilter);

  // The All view the chip removal returns to is the next query: it must show
  // the pinned position.
  const pinned = await waitForEval(`
    const first = document.querySelector('.row[data-row-id]');
    return first && first.getAttribute('data-row-id') === arguments[0] ? true : null;
  `, { timeout: 10000, args: [target.id] });
  check("FR-04: the starred document is pinned to the top on the next query", !!pinned);

  await execute(`
    document.querySelector('.row[data-row-id]')?.focus();
    return true;
  `);
  await click(`//div[@data-row-id="${target.id}"]//button[contains(@class,"star")]`, "xpath");
  const cleared = await browseCountIs("Favorites", "0");
  check("FR-04: unstarring removes the document from Favorites", cleared);
}

// Right-click a row, wait for the context menu to mount, pick Details, wait
// for the editor. Split steps avoid the mount race (bits-ui opens async).
async function openEditorForRow(rowSelector) {
  await rightClick(rowSelector);
  const menuUp = await waitForEval(`return document.querySelector('.menu .menu-item') ? true : null;`, { timeout: 5000 });
  if (!menuUp) throw new Error(`context menu did not open for: ${rowSelector}`);
  await click('//div[contains(@class,"menu")]//div[normalize-space()="Details"]', "xpath");
  const opened = await waitForEval(EVAL.bodyHas, { args: ["Document details"] });
  if (!opened) throw new Error(`editor did not open for: ${rowSelector}`);
}

// The details editor's fields, driven the way typing drives them: set the value
// on the field and dispatch its input event, so the app's own store decides what
// a save writes. Used by every flow that needs a document in a given metadata
// state.
async function setEditorField(label, value) {
  const ok = await execute(`
    return (() => {
      const labelEl = Array.from(document.querySelectorAll('.modal label')).find((l) => l.querySelector('span')?.textContent.trim() === arguments[0]);
      const field = labelEl ? labelEl.querySelector('input, textarea') : null;
      if (!field) return false;
      field.value = arguments[1];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })();
  `, [label, value]);
  if (!ok) throw new Error(`editor field not found: ${label}`);
}

async function saveEditor() {
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Save"]', "xpath");
  const closed = await waitForEval(`return document.body.textContent.includes('Document details') ? null : true;`, { timeout: 10000 });
  if (!closed) throw new Error("the editor did not close after Save");
}

async function flowMetadata() {
  // FR-05/06/07 (UI part): the details modal edits the title; the edited
  // title is shown on the row and is searchable.
  // Self-sufficient (D14): the flow builds its own list-view rows.
  await setupListView(3);
  const target = await waitForEval(`
    const rows = document.querySelectorAll('.row[data-row-id]');
    if (rows.length < 3) return null;
    return { id: rows[1].getAttribute('data-row-id') };
  `, { timeout: 15000 });
  check("metadata flow: a row is available", !!target);

  await openEditorForRow(`div[data-row-id="${target.id}"]`);
  const modal = await waitForEval(EVAL.bodyHas, { args: ["Document details"] });
  check("FR-05: the details modal opens from the row menu", !!modal);

  const hint = await waitForEval(EVAL.bodyHas, { args: ["from filename"] });
  check("UI-02: an untouched auto title carries the provenance hint", !!hint);

  await execute(`
    const input = document.querySelector('.modal input.field');
    if (!input) return false;
    input.value = 'ZZRenamed Fixture';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `);
  const hintGone = await waitForEval(
    `return document.body.textContent.includes('from filename') ? null : true;`,
    { timeout: 5000 },
  );
  check("UI-02: the hint disappears on the first edit", !!hintGone);
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Save"]', "xpath");
  const closed = await waitForEval(
    `return document.body.textContent.includes('Document details') ? null : true;`,
    { timeout: 10000 },
  );
  const onRow = await waitForEval(EVAL.rowsWithText, { args: ["ZZRenamed Fixture"] });
  check("FR-05: saving updates the title on the row", !!closed && onRow === 1, `rows: ${onRow}`);

  await typeInto(".search-input", "zzrename");
  const found = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '1 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  const hit = await waitForEval(EVAL.rowsWithText, { args: ["ZZRenamed Fixture"] });
  check("FR-05/FR-03: the edited title is found by search", !!found && hit === 1, `status: ${found}`);

  // UI-02: the editor hands the document to the delete flow; a completed
  // deletion closes the editor, a cancel does not. The row is anchored by its
  // (renamed) title text — after a title edit the DOM node's id attribute
  // does not reliably track the captured target id.
  const renamedId = await waitForEval(`
    const rows = Array.from(document.querySelectorAll('[data-row-id]'))
      .filter((r) => r.textContent.includes('ZZRenamed Fixture'));
    return rows.length === 1 ? rows[0].getAttribute('data-row-id') : null;
  `, { timeout: 10000 });
  check("delete flow: the renamed row is findable by text", !!renamedId);
  await openEditorForRow(`div[data-row-id="${renamedId}"]`);
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Delete"]', "xpath");
  const confirm = await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
  check("UI-02: the editor hands the document to the delete flow (singular title)", !!confirm);
  await keys("Escape"); // cancel the confirmation — the editor must stay open
  const editorStillOpen = await waitForEval(EVAL.bodyHas, { args: ["Document details"] });
  const notDeleted = await waitForEval(EVAL.rowsWithText, { args: ["ZZRenamed Fixture"] });
  check("UI-02: cancelling the delete keeps both the document and the editor", !!editorStillOpen && notDeleted === 1);
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Delete"]', "xpath");
  await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
  await click('//button[normalize-space()="Delete from library"]', "xpath");
  const gone = await waitForEval(`
    return document.querySelectorAll('[data-row-id="' + arguments[0] + '"]').length === 0
      && !document.body.textContent.includes('Document details') ? true : null;
  `, { timeout: 10000, args: [renamedId] });
  check("UI-02: deleting from the editor removes the document and closes the editor", !!gone);

  // Leave the library unfiltered for the following flows.
  await clearSearch();

  // Escape with unsaved changes is the discard step, not a close (UI-02,
  // SPEC-v0.0.1 metadata-editing). The draft survives until the user decides,
  // in either direction.
  const otherId = await waitForEval(`return document.querySelector('[data-row-id]')?.getAttribute('data-row-id') ?? null;`, { timeout: 15000 });
  if (!otherId) throw new Error("no row is mounted after clearing the search — the discard checks need one");
  const rowTitle = () => execute(`
    const row = document.querySelector('div[data-row-id="' + arguments[0] + '"]');
    return row ? (row.querySelector('.title-line')?.textContent.trim() ?? null) : null;
  `, [otherId]);
  const storedTitle = await rowTitle();
  const draft = "Unsaved Title Draft";
  const field = () => execute(`return document.querySelector('.modal input.field')?.value ?? null;`);
  await openEditorForRow(`div[data-row-id="${otherId}"]`);
  await execute(`
    const input = document.querySelector('.modal input.field');
    if (!input) return false;
    input.value = arguments[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `, [draft]);
  await keys("Escape");
  const step = await waitForEval(EVAL.bodyHas, { args: ["Discard changes?"] });
  const editorOpen = await waitForEval(`return document.querySelector('.modal') ? true : null;`, { timeout: 3000 });
  const held = await field();
  check("UI-02: Escape with unsaved changes opens the discard step and keeps the editor and the draft",
    !!step && !!editorOpen && held === draft,
    `step: ${!!step}, editor: ${!!editorOpen}, field: ${JSON.stringify(held)}`);

  await clickStable(`() => Array.from(document.querySelectorAll('.discard-bar button')).find((b) => b.textContent.trim() === 'Keep editing') ?? null`);
  const stepGone = await waitForEval(`return document.querySelector('.discard-bar') ? null : true;`, { timeout: 5000 });
  const kept = await field();
  check("UI-02: 'Keep editing' closes the step and leaves the draft in place",
    !!stepGone && kept === draft, `field: ${JSON.stringify(kept)}`);

  // AC-52 (D12, §5.2 guard): Ctrl+A while the title field owns focus is the
  // field's own select-all — no library selection, no bulk bar.
  await execute(`
    const input = document.querySelector('.modal input.field');
    if (!input) return false;
    input.focus();
    return true;
  `);
  await keys("^Control", "^a", "~a", "~Control");
  const inField = await execute(`
    const el = document.activeElement;
    const isField = el === document.querySelector('.modal input.field');
    return {
      fieldFocused: isField,
      selectedAll: isField ? el.selectionStart === 0 && el.selectionEnd === el.value.length : false,
      value: isField ? el.value : null,
      bulkBar: !!document.querySelector('.bulk-bar'),
      selectedRows: document.querySelectorAll('[data-row-id][data-selected]').length,
    };
  `);
  check("AC-52: Ctrl+A inside the title field selects the field's text and starts no library selection",
    inField.fieldFocused && inField.selectedAll && inField.value === draft && !inField.bulkBar && inField.selectedRows === 0,
    JSON.stringify(inField));
  // The selection behaves like a text edit: typing replaces it.
  await keys("x");
  const replaced = await field();
  check("AC-52: the field selection behaves like an editor selection — typing replaces it",
    replaced === "x", `field: ${JSON.stringify(replaced)}`);
  // Restore the draft for the discard-step checks that follow.
  await execute(`
    const input = document.querySelector('.modal input.field');
    if (!input) return false;
    input.value = arguments[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  `, [draft]);

  await keys("Escape");
  const stepAgain = await waitForEval(EVAL.bodyHas, { args: ["Discard changes?"] });
  await clickStable(`() => Array.from(document.querySelectorAll('.discard-bar button')).find((b) => b.textContent.trim() === 'Discard') ?? null`);
  const closedNow = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 10000 });
  const after = await rowTitle();
  check("UI-02: discarding closes the editor and the stored title is untouched",
    !!stepAgain && !!closedNow && after === storedTitle,
    `row title: ${JSON.stringify(after)}, stored: ${JSON.stringify(storedTitle)}`);
}

async function flowMissingAndRelink() {
  // Self-sufficient (D14): the flow works on whichever fixture tier this run
  // imported (both carry doc00500.pdf) and establishes its own unfiltered
  // list view.
  const moved = join(importedTierDir(), "doc00500.pdf");
  const outside = join(root, "fixtures", "moved-away", "smoke-moved.pdf");
  if (!existsSync(moved) && existsSync(outside)) renameSync(outside, moved); // previous run aborted mid-flow
  await setupListView(1);

  // FR-15 busy gate on the bounded core-library job (§3.1.1): the gate is
  // closed while the job runs and open again when it completes — both halves
  // observed, on a job the app can actually start in this library. The
  // progress→idle transition is the observation; jobIdle() bounds it.
  const started = Date.now();
  const job = await startBoundedCoverJob();
  const gateClosed = !(await rescanItemEnabled());
  let completed = true;
  try {
    await jobIdle();
  } catch (error) {
    completed = false;
    console.error(`[job] ${error.message}`);
  }
  const reEnabled = await rescanItemEnabled();
  check(
    "job progress completes; Rescan re-enables after the bounded job drains (FR-15)",
    gateClosed && completed && reEnabled === true,
    `gate closed during job: ${gateClosed}; completed: ${completed}; re-enabled: ${reEnabled}; ${((Date.now() - started) / 1000).toFixed(1)} s; progress: ${JSON.stringify(job)}`,
  );
  if (!completed) throw new Error("the bounded job never completed — the flow cannot continue against a busy app");

  mkdirSync(join(root, "fixtures", "moved-away"), { recursive: true });
  renameSync(moved, outside);

  await runRescan();
  const found = await toastContains("1 missing file found");
  check("AC-05 UI: manual Rescan reports the missing file", !!found);

  // The relink checks need the full library (search ∩ category would show
  // nothing) — the flow's own setup already established the unfiltered view.
  await typeInto(".search-input", "doc00500");
  const flagged = await waitForEval(EVAL.missingRow, { timeout: 10000 });
  check("AC-05 UI: the row is flagged missing", !!flagged);

  // AC-47 (UI-25): the row flag is plain text — the glyph and the label in
  // the warning color of the ramp actually applied, no ground, no pill. The
  // tooltip still carries the stored path.
  const flag = await execute(`
    const flag = document.querySelector('[data-row-id][data-missing] .missing-flag');
    if (!flag) return null;
    const cs = getComputedStyle(flag);
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return {
      ground: cs.backgroundColor, radius: cs.borderRadius, color: cs.color, expected,
      path: flag.getAttribute('title'),
    };
  `);
  check("AC-47: the row flag is plain text in the corrected warning color — no ground, no pill",
    !!flag && flag.ground === "rgba(0, 0, 0, 0)" && flag.radius === "0px" && flag.color === flag.expected,
    JSON.stringify(flag));
  check("AC-47: the row flag's tooltip carries the stored path",
    !!flag && typeof flag.path === "string" && flag.path.includes("doc00500"), JSON.stringify(flag?.path));

  // AC-37 (D8): the missing document's actions line carries Relink, in the
  // same order as its context menu; a present document's line does not.
  const rowActionLabels = (id) => execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!row) return null;
    row.focus();
    const actions = row.querySelector('.row-actions');
    if (!actions || getComputedStyle(actions).display === 'none') return null;
    return Array.from(actions.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
  `, [id]);
  const missingId = await execute(`
    const row = document.querySelector('[data-row-id][data-missing]');
    return row ? row.getAttribute('data-row-id') : null;
  `);
  const missingActions = await rowActionLabels(missingId);
  await parkPointer();
  await rightClick(`[data-row-id="${missingId}"]`);
  const menuLabels = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu) return null;
    return Array.from(menu.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
  `, { timeout: 5000 });
  await keys("Escape");
  await parkPointer();
  const relinkShared = (missingActions ?? []).includes("Relink") && (menuLabels ?? []).includes("Relink");
  const sameOrder = (() => {
    if (!missingActions || !menuLabels) return false;
    let last = -1;
    for (const label of missingActions) {
      const at = menuLabels.indexOf(label);
      if (at < 0 || at <= last) return false;
      last = at;
    }
    return true;
  })();
  check("AC-37: the missing document's actions line includes Relink in the same order as its context menu",
    relinkShared && sameOrder, JSON.stringify({ row: missingActions, menu: menuLabels }));
  // The present half needs the filter cleared (and the debounced query to
  // return the full list); the flow's own state is restored right after.
  await clearSearch();
  const presentId = await waitForEval(`
    const row = document.querySelector('[data-row-id]:not([data-missing])');
    return row ? row.getAttribute('data-row-id') : null;
  `, { timeout: 15000 });
  const presentActions = await rowActionLabels(presentId);
  check("AC-37: a present document's actions line shows no Relink",
    Array.isArray(presentActions) && !presentActions.includes("Relink"), JSON.stringify(presentActions));
  await execute(`document.activeElement?.blur(); return true;`);
  await parkPointer();
  await typeInto(".search-input", "doc00500");
  const flaggedAgain = await waitForEval(EVAL.missingRow, { timeout: 10000 });
  if (!flaggedAgain) throw new Error("the missing row did not return after the present-document check");

  // AC-47 (UI-25): over a card cover the same state keeps a filled ground —
  // the warning tint, and a radius at half the badge's rendered height.
  await setViewMode("grid");
  const badge = await waitForEval(`
    const badge = document.querySelector('.card[data-missing] .missing-flag.over-image');
    if (!badge) return null;
    const cs = getComputedStyle(badge);
    const rect = badge.getBoundingClientRect();
    const probe = document.createElement('span');
    probe.style.background = 'var(--warning-quiet)';
    document.body.append(probe);
    const ground = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      bg: cs.backgroundColor, ground, radius: Number.parseFloat(cs.borderRadius),
      height: rect.height, title: badge.getAttribute('title'),
    };
  `, { timeout: 10000 });
  check("AC-47: the card overlay keeps a warning-tinted ground with radius at half its height",
    !!badge && badge.bg === badge.ground && badge.bg !== "rgba(0, 0, 0, 0)" && badge.radius <= badge.height / 2 + 0.5,
    JSON.stringify(badge));
  check("AC-47: the card badge's tooltip carries the stored path",
    !!badge && typeof badge.title === "string" && badge.title.includes("doc00500"), JSON.stringify(badge?.title));

  // AC-37 (D8): the missing document's card actions line carries Relink too.
  const cardId = await execute(`
    const card = document.querySelector('.card[data-missing][data-row-id]');
    return card ? card.getAttribute('data-row-id') : null;
  `);
  const cardPos = await execute(`
    const card = document.querySelector('.card[data-row-id="' + arguments[0] + '"]');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, [cardId]);
  await hoverPoint(cardPos.x, cardPos.y);
  const cardActions = await waitForEval(`
    const actions = document.querySelector('.card[data-row-id="' + arguments[0] + '"] .row-actions');
    if (!actions || getComputedStyle(actions).display === 'none') return null;
    return Array.from(actions.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
  `, { args: [cardId], timeout: 5000 });
  await parkPointer();
  check("AC-37: the missing document's card actions line includes Relink",
    (cardActions ?? []).includes("Relink"), JSON.stringify(cardActions));
  await setViewMode("list");
  await waitForEval(`return document.querySelectorAll('[data-row-id]').length > 0 ? true : null;`, { timeout: 10000 });

  const warning = await execute(`
    const w = document.querySelector('.status-bar .missing-warning');
    return w ? w.textContent.trim() : null;
  `);
  check("AC-22: with a missing file the status bar shows the warning",
    !!warning && /1 file missing/.test(warning), `status bar: ${JSON.stringify(warning)}`);

  // Enter on the missing row -> failed command -> toast WITH its action (R4.6).
  await execute(EVAL.focusFirstRow);
  await keys("Enter");
  const errorToast = await toastContains("The file is missing");
  const action = await waitForEval(EVAL.toastActionLabel, { timeout: 5000 });
  check("failed command produces a toast with its action (Relink)", !!errorToast && action === "Relink", `action: ${action}`);

  await click('.toast.error .control');
  const dialog = await waitForEval(EVAL.bodyHas, { args: ["Relink missing file"] });
  check("AC-05 UI: the toast action opens the relink dialog", !!dialog);

  await keys("Escape");
  const closed = await waitForEval(`return !document.body.textContent.includes('Relink missing file');`, { timeout: 5000 });
  check("Esc closes the innermost overlay", !!closed);

  // UI-02: the editor offers Relink on a missing document (same dialog).
  await openEditorForRow('[data-row-id][data-missing]');
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Relink"]', "xpath");
  const editorRelink = await waitForEval(EVAL.bodyHas, { args: ["Relink missing file"] });
  check("UI-02: the editor's Relink opens the relink dialog", !!editorRelink);
  await keys("Escape");
  await waitForEval(`return !document.body.textContent.includes('Relink missing file') ? true : null;`, { timeout: 5000 });

  renameSync(outside, moved);
  await runRescan();
  const restored = await toastContains("1 file found again");
  const stillMissing = await execute(EVAL.missingRow);
  check("AC-05 UI: Rescan finds the file again and clears the flag", !!restored && !stillMissing);
  const warningGone = await execute(`return document.querySelector('.status-bar .missing-warning') ? null : true;`);
  check("AC-22: the status bar stops saying it once nothing is missing", !!warningGone);
  rmSync(join(root, "fixtures", "moved-away"), { recursive: true, force: true });

  // Leave the library unfiltered for the following flows.
  await clearSearch();
}

// Two real pointer taps at one point, in a single action chain — what a user
// does with a mouse. Returns whether the browser produced a `dblclick`.
async function doubleClickStable(findSource) {
  let last = null;
  let stable = 0;
  const deadline = Date.now() + 5000;
  while (stable < 3 && Date.now() < deadline) {
    const rect = await execute(`
      return (() => {
        const el = (${findSource})();
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
      })();
    `);
    stable = rect && last && JSON.stringify(rect) === JSON.stringify(last) ? stable + 1 : 0;
    last = rect;
    await sleep(120);
  }
  if (!last) throw new Error(`double-click target not found: ${findSource}`);
  const x = last[0] + Math.round(last[2] / 2);
  const y = last[1] + Math.round(last[3] / 2);
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x, y },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
          { type: "pause", duration: 60 },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
}

async function flowOpen() {
  // D1 (DR-66) / AC-12: counting `app_open_document` calls at the real command
  // boundary shows exactly which gesture activates a document. The OS open
  // itself has no DOM signal, so a failure would surface as an error toast.
  // Self-sufficient (D14): the flow builds its own list-view rows.
  await setupListView(3);
  await instrumentBoundary();
  await resetOpenCounter();

  const target = await waitForEval(`
    const rows = document.querySelectorAll('.row[data-row-id]');
    if (rows.length < 3) return null;
    const r = rows[1];
    r.scrollIntoView({ block: 'center' });
    return { id: r.getAttribute('data-row-id') };
  `, { timeout: 15000 });
  if (!target) throw new Error("no row available for the activation flow");
  const titleAt = `() => document.querySelector('[data-row-id="${target.id}"] .title-line')`;

  await clickStable(titleAt);
  const single = await execute(`
    return (() => {
      const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
      return {
        calls: window.__TAURI_INTERNALS__.__openCalls,
        selected: !!row && row.hasAttribute('data-selected'),
        bulk: !!document.querySelector('.bulk-bar'),
      };
    })();
  `, [target.id]);
  check(
    "AC-12 / AC-30: a single click opens nothing and, in browse mode, selects nothing (DR-66, UI-18)",
    single.calls === 0 && !single.selected && !single.bulk,
    `open calls: ${single.calls}, selected: ${single.selected}`,
  );

  await doubleClickStable(titleAt);
  // D16: the wait is a condition, not a pause — poll whether the boundary
  // counter moved; the skip branch runs only once it definitively has not.
  const doubled = await waitForEval(
    `return window.__TAURI_INTERNALS__.__openCalls > arguments[0] ? true : null;`,
    { timeout: 3000, args: [single.calls] },
  );
  const afterDoubleClick = await execute(`return window.__TAURI_INTERNALS__.__openCalls;`);
  if (doubled) {
    check("AC-12: a real double-click activates the document", true, `open calls: ${afterDoubleClick}`);
  } else {
    skip("AC-12: native double-click generation", `msedgedriver's action chain produced no dblclick (calls stayed ${afterDoubleClick})`);
    await execute(`
      const el = document.querySelector('[data-row-id="' + arguments[0] + '"] .title-line');
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    `, [target.id]);
    const synthetic = await waitForEval(`return window.__TAURI_INTERNALS__.__openCalls > arguments[0] ? true : null;`, { timeout: 5000, args: [afterDoubleClick] });
    check("AC-12: the double-click handler activates the document", !!synthetic);
  }
  await expectNoErrorToast("AC-12: opening a present file via the OS surfaces no failure");

  const before = await execute(`return window.__TAURI_INTERNALS__.__openCalls;`);
  await execute(`document.querySelector('[data-row-id="' + arguments[0] + '"]')?.focus(); return true;`, [target.id]);
  await keys("Enter");
  const afterEnter = await waitForEval(`return window.__TAURI_INTERNALS__.__openCalls > arguments[0] ? true : null;`, { timeout: 5000, args: [before] });
  check("AC-12: Enter still activates the focused row (unchanged)", !!afterEnter);

  // Leave the row unselected for the flows that follow.
  await keys("Escape");
  await waitForEval(`return !document.querySelector('.bulk-bar') ? true : null;`, { timeout: 5000 });
}

async function flowCovers() {
  // Covers are queued at import and re-queued by the bounded jobs of the
  // status-bar flows; the next query carries the cached paths. Self-sufficient
  // (D14): the flow establishes its own unfiltered list view first.
  await setupListView(1);
  const withCover = await waitForEval(EVAL.coverImgs, { timeout: 180000 });
  check("AC-06 UI: list rows render real cover images from the cache", !!withCover, `imgs: ${withCover}`);

  await openMenu('.view-trigger', '.menu.view-menu');
  await clickMenuItem('.menu.view-menu', "Grid view");
  const grid = await waitForEval(EVAL.gridCardsWithCovers, { timeout: 15000 });
  check("AC-06 UI: grid cards render cover images", !!grid);

  await openMenu('.view-trigger', '.menu.view-menu');
  await clickMenuItem('.menu.view-menu', "List view");
  const list = await waitForEval(EVAL.listRowsWithCovers, { timeout: 10000 });
  check("AC-06 UI: switching back to list keeps covers", !!list);
}

// ================================================================ v0.0.2 flows
// AC-08 … AC-18 (SPEC-v0.0.2.md §4). Every flow drives the app through the
// controls the user has and asserts against the live DOM or against the answers
// the app itself received at the command boundary.

// UI-06 / AC-08: stored author and notes render as their own lines, an empty
// field renders no line and reserves no space, every ellipsized line carries
// its full text as a tooltip, and a row is exactly as tall as the lines it
// renders (DR-85) — the measured height must equal what the windowing allocates.
async function flowMetadataDisplay() {
  // Self-sufficient (D14): the flow establishes its own unfiltered list view.
  await setupListView(1);
  const tokens = await execute(`
    const css = getComputedStyle(document.documentElement);
    return { row: parseFloat(css.getPropertyValue('--row-height')), line: parseFloat(css.getPropertyValue('--row-line')) };
  `);
  check("UI-06: row heights come from the base + per-line tokens", Number.isFinite(tokens.row) && Number.isFinite(tokens.line), JSON.stringify(tokens));

  const author = "Ada Lovelace (Countess of Lovelace, 1815–1852)";
  const notes = "A note long enough to be ellipsized inside a list row: " + "wrapped continuation text ".repeat(20);

  await searchFor("doc00300"); // the fixture titles are `Fixture Doc docNNNNN`
  await openEditorForRow("div[data-row-id]");
  await setEditorField("Author", author);
  await setEditorField("Notes", notes);
  await saveEditor();

  const row = await waitForEval(`
    return (() => {
      const el = document.querySelector('[data-row-id]');
      if (!el) return null;
      const title = el.querySelector('.title-line');
      const authorLine = el.querySelector('.author-line');
      const notesLine = el.querySelector('.notes-line');
      if (!title || !authorLine || !notesLine) return null;
      return {
        authorText: authorLine.textContent,
        authorTip: authorLine.getAttribute('title'),
        titleTip: title.getAttribute('title'),
        notesTip: notesLine.getAttribute('title'),
        clipped: notesLine.scrollWidth > notesLine.clientWidth,
        height: Math.round(el.getBoundingClientRect().height),
      };
    })();
  `, { timeout: 10000 });
  check("AC-08: author and notes render as their own lines under the title",
    !!row && row.authorText === author, row ? `author line: ${row.authorText}` : "no author/notes line in the row");
  check("AC-08: every ellipsized line carries its full text as a tooltip",
    !!row && row.clipped && row.notesTip === notes && row.authorTip === author && row.titleTip === "Fixture Doc doc00300",
    row ? `clipped: ${row.clipped}, notes tooltip: ${row.notesTip?.length} chars` : "");
  check("AC-08/AC-24/DR-85: the row is exactly as tall as the metadata lines it renders (64 px base + 18 px per line)",
    !!row && row.height === tokens.row + 2 * tokens.line,
    `measured ${row?.height} px, expected ${tokens.row + 2 * tokens.line} px`);

  // A document with no author and no notes: no line, no reserved space.
  await clearSearch();
  await searchFor("doc00301");
  await openEditorForRow("div[data-row-id]");
  await setEditorField("Author", "");
  await saveEditor();
  const bare = await waitForEval(`
    return (() => {
      const el = document.querySelector('[data-row-id]');
      if (!el) return null;
      return {
        authorLines: el.querySelectorAll('.author-line').length,
        notesLines: el.querySelectorAll('.notes-line').length,
        height: Math.round(el.getBoundingClientRect().height),
      };
    })();
  `, { timeout: 10000 });
  check("AC-08: an empty field renders no line and reserves no space",
    !!bare && bare.authorLines === 0 && bare.notesLines === 0 && bare.height === tokens.row, JSON.stringify(bare));

  // Cards carry the author line and never the notes (UI-06).
  await clearSearch();
  await searchFor("doc00300");
  await setViewMode("grid");
  const card = await waitForEval(`
    return (() => {
      const el = document.querySelector('.card[data-row-id]');
      if (!el) return null;
      const authorLine = el.querySelector('.author-line');
      return {
        authorText: authorLine?.textContent ?? null,
        authorTip: authorLine?.getAttribute('title') ?? null,
        notesLines: el.querySelectorAll('.notes-line').length,
      };
    })();
  `, { timeout: 15000 });
  check("AC-08: the grid card shows the author line and no notes line",
    !!card && card.authorText === author && card.authorTip === author && card.notesLines === 0, JSON.stringify(card));
  await setViewMode("list");
  await clearSearch();
}

// FR-13 / AC-09: the order is exactly primary → secondary → id, the secondary
// follows the primary's direction (DR-81), and the choice survives a restart.
// Every fixture PDF is byte-identical in size, so with File size as the primary
// key every row ties and only the secondary key can order the list — the
// ordering becomes observable instead of inferred.
// The app's title ordering is case-insensitive (query.rs sort_column carries
// SQLite's NOCASE collation — the released FR-13 behavior), so the comparison
// mirrors that collation: fold the case, then order, then id as the tiebreak.
// The core tier's no-Info fixture is exactly the case-sensitive/case-insensitive
// divergence this must not trip over: its title is the lowercase filename.
const titleCompareDesc = (a, b) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y ? null : x > y; // null: NOCASE-tied, the id tiebreak decides
};
async function flowSortSecondary() {
  // Self-sufficient (D14): the flow builds its own unfiltered full list
  // before it touches the sort menu.
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await instrumentBoundary();

  await chooseSort({ primary: "File size", dir: "Descending" });
  const plain = await capturedSearch(`(s) => s.args.sort === 'size' && s.args.dir === 'desc' && s.args.sortSecondary === 'none'`);
  const idTieBreak = plain.rows.every((r, i) => i === 0 || plain.rows[i - 1].id < r.id);
  check("AC-09: with no secondary key the order is the shipped primary, then id",
    idTieBreak, `first ids: ${plain.rows.slice(0, 4).map((r) => r.id).join(", ")}`);

  await chooseSort({ secondary: "title" });
  const keyed = await capturedSearch(`(s) => s.args.sort === 'size' && s.args.sortSecondary === 'title'`);
  const ordered = keyed.rows.every((r, i) => {
    if (i === 0) return true;
    const p = keyed.rows[i - 1];
    if (p.size !== r.size) return p.size > r.size;
    const title = titleCompareDesc(p.title, r.title);
    if (title !== null) return title;
    return p.id < r.id;
  });
  check("AC-09: the secondary key orders the ties exactly primary → secondary → id",
    ordered, `first titles: ${keyed.rows.slice(0, 3).map((r) => r.title).join(", ")}`);
  check("AC-09: the secondary key inherits the primary's direction (DR-81)",
    keyed.args.dir === "desc" && titleCompareDesc(keyed.rows[0].title, keyed.rows[keyed.rows.length - 1].title) === true,
    `dir: ${keyed.args.dir}, first: ${keyed.rows[0].title}`);
  check("AC-09: setting the secondary key changes the order of a tied primary key",
    keyed.rows[0].id !== plain.rows[0].id,
    `without secondary: ${plain.rows[0].title} / with secondary: ${keyed.rows[0].title}`);

  // The choice is a stored preference. The app's own first query after a
  // relaunch runs before any harness code exists in the new page, so the
  // preference is read from the next query the app makes: typing a search term
  // changes only the query text, never the order, so the sort arguments of the
  // answer can only have come from the stored settings.
  await restartApp();
  await instrumentBoundary();
  await searchFor("doc000");
  const restored = await capturedSearch(`(s) => s.args.query === 'doc000'`);
  check("AC-09: the stored order is applied with no user action",
    restored.args.sort === "size" && restored.args.dir === "desc" && restored.args.sortSecondary === "title",
    `args: sort=${restored.args.sort}, dir=${restored.args.dir}, secondary=${restored.args.sortSecondary}`);
  const restoredOrder = restored.rows.length > 1 && restored.rows.every((r, i) => {
    if (i === 0) return true;
    const p = restored.rows[i - 1];
    if (p.size !== r.size) return p.size > r.size;
    const title = titleCompareDesc(p.title, r.title);
    if (title !== null) return title;
    return p.id < r.id;
  });
  check("AC-09: the restored order sorts the rows primary → secondary → id",
    restoredOrder, `first titles: ${restored.rows.slice(0, 3).map((r) => r.title).join(", ")}`);
  await clearSearch();
  await openViewSubmenu("Sort by", SORT_MENU);
  const activePrimary = await activeMenuItems(SORT_MENU);
  await closeViewMenus(SORT_MENU);
  await openViewSubmenu("Then by", THENBY_MENU);
  const activeSecondary = await activeMenuItems(THENBY_MENU);
  await closeViewMenus(THENBY_MENU);
  check("AC-09: the View menu shows the restored keys as the active ones",
    activePrimary.includes("File size") && activePrimary.includes("Descending") &&
      activeSecondary.some((text) => text.startsWith("Title")) && !activeSecondary.includes("None"),
    `active items: ${JSON.stringify({ primary: activePrimary, secondary: activeSecondary })}`);

  await chooseSort({ primary: "Title", dir: "Ascending", secondary: "none" });
  await capturedSearch(`(s) => s.args.sort === 'title' && s.args.dir === 'asc' && s.args.sortSecondary === 'none'`);
  check("AC-09: the default ordering (title A→Z, no secondary) is restored", true);
}

// ---------------------------------------------------------------- shared grid helpers
// The View menu's column control and the grid geometry are measured by two
// flows (flowViewColumns at 1280 px, flowWidthMatrix at 900/1900 px), so the
// measurement and the derivation live here once.

// What gridLayout produces for a measured area and a requested count
// (§5.3.5 as modified by DR-99 and UI-19): the app hands gridLayout the
// CONTENT width (`clientWidth − 2 × CONTENT_GUTTER`), so the expectation
// derives from the same number. The count first — Auto from the 232 px
// pitch, a manual count clamped to what fits at the 140 px floor — then the
// card width fills the container, capped at 320.
const CONTENT_GUTTER = 12; // mirrors virtual.ts CONTENT_GUTTER (UI-19)
const expected = (area, requested, gap) => {
  const container = area - 2 * CONTENT_GUTTER;
  const autoColumns = Math.max(1, Math.floor((container + gap) / (220 + gap)));
  if (requested === null) {
    const derived = Math.floor((container - (autoColumns - 1) * gap) / autoColumns);
    return { columns: autoColumns, cardWidth: Math.min(320, Math.max(140, derived)) };
  }
  const clamped = Math.max(2, Math.min(10, requested));
  const fitsAtFloor = Math.max(1, Math.floor((container + gap) / (140 + gap)));
  const columns = Math.min(clamped, fitsAtFloor);
  const derived = Math.floor((container - (columns - 1) * gap) / columns);
  return { columns, cardWidth: Math.min(320, Math.max(140, derived)) };
};
// The card height the same formula produces (§3.10 as modified by D6): the
// cover from the card's inner top edge (no 10 px padding), then the fixed
// 70 px text block — `coverHeight(cardWidth) + (389 − 10 − 309)`.
const expectedCardHeight = (cardWidth) =>
  Math.round(((cardWidth - 2) * 309) / 218) + (389 - 10 - 309);

// The rendered grid: the derived layout, plus what AC-35/AC-39 measure on the
// live cards — cover insets inside the card box, one border, the 12 px content
// gutter, no horizontal overflow — and the mounted-card count (NFR-01).
const geometry = () => execute(`
  return (() => {
    const block = document.querySelector('.block');
    const card = document.querySelector('.block .card[data-row-id]');
    const scroller = document.querySelector('.document-area .scroller');
    if (!block || !card || !scroller) return null;
    const cols = getComputedStyle(block).gridTemplateColumns.split(' ').filter(Boolean).map(Number);
    const blockRect = block.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    // The cover box is the .cover element itself (the exact cardWidth-minus-2
    // span); its wrapper is a block that fills the card's inner width, and
    // under a scaled WebView (dpr 1.75 in the driver environment) that inner
    // width is fractional. Measuring the cover element measures the cover.
    const coverWrap = card.querySelector('.cover-wrap');
    const coverBox = coverWrap ? coverWrap.querySelector('.cover') || coverWrap : null;
    const coverRect = coverBox ? coverBox.getBoundingClientRect() : null;
    const cards = block.querySelectorAll('[data-row-id]');
    let maxRight = 0;
    for (const c of cards) maxRight = Math.max(maxRight, c.getBoundingClientRect().right);
    const cs = getComputedStyle(card);
    const coverCs = coverBox ? getComputedStyle(coverBox) : null;
    const sRect = scroller.getBoundingClientRect();
    return {
      columns: cols.length,
      cardWidth: Math.round(cardRect.width),
      cardHeight: Math.round(cardRect.height),
      blockHeight: Math.round(blockRect.height),
      // The left edge of the first card: 0 when the columns fill the
      // container, a positive margin when the 320 cap leaves leftover (§3.10).
      leftInset: Math.round(cardRect.left - blockRect.left),
      area: scroller.clientWidth,
      gap: parseFloat(getComputedStyle(block).rowGap) || 12,
      // AC-35: the cover box inside the card's inner box on all four sides —
      // every inset is measured inward, so a positive value means inside.
      coverInsets: coverRect ? {
        top: Math.round(coverRect.top - cardRect.top),
        right: Math.round(cardRect.right - coverRect.right),
        bottom: Math.round(cardRect.bottom - coverRect.bottom),
        left: Math.round(coverRect.left - cardRect.left),
      } : null,
      cardBorder: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      coverBorder: coverCs ? [coverCs.borderTopWidth, coverCs.borderRightWidth, coverCs.borderBottomWidth, coverCs.borderLeftWidth] : null,
      // AC-39: the 12 px content inset and the horizontal overflow.
      gutterLeft: Math.round(cardRect.left - sRect.left),
      rightClear: Math.round(sRect.right - maxRight),
      hScroll: scroller.scrollWidth > scroller.clientWidth + 1,
      mounted: cards.length,
    };
  })();
`);
// The shared fit rule: the derived columns/width/height exactly, the cover
// inside the card on all four sides, the border drawn once (card carries it,
// the cover does not), the gutter held, no horizontal overflow, mounted nodes
// bounded.
const gridFits = (geo, exp) =>
  !!geo &&
  geo.columns === exp.columns &&
  geo.cardWidth === exp.cardWidth &&
  geo.cardHeight === expectedCardHeight(exp.cardWidth) &&
  geo.columns * geo.cardWidth + (geo.columns - 1) * geo.gap <= geo.area + 1 &&
  !!geo.coverInsets &&
    geo.coverInsets.top >= 0 && geo.coverInsets.right >= 0 &&
    geo.coverInsets.bottom >= 0 && geo.coverInsets.left >= 0 &&
  // "one border": the card carries one uniform border on all four sides (the
  // driver's WebView renders a specified 1 px at 0.5714 px under its DPI
  // scaling — DR-122's probe), and the cover element carries none.
  (() => {
    const bw = geo.cardBorder.map((w) => parseFloat(w));
    return bw.every((w) => w > 0 && w <= 1.5) && new Set(bw).size === 1;
  })() &&
  !!geo.coverBorder && geo.coverBorder.every((w) => w === "0px") &&
  geo.gutterLeft >= 11 && geo.rightClear >= 11 && !geo.hScroll &&
  geo.mounted < 60;

const openViewMenu = async () => {
  await openMenuSure('.view-trigger', '.menu.view-menu');
};
const closeViewMenu = async () => {
  const closed = await waitForEval(`return document.querySelector('.menu.view-menu') ? null : true;`, { timeout: 3000 });
  if (!closed) {
    await keys("Escape");
    await waitForEval(`return document.querySelector('.menu.view-menu') ? null : true;`, { timeout: 4000 });
  }
};
const readColumns = () => execute(`
  return (() => {
    const m = document.querySelector('.menu.view-menu');
    if (!m) return null;
    const autoItem = Array.from(m.querySelectorAll('.menu-item')).find((e) => e.textContent.trim().startsWith('Auto'));
    return {
      count: Number(m.querySelector('.columns-count')?.textContent),
      decDisabled: !!m.querySelector('button[aria-label="Fewer columns"]')?.disabled,
      incDisabled: !!m.querySelector('button[aria-label="More columns"]')?.disabled,
      autoActive: !!autoItem?.hasAttribute('data-active'),
    };
  })();
`);
const menuState = async () => {
  await openViewMenu();
  const state = await readColumns();
  await closeViewMenu();
  return state;
};
// The View menu's Auto item is a menu selection: the menu closes on click.
// Reopen it and poll the menu's own marking until Auto reports active (D16) —
// menuState opens the menu itself on every attempt.
const awaitAutoActive = async (budgetMs = 8000) => {
  const deadline = Date.now() + budgetMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await menuState();
    if (state?.autoActive) return state;
  }
  return state;
};
// Operates the View menu's − / + control until the app's own control reports
// it has reached `target`, or refuses to go further. The bounds are the claim
// under test, so the walk follows what the control says rather than a fixed
// number of clicks: a step the app did not take is met by the next click, and
// a bound the app really enforces is still asserted exactly.
const stepColumns = async (delta, target) => {
  const label = delta > 0 ? "More columns" : "Fewer columns";
  await openViewMenu();
  for (let guard = 0; guard < 12; guard++) {
    const state = await readColumns();
    if (!state) throw new Error("the View menu's column control is not present");
    const atTarget = delta > 0 ? state.count >= target || state.incDisabled : state.count <= target || state.decDisabled;
    if (atTarget) break;
    const from = state.count;
    // The first step of a walk goes through the full stability loop (the menu
    // has just opened); later steps target a button in a settled, open menu —
    // one position read plus the hit test is enough there.
    await clickStable(`() => document.querySelector('.menu.view-menu button[aria-label="${label}"]')`, { settled: guard > 0 });
    // D16: the step is confirmed by polling the count the menu reports — the
    // walk only proceeds once the app has applied the click. A bound the app
    // really enforces is still caught by the atTarget check above.
    await waitForEval(`
      const m = document.querySelector('.menu.view-menu');
      const c = Number(m?.querySelector('.columns-count')?.textContent);
      return !Number.isFinite(c) || c !== ${from} ? true : null;
    `, { timeout: 3000 });
  }
  const end = await readColumns();
  await closeViewMenu();
  return end;
};

// Resize the app window through the window plugin — the payload is the plugin's
// own externally-tagged `Logical` form, the same one @tauri-apps/api sends.
async function setWindowSize(width) {
  const before = await execute(`return document.querySelector('.document-area .scroller')?.clientWidth ?? null;`);
  await execute(`
    window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: arguments[0], height: 800 } } });
    return true;
  `, [width]);
  const ok = await waitForEval(`return Math.abs(window.innerWidth - arguments[0]) <= 2 ? true : null;`, { args: [width], timeout: 8000 });
  if (!ok) throw new Error(`the window did not resize to ${width} px (innerWidth: ${await execute("return window.innerWidth;")})`);
  // D16: layout re-derivation is observed, not waited out — poll until the
  // first geometry read reflects the new container width.
  const minDelta = Math.max(20, Math.min(200, Math.abs((before ?? 0) - width) / 4));
  const rederived = await waitForEval(
    `
      const c = document.querySelector('.document-area .scroller')?.clientWidth;
      if (!Number.isFinite(c)) return null;
      return arguments[0] === null || Math.abs(c - arguments[0]) >= arguments[1] ? true : null;
    `,
    { args: [before, minDelta], timeout: 8000 },
  );
  if (!rederived) {
    const now = await execute(`return document.querySelector('.document-area .scroller')?.clientWidth ?? null;`);
    throw new Error(`the layout did not re-derive after resizing to ${width} px (scroller clientWidth: ${before} → ${now})`);
  }
}

// The list counterpart of the gutter claim (AC-39): the first row starts at
// the content inset and the fixed meta column keeps the other edge clear.
const listGutter = () => execute(`
  return (() => {
    const scroller = document.querySelector('.document-area .scroller');
    const row = document.querySelector('.row[data-row-id]');
    if (!scroller || !row) return null;
    const sRect = scroller.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    const meta = row.querySelector('.meta');
    return {
      firstLeft: Math.round(rRect.left - sRect.left),
      rightClear: meta ? Math.round(sRect.right - meta.getBoundingClientRect().right) : Math.round(sRect.right - rRect.right),
      hScroll: scroller.scrollWidth > scroller.clientWidth + 1,
    };
  })();
`);

// UI-08 as modified / AC-10 + AC-31: the View menu is the only writer of the
// view mode and of the column count. Auto reproduces the width-derived count and
// the derived card width (capped at 320, §3.10); a manual count applies
// immediately, clamps at 2 and 10, and survives a restart.
async function flowViewColumns() {
  // Self-sufficient (D14): the flow builds its own unfiltered grid.
  await setupGrid(2);

  const autoGeometry = await geometry();
  const startState = await menuState();
  const autoExpected = expected(autoGeometry.area, null, autoGeometry.gap);
  check("AC-10: Auto is the active choice and matches the width-derived count",
    startState.autoActive && startState.count === autoExpected.columns,
    `menu: ${startState.count}, derived: ${autoExpected.columns}, measured cards: ${autoGeometry.columns}`);
  check("AC-31: Auto derives the card width from the container and the row block is the derived card height",
    autoGeometry.cardWidth === autoExpected.cardWidth &&
      autoGeometry.columns === autoExpected.columns &&
      autoGeometry.cardHeight === expectedCardHeight(autoExpected.cardWidth) &&
      autoGeometry.blockHeight === autoGeometry.cardHeight + autoGeometry.gap,
    JSON.stringify({ ...autoGeometry, expected: autoExpected, expectedHeight: expectedCardHeight(autoExpected.cardWidth) }));

  // stepColumns ends with the menu's own state read — no second menu cycle.
  const widerState = await stepColumns(+1, autoExpected.columns + 1);
  const wider = await geometry();
  const widerExpected = expected(wider.area, autoExpected.columns + 1, wider.gap);
  check("AC-31: a manual count applies immediately and the cards follow it",
    widerState.count === autoExpected.columns + 1 &&
      wider.columns === widerExpected.columns &&
      wider.cardWidth === widerExpected.cardWidth &&
      wider.cardHeight === expectedCardHeight(widerExpected.cardWidth),
    `menu: ${widerState.count}, cards: ${wider.columns} × ${wider.cardWidth} × ${wider.cardHeight} px, expected: ${widerExpected.columns} × ${widerExpected.cardWidth} × ${expectedCardHeight(widerExpected.cardWidth)} px`);

  const atMax = await stepColumns(+1, 10);
  check("AC-10: the manual count clamps at 10 and the + control disables there",
    atMax.count === 10 && atMax.incDisabled, JSON.stringify(atMax));
  // AC-39 as modified (DR-128): the derived layout is measured at manual 10 at
  // 1280 px too — the edge the matrix measures at the other widths.
  const maxGeometry = await geometry();
  const maxExpected = expected(maxGeometry.area, 10, maxGeometry.gap);
  check("AC-39: the derived layout holds at manual 10 at 1280 px",
    gridFits(maxGeometry, maxExpected), JSON.stringify({ geo: maxGeometry, expected: maxExpected }));
  const atMin = await stepColumns(-1, 2);
  const minGeometry = await geometry();
  const minExpected = expected(minGeometry.area, 2, minGeometry.gap);
  check("AC-10: the manual count clamps at 2 and the − control disables there",
    atMin.count === 2 && atMin.decDisabled && !atMin.autoActive, JSON.stringify(atMin));
  const usedAtMin = minGeometry.columns * minGeometry.cardWidth + (minGeometry.columns - 1) * minGeometry.gap;
  check("AC-31: a count below Auto widens the cards up to the 320 cap and the leftover becomes even margin",
    minGeometry.cardWidth === minExpected.cardWidth &&
      minGeometry.columns === 2 &&
      minGeometry.cardWidth <= 320 &&
      usedAtMin <= minGeometry.area &&
      (minGeometry.cardWidth < 320
        // Not capped: the cards fill the container, so at most a per-column
        // rounding remainder is left over.
        ? minGeometry.area - usedAtMin < minGeometry.columns
        // Capped at 320: the leftover is real space and the grid centers it.
        : minGeometry.leftInset > 0),
    JSON.stringify({ ...minGeometry, expected: minExpected }));

  await openViewMenu();
  await clickMenuItem('.menu.view-menu', "Auto");
  // The Auto click closes the menu (it is a menu selection); the marking is
  // polled through re-opened menu states until Auto reports active (D16).
  const backToAuto = await awaitAutoActive();
  if (!backToAuto) throw new Error("the View menu did not reopen after the Auto click");
  const autoAgain = await geometry();
  const autoAgainExpected = expected(autoAgain.area, null, autoAgain.gap);
  check("AC-10: Auto restores the derived count and the derived card width",
    backToAuto.autoActive && backToAuto.count === autoAgain.columns && autoAgain.cardWidth === autoAgainExpected.cardWidth,
    `menu: ${backToAuto.count}, cards: ${autoAgain.columns} × ${autoAgain.cardWidth} px, expected: ${autoAgainExpected.columns} × ${autoAgainExpected.cardWidth} px`);

  // A manual count is a stored preference (DR-44): it survives a relaunch.
  const manualCount = (await stepColumns(-1, autoAgain.columns - 1)).count; // the count just below Auto
  await restartApp();
  await instrumentBoundary();
  const restoredGrid = await waitForEval(`return document.querySelector('.block .card[data-row-id]') ? true : null;`, { timeout: 20000 });
  if (!restoredGrid) await setViewMode("grid");
  const restoredState = await menuState();
  const restoredGeometry = await geometry();
  check("AC-10: the manual column count survives a restart and is applied",
    restoredState.count === manualCount && !restoredState.autoActive && restoredGeometry.columns === manualCount,
    `before: ${manualCount}, after restart: ${restoredState.count} / cards: ${restoredGeometry.columns}`);

  await openViewMenu();
  await clickMenuItem('.menu.view-menu', "Auto");
  await closeViewMenu();
  await setViewMode("list");
}

// FR-02 as modified / AC-17 + AC-13: several categories are active at once and
// the result is exactly their union (the overlap counted once); the set
// composes with a saved search and with the terms as (A OR B) AND mode AND
// terms; an empty set behaves exactly as the shipped single-category default;
// the active set survives a restart as chips, and a v0.0.1 `cat:<id>` value
// restores as that one category.
async function flowCategoriesMulti() {
  const NAME_A = "Union A";
  const NAME_B = "Union B";
  // Self-sufficient (D14): the flow builds its own unfiltered list view and
  // its own categories instead of inheriting either from a previous flow.
  await setupListView(1);
  const A = ["Fixture Doc doc00100", "Fixture Doc doc00101", "Fixture Doc doc00102"];
  const B = ["Fixture Doc doc00200", "Fixture Doc doc00201", "Fixture Doc doc00202", "Fixture Doc doc00100"];
  const titlesOf = (page) => page.rows.map((r) => r.title).sort();
  const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  await instrumentBoundary();
  await ensureCategoryNames([NAME_A, NAME_B]);

  // Assign: A gets doc00100..doc00102, B gets doc00200..doc00202 and doc00100
  // (the overlap) — through the bulk picker, the shipped UI-04 path.
  await searchFor("doc0010");
  await selectFirstRows(3);
  await applyCategoryToSelection(NAME_A);
  await clearSelection();
  await clearSearch();
  await searchFor("doc0020");
  await selectFirstRows(3);
  await applyCategoryToSelection(NAME_B);
  await clearSelection();
  await clearSearch();
  await searchFor("doc00100");
  await selectFirstRows(1);
  await applyCategoryToSelection(NAME_B);
  await clearSelection();
  await clearSearch();

  // The ids are read from the app's own queries: choosing a category in Browse
  // makes the app ask for exactly that id, and the boundary capture is where
  // the harness sees it. Category creation updates the app's list from the
  // command's own answer (no `categories_list` re-query), so no such call is
  // expected or needed here.
  const singleCategory = `(s) => s.args.categoryIds.length === 1`;
  await setActiveCategories([NAME_A]);
  const pageA = await capturedSearch(singleCategory);
  const [idA] = pageA.args.categoryIds;
  await setActiveCategories([NAME_B]);
  const pageB = await capturedSearch(singleCategory);
  const [idB] = pageB.args.categoryIds;
  await setActiveCategories([NAME_A, NAME_B]);
  const pageAB = await capturedSearch(`(s) => ${askedFor([idA, idB])}`);

  const union = [...new Set([...titlesOf(pageA), ...titlesOf(pageB)])];
  check("AC-17: each single category filter still selects exactly its own set",
    sameSet(titlesOf(pageA), A) && sameSet(titlesOf(pageB), B),
    `A: ${titlesOf(pageA).length} rows, B: ${titlesOf(pageB).length} rows`);
  check("AC-17: two active categories select exactly their union",
    sameSet(titlesOf(pageAB), union), `union: ${titlesOf(pageAB).length} rows, expected: ${union.length}`);
  check("AC-17: a document in both categories is counted once",
    pageAB.total === pageA.total + pageB.total - 1 && pageAB.rows.length === pageAB.total,
    `|A|=${pageA.total} + |B|=${pageB.total} − 1 overlap = ${pageAB.total}`);
  const shownAB = await resultCount();
  check("AC-13: the status count and the rows agree with the union",
    shownAB === pageAB.total, `status: ${shownAB}`);
  const activeNames = await activeCategoryNames();
  check("AC-13 / UI-09: the active categories appear as exactly one checked item each",
    activeNames.includes(NAME_A) && activeNames.includes(NAME_B) && activeNames.length === 2, JSON.stringify(activeNames));

  const chips = await execute(`
    return document.querySelectorAll('.filter-chips, .chip, .count-chip, [data-chip]').length;
  `);
  check("AC-23: no filter chip renders anywhere while a filter is active", chips === 0, `chip elements: ${chips}`);

  await browseToggleCategory(NAME_A);
  const onlyB = await capturedSearch(`(s) => ${askedFor([idB])}`);
  const activeAfter = await activeCategoryNames();
  check("AC-13 / UI-09: clearing one category in the Browse menu drops that filter and nothing else",
    sameSet(titlesOf(onlyB), B) && activeAfter.length === 1 && activeAfter[0] === NAME_B, JSON.stringify(activeAfter));

  // Composition with a saved search: Favorites ∩ (A OR B).
  await setActiveCategories([NAME_A]);
  await searchFor("doc00101");
  const starred = await execute(`
    return (() => {
      const row = document.querySelector('[data-row-id]');
      if (!row) return null;
      row.focus();
      return row.getAttribute('data-row-id');
    })();
  `);
  await click(`//div[@data-row-id="${starred}"]//button[contains(@class,"star")]`, "xpath");
  // The star is a switch with no toast (the app toasts imports and errors,
  // not stars): the observable contract is aria-checked flipping (AC-33).
  const flipped = (want) => waitForEval(`
    const b = document.querySelector('[data-row-id="' + arguments[0] + '"] button[class*="star"]');
    return b && b.getAttribute('aria-checked') === ${JSON.stringify(want)} ? true : null;
  `, { args: [starred], timeout: 8000 });
  if (!(await flipped("true"))) throw new Error(`the star of row ${starred} did not flip to checked after the click`);
  await clearSearch();
  await browseSelect("Favorites");
  const favPage = await capturedSearch(`(s) => s.args.favoritesOnly === true && ${askedFor([idA])}`);
  check("AC-17: the category set combines with a saved search as (A OR …) AND mode",
    favPage.rows.length === 1 && favPage.rows[0].title === "Fixture Doc doc00101",
    `favorites ∩ A: ${JSON.stringify(titlesOf(favPage))}`);
  await execute(`
    const row = document.querySelector('[data-row-id]');
    if (row) row.focus();
    return true;
  `);
  await click(`//div[@data-row-id="${starred}"]//button[contains(@class,"star")]`, "xpath");
  if (!(await flipped("false"))) throw new Error(`the star of row ${starred} did not flip back after the second click`);
  await browseSelect("All documents");

  // Composition with the terms: terms AND (A OR B).
  await setActiveCategories([NAME_A, NAME_B]);
  await searchFor("doc0010");
  const termPage = await capturedSearch(`(s) => s.args.query === 'doc0010' && ${askedFor([idA, idB])}`);
  check("AC-17: the terms narrow the union instead of replacing it",
    sameSet(titlesOf(termPage), A), `term ∩ union: ${JSON.stringify(titlesOf(termPage))}`);
  await searchFor("doc00");
  const broadPage = await capturedSearch(`(s) => s.args.query === 'doc00' && ${askedFor([idA, idB])}`);
  check("AC-17: a broader term returns the whole union, the overlap counted once",
    sameSet(titlesOf(broadPage), union), `term ∩ union: ${titlesOf(broadPage).length} rows, expected: ${union.length}`);
  await clearSearch();

  // An empty set is the shipped default: the same library, no filter at all.
  await clearCategoryFilter();
  const empty = await capturedSearch(`(s) => s.args.categoryIds.length === 0`);
  const total = await docCount();
  const shownEmpty = await resultCount();
  check("AC-17: an empty category set is identical to the shipped unfiltered list",
    empty.total > pageAB.total && shownEmpty === null && (await activeCategoryNames()).length === 0,
    `total: ${total}`);

  // The active set is a stored preference: after a relaunch the Browse menu
  // shows it as checked items (UI-09 — the only place a filter is displayed).
  await setActiveCategories([NAME_A, NAME_B]);
  await capturedSearch(`(s) => ${askedFor([idA, idB])}`);
  await restartApp();
  await instrumentBoundary();
  await requeryAfterRestart("doc001");
  const startupNames = await activeCategoryNames();
  const restoredUnion = await capturedSearch(`(s) => s.args.query === '' && ${askedFor([idA, idB])}`);
  check("AC-13 / AC-23: the restored last filter is the active filter at startup, displayed in the Browse menu",
    startupNames.includes(NAME_A) && startupNames.includes(NAME_B) && sameSet(titlesOf(restoredUnion), union),
    `checked: ${JSON.stringify(startupNames)}, rows: ${restoredUnion.rows.length}`);

  // A v0.0.1 `cat:<id>` value written by the earlier release restores as that
  // one category — the upgrade path through the real settings command.
  // The write is awaited at the boundary (D16): the command's answer is the
  // condition, not a pause before the restart.
  await execute(
    `return window.__TAURI_INTERNALS__.invoke('app_set_setting', { key: 'last_filter', value: 'cat:' + arguments[0] });`,
    [String(idA)],
  );
  await restartApp();
  await instrumentBoundary();
  await requeryAfterRestart("doc001");
  const legacyNames = await activeCategoryNames();
  const legacyPage = await capturedSearch(`(s) => s.args.query === '' && ${askedFor([idA])}`);
  check("AC-17: a v0.0.1 `cat:<id>` setting restores as exactly that one category",
    legacyNames.length === 1 && legacyNames[0] === NAME_A && sameSet(titlesOf(legacyPage), A),
    `checked: ${JSON.stringify(legacyNames)}, rows: ${titlesOf(legacyPage).length}`);

  await browseSelect("All documents");
  const cleared = await resultCount();
  check("AC-13: All documents clears every filter", cleared === null, `status: ${cleared}`);
}

// After a relaunch the app's own first query runs before any harness code
// exists in the new page. Typing a term and clearing it again leaves the stored
// filter untouched, so the newest capture afterwards carries exactly what the
// app restored on its own.
async function requeryAfterRestart(term) {
  // The caller's capturedSearch polls for the matching capture — typing a
  // term and clearing it again makes the app re-issue the restored query, and
  // no pause is needed for it to appear there (D16).
  await searchFor(term);
  await clearSearch();
}

// FR-10 as modified / AC-18: importing while several categories are active
// assigns every imported document to all of them; with none active, nothing.
async function flowImportAssign() {
  const NAME_A = "Union A";
  const NAME_B = "Union B";
  // Self-sufficient (D14): the flow builds its own list view and its own
  // categories (the union flows create the same names; ensure is idempotent).
  await setupListView(1);
  await ensureCategoryNames([NAME_A, NAME_B]);
  const before = await docCount();
  await instrumentBoundary();
  await setActiveCategories([NAME_A, NAME_B]);
  const page = await capturedSearch(`(s) => s.args.categoryIds.length === 2`);
  const activeIds = page.args.categoryIds.slice().sort((a, b) => a - b);

  const path = join(FIXTURE_SPECIAL, "info-title.pdf"); // not imported by any earlier flow
  const delivered = await emitDrop([path]);
  if (!delivered) {
    skip("AC-18: the drop path itself", "native drag channel is not synthesizable through WebDriver");
    await execute(
      `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: arguments[1] });`,
      [[path], activeIds],
    );
  }
  const imported = await toastContains("Imported 1 PDF");
  const assigned = await capturedSearch(`(s) => s.rows.some((r) => r.title === 'Real Info Title')`);
  const doc = assigned.rows.find((r) => r.title === "Real Info Title");
  check("AC-18: an import with two categories active assigns the document to both",
    !!doc && doc.categories.includes(NAME_A) && doc.categories.includes(NAME_B),
    `categories on the imported row: ${JSON.stringify(doc?.categories ?? null)}, import toast: ${!!imported}`);
  const after = await docCount();
  check("AC-18: the import adds exactly one document to the library", after === before + 1, `${before} → ${after}`);

  await clearCategoryFilter();
  // The document is found by its own title: in a full library the first page
  // of an unfiltered list would never contain it, so reading it from the list
  // would test the page size, not the assignment.
  await searchFor("Real Info Title");
  const unassigned = await capturedSearch(`(s) => s.args.categoryIds.length === 0 && s.args.query === 'Real Info Title'`);
  const still = unassigned.rows.find((r) => r.title === "Real Info Title");
  check("AC-18: the assignment is stored on the document, not on the filter",
    !!still && still.categories.includes(NAME_A) && still.categories.includes(NAME_B), JSON.stringify(still?.categories));
}

// UI-10 / AC-14: the categories manager offers the shipped CRUD unchanged —
// add (covered in flowCategories), rename with the duplicate-name inline error,
// and delete with its confirmation and its reassignment behavior.
async function flowCategoryCrud() {
  const clickRowAction = async (name, label) => {
    const revealed = await execute(`
      const rows = Array.from(document.querySelectorAll('.modal .category-row'));
      const row = rows.find((r) => r.querySelector('.category-name')?.textContent.trim() === arguments[0]);
      const opener = row ? row.querySelector('.category-select') : null;
      if (!opener) return "no such row";
      // The actions are display:none until the row has hover or focus. The
      // action button itself cannot take focus while hidden, so focus the
      // row's always-visible control — that is what :focus-within matches.
      opener.focus();
      const button = Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === arguments[1]);
      if (!button) return "no such action";
      return button.offsetParent !== null ? true : "the action stayed hidden";
    `, [name, label]);
    if (revealed !== true) throw new Error(`the "${label}" action on the row for ${name} is not reachable: ${revealed}`);
    await clickStable(`() => {
      const rows = Array.from(document.querySelectorAll('.modal .category-row'));
      const row = rows.find((r) => r.querySelector('.category-name')?.textContent.trim() === ${JSON.stringify(name)});
      if (!row) return null;
      // Re-focus on every lookup: a status update re-renders the row list and
      // the :focus-within reveal is lost between finding the button and
      // clicking it — a hidden button reports a 0×0 box at the overlay origin.
      row.querySelector('.category-select')?.focus();
      return Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)}) ?? null;
    }`);
  };

  // Self-sufficient (D14): the flow builds the categories it renames and
  // deletes; the union flows create the same names, ensure is idempotent.
  await ensureCategoryNames(["Union A", "Union B"]);
  await openCategoriesManager();

  await clickRowAction("Union A", "Rename category");

  // Two dialogs are open from here on: the manager, and the rename dialog on
  // top of it. The dialog on top is the last one in the document, and the
  // manager's own field is inert while another dialog covers it — so every
  // field reference resolves as "the last field in the page".
  const TOP_FIELD = '(//input[contains(@class,"field")])[last()]';
  const topField = () => execute(`
    const fields = document.querySelectorAll('.field');
    const field = fields[fields.length - 1];
    if (!field) return null;
    const dialog = field.closest('.modal');
    return {
      value: field.value,
      error: dialog ? (dialog.querySelector('.inline-error')?.textContent?.trim() ?? null) : null,
    };
  `);

  // What the page actually holds when a dialog check fails: which dialogs are
  // open, and where the field the check wanted is.
  const openDialogs = () => execute(`
    return {
      modals: Array.from(document.querySelectorAll('.modal')).map((el) => ({
        title: el.querySelector('h1, h2, .modal-title')?.textContent?.trim() ?? null,
        fields: el.querySelectorAll('.field').length,
      })),
      fields: document.querySelectorAll('.field').length,
      focus: document.activeElement ? document.activeElement.tagName.toLowerCase() + " " + (document.activeElement.getAttribute('aria-label') ?? String(document.activeElement.className ?? "")) : "none",
    };
  `);

  const prefilled = await waitForEval(`
    const fields = document.querySelectorAll('.field');
    const field = fields[fields.length - 1];
    return field && field.value === 'Union A' ? true : null;
  `, { timeout: 5000 });
  check("AC-14: rename opens the shipped dialog prefilled with the current name", !!prefilled,
    `field: ${JSON.stringify(await topField())} — page: ${JSON.stringify(await openDialogs())}`);

  await typeInto(TOP_FIELD, "Union B", "xpath");
  await click('//button[normalize-space()="Rename"]', "xpath");
  const duplicate = await waitForEval(`
    const fields = document.querySelectorAll('.field');
    const field = fields[fields.length - 1];
    const box = field ? field.closest('.modal')?.querySelector('.inline-error') : null;
    return box && box.textContent.trim() ? true : null;
  `, { timeout: 5000 });
  const refused = await topField();
  check("AC-14: a duplicate name is refused inline and the dialog stays open",
    !!duplicate && refused?.value === "Union B", JSON.stringify(refused));

  await typeInto(TOP_FIELD, "Union A Renamed", "xpath");
  await click('//button[normalize-space()="Rename"]', "xpath");
  const renamed = await waitForEval(`
    return Array.from(document.querySelectorAll('.modal .category-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? true : null;
  `, { timeout: 8000 });
  check("AC-14: renaming updates the manager list", !!renamed);

  await clickRowAction("Union A Renamed", "Delete category");
  const confirm = await waitForEval(`return document.body.textContent.includes('Delete category “Union A Renamed”') ? true : null;`, { timeout: 5000 });
  check("AC-14: delete asks for confirmation naming the category", !!confirm);
  await click('//button[normalize-space()="Discard"]', "xpath");
  const kept = await waitForEval(`
    return document.querySelector('.modal') &&
      Array.from(document.querySelectorAll('.modal .category-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? true : null;
  `, { timeout: 5000 });
  check("AC-14: discarding the confirmation keeps the category", !!kept);

  // Deleting detaches the category from its documents and never the documents.
  const beforeTotal = await docCount();
  await clickRowAction("Union A Renamed", "Delete category");
  await click('//button[normalize-space()="Delete category"]', "xpath");
  const gone = await waitForEval(`
    return Array.from(document.querySelectorAll('.modal .category-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? null : true;
  `, { timeout: 8000 });
  await closeDialog("the categories manager");
  const afterTotal = await docCount();
  const rows = await execute(`return document.querySelectorAll('[data-row-id]').length;`);
  check("AC-14: deleting a category detaches it from documents and deletes no document",
    !!gone && afterTotal === beforeTotal && rows > 0, `library total: ${beforeTotal} → ${afterTotal}, rows rendered: ${rows}`);
}

// UI-11 / AC-15: one thin token-colored bar in every scroll container, none
// showing the platform default, no component defining its own scrollbar, and a
// color-scheme that follows the ramp actually applied (UI-11 released text:
// "color-scheme declared so UA-drawn chrome follows the theme"; since v0.0.3
// the theme is chosen in the app, so the declaration belongs to each ramp).
// The OS owns prefers-color-scheme and nothing in this stack can flip it, so
// the flow measures the ramp the app actually runs in and checks that the other
// ramp is authored in the same loaded stylesheet.
async function flowScrollbars() {
  // The ramp in effect right now — the concrete value the theme module writes.
  const ramp = await execute(`
    return document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  `);

  // A scrollbar exists only where something actually scrolls, so the flow
  // measures containers that are known to overflow: the document area holding
  // the whole library, and the two category surfaces holding a list long
  // enough to pass their own max-height.
  await ensureCategories(30);
  await browseSelect("All documents");
  await clearSearch(); // the document area must hold the whole library to overflow

  const declared = await execute(`return getComputedStyle(document.documentElement).colorScheme;`);
  check("AC-15: the applied ramp declares its color-scheme so UA-drawn chrome follows it",
    declared === ramp, `computed: ${declared}, applied ramp: ${ramp}`);

  const token = await execute(`
    const probe = document.createElement('div');
    probe.style.color = 'var(--scrollbar-thumb)';
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  `);
  const expectedRgb = ramp === "dark" ? "rgb(59, 66, 78)" : "rgb(201, 207, 216)";
  check(`UI-11: the ${ramp} ramp defines the agreed thumb token`, token === expectedRgb, `--scrollbar-thumb → ${token}`);

  // The other ramp cannot be forced from the harness (the OS owns
  // prefers-color-scheme, and the app's own override is exercised in
  // flowThemeAndSettings), so it is verified where it is defined: both ramps
  // must be present in the stylesheet the running app actually loaded. Since
  // v0.0.3 the dark ramp is a selector block, not a media block (DR-101).
  const authored = await execute(`
    const found = [];
    const scan = (rules, mediaText) => {
      for (const rule of rules) {
        if (rule.media) { scan(rule.cssRules, rule.media.mediaText); continue; }
        if (!rule.selectorText || !rule.style) continue;
        const thumb = rule.style.getPropertyValue('--scrollbar-thumb');
        if (thumb) found.push({ media: mediaText, selector: rule.selectorText, thumb: thumb.trim() });
      }
    };
    for (const sheet of document.styleSheets) {
      try { scan(sheet.cssRules, ''); } catch { /* a sheet the page will not expose */ }
    }
    return found;
  `);
  const lightRamp = authored.find((r) => r.selector === ":root");
  const darkRamp = authored.find((r) => r.selector === ':root[data-theme="dark"]');
  check("UI-11: both ramps define the thumb token in the loaded stylesheet",
    !!lightRamp && !!darkRamp && lightRamp.thumb === "#c9cfd8" && darkRamp.thumb === "#3b424e",
    JSON.stringify(authored));

  // Each surface is measured while it is open and overflowing. The gutter a
  // vertical bar takes (`offsetWidth - clientWidth`) is what the user sees;
  // a property's computed value is not, and `scrollbar-width` is not an
  // inherited property — a rule on `html` reaches only the root scroller.
  await execute(`
    window.__smokeMeasure = (name, selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      // offsetWidth − clientWidth is the vertical bar PLUS the element's own
      // left/right border. The gutter AC-15 is about is the bar alone, so the
      // declared border widths come off (the menus carry a 1 px hairline; at
      // 175 % display scaling it lands as 0.571 CSS px per side).
      const borderPx = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      return {
        name,
        color: cs.scrollbarColor,
        width: cs.scrollbarWidth,
        border: cs.borderLeftWidth + "/" + cs.borderRightWidth,
        overflowing: el.scrollHeight > el.clientHeight,
        content: el.scrollHeight,
        viewport: el.clientHeight,
        gutter: Math.round(el.offsetWidth - el.clientWidth - borderPx),
      };
    };
    return true;
  `);
  const read = (specs) => execute(
    `return arguments[0].map(([name, selector]) => window.__smokeMeasure(name, selector)).filter(Boolean);`,
    [specs],
  );

  const surfaces = await read([["document area", ".document-area .scroller"]]);
  await openMenuSure('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', "Categories");
  await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  await sleep(200);
  const menuSurfaces = await read([
    ["browse menu", ".menu.browse-menu"],
    ["categories submenu", ".menu.browse-sub"],
  ]);
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
  await openCategoriesManager();
  await sleep(200);
  const dialogSurfaces = await read([["categories manager list", ".categories-dialog"]]);
  await closeDialog("the categories manager");

  const all = [...surfaces, ...menuSurfaces, ...dialogSurfaces];
  const measured = all.filter((s) => s.overflowing);
  const describe = (list) => list
    .map((s) => `${s.name}: ${s.content}px of content in ${s.viewport}px, gutter ${s.gutter}px, scrollbar-width ${s.width}, border L/R ${s.border}, color ${s.color}`)
    .join(" | ");

  check("AC-15: the measured surfaces include ones that scroll", measured.length >= 2, describe(all));
  check("AC-15: every scrolling surface draws the token-colored bar",
    measured.length >= 2 && measured.every((s) => s.color.startsWith(token)), describe(measured));
  const gutters = new Set(measured.map((s) => s.gutter));
  check("AC-15: every scrolling surface reserves the same thin gutter",
    gutters.size === 1 && [...gutters][0] > 0 && [...gutters][0] <= 12,
    `reserved widths: ${JSON.stringify([...gutters])} — ${describe(measured)}`);

  const owners = await execute(`
    return (() => {
      const hits = [];
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
          if (!rule.selectorText) continue;
          const declares = rule.style && (rule.style.scrollbarColor || rule.style.scrollbarWidth);
          if (declares || rule.selectorText.includes('-webkit-scrollbar')) {
            hits.push(rule.selectorText);
          }
        }
      }
      return hits;
    })();
  `);
  const allowed = ["html", "*", "::-webkit-scrollbar", "::-webkit-scrollbar-track", "::-webkit-scrollbar-thumb", "::-webkit-scrollbar-button"];
  const offenders = owners.filter((selector) => !allowed.includes(selector));
  check("UI-11: exactly one rule set defines scrollbars — no component overrides it",
    owners.includes("html") && offenders.length === 0, `declared in: ${JSON.stringify(owners)}`);
}

// UI-12 as modified + UI-17 / AC-16 + AC-27: the app-menu control is gone from
// the application; About is reached from the Settings menu, by keyboard, and the
// dialog keeps every released behavior — including the version read from the
// packaged app, never a value written in the frontend.
async function flowAbout() {
  await instrumentBoundary();
  const appMenu = await execute(`
    return document.querySelectorAll('.app-menu, button[aria-label="Application menu"]').length;
  `);
  check("AC-27: no app-menu control renders anywhere", appMenu === 0, `found: ${appMenu}`);

  await keys("^Control", "^f", "~f", "~Control");
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await keys("Tab");
    reached = await waitForEval(
      `return document.activeElement?.getAttribute('aria-label') === 'Settings' ? true : null;`,
      { timeout: 1000 },
    );
  }
  check("AC-27: the Settings menu is reachable from the toolbar with Tab alone", reached);

  await keys("Enter");
  const up = await waitForEval(`return document.querySelector('.menu.settings-menu .menu-item') ? true : null;`, { timeout: 5000 });
  check("AC-27: Enter opens the Settings menu", !!up);
  const items = await execute(`return Array.from(document.querySelectorAll('.menu.settings-menu .menu-item')).map((e) => e.textContent.trim());`);
  check("UI-17: the Settings menu carries the theme submenu, Settings and About",
    items.some((text) => ["System", "Light", "Dark"].some((theme) => text.startsWith(theme))) &&
      items.some((text) => text.trim() === "Settings") &&
      items.some((text) => text.startsWith("About PDF Keeper")),
    JSON.stringify(items));

  let highlighted = false;
  for (let i = 0; i < 5 && !highlighted; i++) {
    await keys("ArrowDown");
    highlighted = await waitForEval(
      `return document.querySelector('.menu.settings-menu [data-highlighted]')?.textContent?.trim().startsWith('About') ? true : null;`,
      { timeout: 5000 },
    );
  }
  check("AC-16: the About item is reachable and selected with the arrow keys", !!highlighted);
  await keys("Enter");

  const dialog = await waitForEval(
    `return document.querySelector('.modal')?.textContent?.includes('About PDF Keeper') ? true : null;`,
    { timeout: 8000 },
  );
  check("AC-16: About opens through the shared modal wrapper", !!dialog);
  // The dialog's focus scope places focus on the next animation frame, so the
  // observation waits for it instead of reading the instant the dialog appears.
  const focusInside = await waitForEval(`
    const dialog = document.querySelector('.modal');
    const active = document.activeElement;
    return dialog && active && dialog.contains(active) ? true : null;
  `, { timeout: 4000 });
  const focus = await execute(`
    const active = document.activeElement;
    return active
      ? active.tagName.toLowerCase() + (active.className ? "." + String(active.className).trim().split(/\s+/)[0] : "")
      : "none";
  `);
  check("AC-16: the dialog holds focus inside itself", !!focusInside, `focus ended on ${focus}`);

  const shown = await execute(`return document.querySelector('.modal')?.textContent ?? null;`);
  const reported = await capturedValue(`() => window.__TAURI_INTERNALS__.__smokeAbout`);
  const packaged = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).version;
  check("AC-16: the dialog shows the application name and version the packaged app reports",
    !!reported && !!shown && shown.includes(reported.name) && shown.includes(reported.version) && reported.version === packaged,
    `app_about: ${JSON.stringify(reported)}, packaged version: ${packaged}`);

  const quoted = [];
  for (const file of sourceFiles(join(root, "ui", "src"))) {
    const text = readFileSync(file, "utf8");
    const match = text.match(/["'`]\s*\d+\.\d+\.\d+\s*["'`]/);
    if (match) quoted.push(`${file}: ${match[0]}`);
  }
  check("AC-16: no version string exists in the frontend sources", quoted.length === 0, quoted.join(" | "));

  // AC-49 (UI-27): the About dialog's vertical rhythm on the 4 px scale.
  const aboutGap = await execute(`
    const body = document.querySelector('.modal .about');
    return body ? getComputedStyle(body).rowGap : null;
  `);
  check("AC-49: the About dialog's row gap is a multiple of 4 px", onScalePx(aboutGap), `row-gap: ${aboutGap}`);

  await keys("Escape");
  const closed = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });
  check("AC-16: Esc closes the About dialog", !!closed);
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte")) out.push(path);
  }
  return out;
}

// UI-07 / AC-11: the OS title bar is gone and the toolbar's own controls drive
// the window. Maximize/restore is observed through the app's own mirrored state
// (the button re-reads the window on resize); minimize and close through the
// window facts the app itself is granted.
async function flowWindowChrome() {
  await instrumentBoundary();
  const controls = await execute(`
    return (() => {
      const toolbar = document.querySelector('.toolbar');
      const buttons = Array.from(document.querySelectorAll('.toolbar .window-button')).map((b) => ({
        label: b.getAttribute('aria-label'),
        tabbable: b.tabIndex >= 0,
        insideToolbar: toolbar?.contains(b) === true,
      }));
      return { dragRegion: toolbar?.hasAttribute('data-tauri-drag-region') === true, buttons };
    })();
  `);
  const labels = controls.buttons.map((b) => b.label);
  check("AC-11: the toolbar carries Minimize / Maximize / Close as app controls",
    ["Minimize", "Maximize", "Close"].every((label) => labels.includes(label)), JSON.stringify(labels));
  check("AC-11: every window control is keyboard-reachable inside the toolbar",
    controls.buttons.length === 3 && controls.buttons.every((b) => b.tabbable && b.insideToolbar), JSON.stringify(controls.buttons));
  check("AC-11: the toolbar strip is the window drag region", controls.dragRegion);

  // The frame is observed the way a person sees it: the gap between the outer
  // window and the page, and maximize/restore is what that shape does. The
  // read-only window commands that `core:default` already grants are used only
  // where a shape measurement cannot show the result (the minimize probe
  // below); no permission is added to the capability (R1.5, DR-90).
  const shape = () => execute(`
    return { w: window.outerWidth, h: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight };
  `);
  const frameless = await shape();
  check("AC-11: the app launches frameless — no title bar or border of its own",
    frameless.h - frameless.ih <= 2 && frameless.w - frameless.iw <= 2,
    `window ${frameless.w}×${frameless.h}, page ${frameless.iw}×${frameless.ih}`);

  // AC-11's stated method (spec §9, DR-88): the control's own state plus the
  // measured shape. Maximize counts when the window's outer shape changes from
  // the frameless one and the button mirrors it; Restore counts when both go
  // back. The app's own window reads are reported alongside — WindowControls
  // calls is_maximized to decide what the button says (DR-90) — as evidence,
  // not as the claim.
  await clickStable(`() => document.querySelector('.toolbar .window-button[aria-label="Maximize"]')`);
  const maximized = await waitForEval(`
    return (() => {
      const button = document.querySelector('.toolbar .window-button[data-maximized]');
      return button ? { label: button.getAttribute('aria-label') } : null;
    })();
  `, { timeout: 8000 });
  const maximizedShape = await shape();
  check("AC-11: Maximize maximizes the window and the control becomes Restore",
    !!maximized && maximized.label === "Restore" &&
      (maximizedShape.w !== frameless.w || maximizedShape.h !== frameless.h),
    `${JSON.stringify(maximized)}, window ${frameless.w}×${frameless.h} → ${maximizedShape.w}×${maximizedShape.h}, the app's window reads: ${JSON.stringify(await windowCallLog())}`);
  await clickStable(`() => document.querySelector('.toolbar .window-button[data-maximized]')`);
  const restored = await waitForEval(`return document.querySelector('.toolbar .window-button[data-maximized]') ? null : true;`, { timeout: 8000 });
  const normal = await shape();
  check("AC-11: Restore returns the window to its normal state",
    !!restored && Math.abs(normal.w - frameless.w) <= 2 && Math.abs(normal.h - frameless.h) <= 2,
    `${frameless.w}×${frameless.h} → ${maximizedShape.w}×${maximizedShape.h} → ${normal.w}×${normal.h}, the app's window reads: ${JSON.stringify(await windowCallLog())}`);

  await clickStable(`() => document.querySelector('.toolbar .window-button[aria-label="Close"]')`);
  let closed = false;
  let closingCall = "n/a";
  try {
    closingCall = JSON.stringify(await windowCallLog());
  } catch {
    closingCall = "the window was already gone";
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await execute(`return 1;`);
    } catch {
      closed = true;
      break;
    }
    await sleep(200);
  }
  let stillAnswering = "";
  if (!closed) {
    try {
      stillAnswering = await execute(`
        return {
          title: document.title,
          toolbar: !!document.querySelector('.toolbar'),
          lastCalls: (window.__TAURI_INTERNALS__?.__smokeSeen ?? []).slice(-8).join(' → '),
        };
      `);
      stillAnswering = JSON.stringify(stillAnswering);
    } catch {
      stillAnswering = "the window stopped answering between polls";
    }
  }
  check("AC-11: Close ends the app", closed,
    `still answering after 10 s — ${stillAnswering}; window calls at close: ${closingCall}`);
  sessionId = null;
  await waitProcessExit();
  await openSession();
  const relaunched = await waitForEval(EVAL.appReady, { timeout: 45000 });
  check("AC-11: the app relaunches against the same library", !!relaunched);

  await instrumentBoundary();
  await clickStable(`() => document.querySelector('.toolbar .window-button[aria-label="Minimize"]')`);
  const minimized = await probeWindow("is_minimized");
  check("AC-11: Minimize minimizes the window", minimized === true, `is_minimized: ${JSON.stringify(minimized)}`);
  await restartApp(); // no un-minimize control exists (only the three granted commands)
}

// What window commands the app actually made and what they answered: a window
// check that comes back empty is then a fact about the calls, not a guess.
async function windowCallLog() {
  return execute(`
    const w = window.__TAURI_INTERNALS__.__smokeWindow || {};
    return Object.entries(w).map(([cmd, entry]) => ({
      cmd: cmd.replace('plugin:window|', ''),
      args: entry.args ?? null,
      value: entry.value === undefined ? null : entry.value,
    }));
  `);
}

async function probeWindow(command) {
  const label = await capturedValue(`
    () => {
      const w = window.__TAURI_INTERNALS__.__smokeWindow || {};
      for (const key of Object.keys(w)) {
        const label = w[key].args?.label ?? w[key].args?.windowLabel;
        if (label) return label;
      }
      return null;
    }
  `);
  if (!label) return null;
  await execute(`window.__TAURI_INTERNALS__.invoke('plugin:window|' + arguments[0], { label: arguments[1] }); return true;`, [command, label]);
  return capturedValue(`() => {
    const entry = window.__TAURI_INTERNALS__.__smokeWindow['plugin:window|' + ${JSON.stringify(command)}];
    return entry && entry.value !== undefined ? entry.value : null;
  }`, 6000);
}

async function flowKeyboardAudit() {
  const audit = await execute(EVAL.keyboardAudit);
  const unreachable = audit.filter((a) => a.total === 0 || a.tabbable < a.total);
  check(
    "every toolbar control is keyboard-reachable (tabbable)",
    unreachable.length === 0,
    audit.map((a) => `${a.sel}:${a.tabbable}/${a.total}`).join(", "),
  );
}

// ============================================================ v0.0.3 flows ===

// A window command the app's own page issues (the drag region's `start_dragging`
// and `internal_toggle_maximize`) or the read its maximize button already does
// (`is_maximized`), observed at the same command boundary. Values are boxed
// because `waitForEval` reads a plain `false` as "not there yet".
async function windowInvoke(command) {
  await execute(`window.__TAURI_INTERNALS__.invoke('plugin:window|' + arguments[0], { label: 'main' }); return true;`, [command]);
  const entry = await waitForEval(`
    const w = window.__TAURI_INTERNALS__.__smokeWindow || {};
    const entry = w['plugin:window|' + arguments[0]];
    return entry && entry.value !== undefined ? { value: entry.value } : null;
  `, { timeout: 8000, args: [command] });
  return entry ? entry.value : null;
}

async function windowCallForgotten(command) {
  await execute(`delete (window.__TAURI_INTERNALS__.__smokeWindow || {})['plugin:window|' + arguments[0]]; return true;`, [command]);
}

async function windowCallIssued(command) {
  const seen = await waitForEval(`
    const w = window.__TAURI_INTERNALS__.__smokeWindow || {};
    return w['plugin:window|' + arguments[0]] !== undefined ? { seen: true } : null;
  `, { timeout: 2500, args: [command] });
  return !!seen;
}

// The values the app's own token file defines — read from the source so a check
// compares the rendered app with the design system instead of a copy of it.
function tokenRamps() {
  const css = readFileSync(join(root, "ui", "src", "lib", "design-tokens.css"), "utf8");
  const asRgb = (hex) => {
    const digits = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
    return `rgb(${parseInt(digits.slice(0, 2), 16)}, ${parseInt(digits.slice(2, 4), 16)}, ${parseInt(digits.slice(4, 6), 16)})`;
  };
  const token = (block, name) => {
    const m = css.match(new RegExp(`${block}[\\s\\S]*?${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    if (!m) throw new Error(`design-tokens.css has no ${name} in ${block}`);
    return asRgb(m[1]);
  };
  const lightBlock = ":root \\{";
  const darkBlock = ':root\\[data-theme="dark"\\] \\{';
  return {
    light: token(lightBlock, "--surface-0"),
    dark: token(darkBlock, "--surface-0"),
    // AC-43: the corrected text-role accent (DR-120) read from the same file
    // the contrast test verifies.
    accentLight: token(lightBlock, "--accent"),
    accentDark: token(darkBlock, "--accent"),
  };
}

function glyphOf(name) {
  const source = readFileSync(join(root, "ui", "src", "components", "icons.ts"), "utf8");
  const m = source.match(new RegExp(`\\n\\s*${name}:\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new Error(`icons.ts has no ${name} entry`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join("|");
}

// AC-19 (D2, DR-95(1)): the toolbar strip is the window drag region in `deep`
// mode and every control excludes itself. Tauri's drag handling is a page-level
// mousedown handler that issues `plugin:window|start_dragging` for a press and
// `internal_toggle_maximize` for a double click — both visible at the command
// boundary — and the double click changes the window's own state, which the
// toolbar's maximize button reads the same way.
async function flowDragRegion() {
  const contract = await execute(`
    const toolbar = document.querySelector('.toolbar');
    const controls = Array.from(document.querySelectorAll('.toolbar button, .toolbar input'));
    const decision = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const value = node.getAttribute('data-tauri-drag-region');
        if (value === null) continue;
        if (value === 'false') return 'excluded';
        return node === el ? 'self' : 'inherited';
      }
      return 'none';
    };
    return {
      strip: toolbar ? toolbar.getAttribute('data-tauri-drag-region') : null,
      controls: controls.length,
      dragging: controls.filter((el) => decision(el) !== 'excluded')
        .map((el) => el.getAttribute('aria-label') ?? String(el.className)),
      reEnabled: Array.from(document.querySelectorAll('.toolbar [data-tauri-drag-region]'))
        .filter((el) => el !== toolbar && el.getAttribute('data-tauri-drag-region') !== 'false')
        .map((el) => String(el.className)),
    };
  `);
  check("AC-19: the toolbar strip carries the deep drag region and every control in it is excluded",
    contract.strip === "deep" && contract.controls >= 8 && contract.dragging.length === 0 && contract.reEnabled.length === 0,
    `${contract.controls} controls; still dragging: ${JSON.stringify(contract.dragging)}; re-enabled: ${JSON.stringify(contract.reEnabled)}`);

  // A press on the empty strip is the window drag; a press on a control is a
  // click on that control.
  await windowCallForgotten("start_dragging");
  await clickAtStable(".toolbar .toolbar-spacer");
  const fromStrip = await windowCallIssued("start_dragging");
  await windowCallForgotten("start_dragging");
  await clickAtStable(".view-trigger");
  const fromControl = await windowCallIssued("start_dragging");
  await keys("Escape");
  await menuClosed(".menu.view-menu");
  check("AC-19: pressing the empty strip starts the window drag, pressing a control does not",
    fromStrip && !fromControl, `strip: ${fromStrip}, control: ${fromControl}`);

  const before = await windowState("is_maximized");
  await doubleClickStable(`() => document.querySelector('.toolbar .toolbar-spacer')`);
  const maximized = await windowState("is_maximized");
  await doubleClickStable(`() => document.querySelector('.toolbar .toolbar-spacer')`);
  const restored = await windowState("is_maximized");
  check("AC-19: a double click on the empty strip toggles maximize and a second one restores",
    before === false && maximized === true && restored === false,
    `is_maximized: ${before} -> ${maximized} -> ${restored}`);

  await windowCallForgotten("internal_toggle_maximize");
  await doubleClickStable(`() => document.querySelector('.view-trigger')`);
  const untouched = await windowState("is_maximized");
  const toggled = await windowCallIssued("internal_toggle_maximize");
  await keys("Escape");
  await menuClosed(".menu.view-menu");
  check("AC-19: a double click on a control is a click on the control, never a window maximize",
    untouched === false && !toggled, `is_maximized: ${untouched}, toggle issued: ${toggled}`);
}

async function windowState(command) {
  return windowInvoke(command);
}

// AC-20 (UI-13): every toolbar control is icon-only, named by `aria-label`, and
// shows a tooltip carrying that same text — on keyboard focus for every control,
// on pointer hover for two of them. AC-26's rendered half: no standalone Sort
// control exists anywhere.
async function flowToolbarControls() {
  const controls = await execute(`
    return Array.from(document.querySelectorAll('.toolbar button')).map((el) => ({
      cls: String(el.className),
      label: el.getAttribute('aria-label') ?? null,
      text: el.textContent.trim(),
    }));
  `);
  check("AC-20: no toolbar control renders visible text and every one carries an accessible name",
    controls.length >= 8 && controls.every((c) => c.text === "") && controls.every((c) => c.label),
    `${controls.length} controls; text-bearing: ${JSON.stringify(controls.filter((c) => c.text !== ""))}; unnamed: ${JSON.stringify(controls.filter((c) => !c.label))}`);

  const misses = await tooltipOnKeyboardFocus();
  check("AC-20: every toolbar control shows a tooltip carrying its accessible name on keyboard focus",
    misses.length === 0,
    misses.join(" | ") + (misses.length ? " — " + (await triggerDiagnostic(".browse-trigger")) : ""));

  const hoverMisses = [];
  for (const selector of [".browse-trigger", ".select-toggle"]) {
    const name = await execute(`return document.querySelector(arguments[0])?.getAttribute('aria-label') ?? null;`, [selector]);
    const { tip, nodes } = await tooltipOnHover(selector);
    if (!tip || tip !== name) {
      hoverMisses.push(`${selector}: name ${JSON.stringify(name)} tooltip ${JSON.stringify(tip ?? `none open (${nodes} tooltip node(s) mounted)`)}`);
    }
  }
  check("AC-20: the same tooltip appears on pointer hover", hoverMisses.length === 0, hoverMisses.join(" | "));

  const sort = await execute(`
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"]'));
    return nodes
      .filter((el) => {
        const name = ((el.getAttribute('aria-label') ?? el.textContent) || '').trim().toLowerCase();
        return name === 'sort' || name.startsWith('sort ') || String(el.className).includes('sort-trigger');
      })
      .map((el) => el.getAttribute('aria-label') ?? String(el.className));
  `);
  check("AC-26: no standalone Sort control renders anywhere", sort.length === 0, JSON.stringify(sort));
}

// The kit's open states for a tooltip are `instant-open` and `delayed-open` —
// a plain `open` is the menu primitive's vocabulary, not the tooltip's. Reading
// the state the kit actually writes is the only way to tell an open tooltip
// from a closed one.
const OPEN_TOOLTIP = `
  const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
  return tip && tip.textContent.trim() ? tip.textContent.trim() : null;
`;

// Real keyboard focus, not `.focus()`: the kit shows a tooltip for keyboard
// focus only, so the walk moves focus with Tab presses and reads the tooltip at
// each toolbar control it stops on. Returns the mismatches.
async function tooltipOnKeyboardFocus() {
  const labels = await execute(`
    return Array.from(document.querySelectorAll('.toolbar button')).map((el) => el.getAttribute('aria-label'));
  `);
  const seen = new Map();
  await execute(`document.activeElement?.blur(); return true;`);
  for (let step = 0; step < 60 && seen.size < labels.length; step++) {
    await keys("Tab");
    const stop = await execute(`
      const el = document.activeElement;
      if (!el || el.tagName !== 'BUTTON' || !el.closest('.toolbar')) return null;
      return Array.from(document.querySelectorAll('.toolbar button')).indexOf(el);
    `);
    if (stop === null || seen.has(stop)) continue;
    const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 2500 });
    seen.set(stop, tip);
  }
  const misses = [];
  labels.forEach((label, index) => {
    if (!seen.has(index)) misses.push(`${JSON.stringify(label)}: never reached by Tab`);
    else if (seen.get(index) !== label) misses.push(`${JSON.stringify(label)}: tooltip ${JSON.stringify(seen.get(index))}`);
  });
  return misses;
}

async function tooltipOnHover(selector) {
  // Start from a parked pointer: if a previous flow left the cursor on this
  // very control, a move to the same point fires no pointerenter and the kit
  // never opens the tooltip. From a neutral position every hover is real.
  await parkPointer();
  const pos = await execute(`
    const el = document.querySelector(arguments[0]);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.max(1, Math.min(Math.round(r.x + r.width / 2), window.innerWidth - 2));
    const y = Math.max(1, Math.min(Math.round(r.y + r.height / 2), window.innerHeight - 2));
    return { x, y };
  `, [selector]);
  if (!pos) return { tip: null, nodes: -1 };
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", x: pos.x, y: pos.y }],
      },
    ],
  });
  const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 4000 });
  // Sampled while the pointer is still on the control: whether the kit mounted a
  // tooltip node at all is the difference between "the tooltip never opens" and
  // "it opens but says something else".
  const nodes = await execute(`return document.querySelectorAll('.tooltip').length;`);
  // D16: dismissal is the condition — the next flow starts from a page with
  // no lingering tooltip node, observed rather than waited out.
  await parkPointer();
  await waitForEval(`return document.querySelectorAll('.tooltip').length === 0 ? true : null;`, { timeout: 3000 });
  return { tip, nodes };
}

// Whether the kit's trigger props reached the control at all. The kit always
// marks its trigger and always sets `data-state` on it; without those attributes
// no hover/focus handler is attached, and no tooltip can ever open.
async function triggerDiagnostic(selector) {
  const attrs = await execute(`
    const el = document.querySelector(arguments[0]);
    return el ? Array.from(el.attributes).map((a) => a.name + "=" + a.value).join(" ") : "no element";
  `, [selector]);
  return `trigger attributes: ${attrs}`;
}

// AC-21 (UI-14) and the rendered half of AC-25 (UI-16): the field is
// magnifier · input · divider · one trailing control, that slot is the clear
// button while the field holds text, the plus opens exactly the two import
// pickers, and the placeholder names the current scope while the accessible
// name stays the fixed "Search".
async function flowSearchField() {
  await browseSelect("All documents");
  await clearSearch();

  const shape = async () =>
    execute(`
      const box = document.querySelector('.search-box');
      if (!box) return null;
      const input = box.querySelector('.search-input');
      return {
        parts: Array.from(box.children).map((el) => {
          if (el.tagName.toLowerCase() === 'svg') return 'icon';
          if (el.tagName.toLowerCase() === 'input') return 'input';
          if (String(el.className).includes('field-divider')) return 'divider';
          if (String(el.className).includes('field-action')) return 'action';
          return el.tagName.toLowerCase();
        }),
        actions: Array.from(box.querySelectorAll('.field-action')).map((el) => ({
          label: el.getAttribute('aria-label'),
          visible: el.offsetParent !== null,
        })),
        placeholder: input ? input.placeholder : null,
        accessibleName: input ? input.getAttribute('aria-label') : null,
      };
    `);

  const empty = await shape();
  check("AC-21: the field is magnifier, input, divider, one trailing control",
    !!empty && empty.parts.join(" ") === "icon input divider action", JSON.stringify(empty?.parts));
  check("AC-21: the trailing control is the import control, named",
    !!empty && empty.actions.length === 1 && empty.actions[0].label === "Import", JSON.stringify(empty?.actions));

  // The control is job-gated (UI-14): the import result and the last progress
  // event are not ordered, so the idle state is established here, not assumed.
  await jobIdle();
  await openMenuSure(".search-box .field-action", ".menu.import-menu");
  const items = await execute(`return Array.from(document.querySelectorAll('.menu.import-menu .menu-item')).map((e) => e.textContent.trim());`);
  await keys("Escape");
  await menuClosed(".menu.import-menu");
  check("AC-21: the plus opens exactly Import files and Import folder",
    items.length === 2 && items[0] === "Import files" && items[1] === "Import folder", JSON.stringify(items));

  await typeInto(".search-input", "doc00");
  const filled = await shape();
  check("AC-21: while the field holds text the clear button occupies that slot",
    !!filled && filled.actions.length === 1 && filled.actions[0].visible && filled.actions[0].label === "Clear search",
    JSON.stringify(filled?.actions));
  await clearSearch();

  // AC-25's rendered half: the placeholder names the scope the user is in, and
  // the accessible name never changes with it.
  const names = await ensureCategories(2);
  const ramps = [];
  await browseSelect("Favorites");
  const favorites = await shape();
  ramps.push({ scope: "favorites", placeholder: favorites?.placeholder, name: favorites?.accessibleName });
  // Each scope on its own: Favorites, then a category with no mode active, then
  // nothing. (Favorites together with a category is a different, separately
  // worded string — UI-16 — so the mode has to be cleared first.)
  await browseSelect("All documents");
  await setActiveCategories([names[0]]);
  const category = await shape();
  ramps.push({ scope: "category", placeholder: category?.placeholder, name: category?.accessibleName });
  await browseSelect("All documents");
  const all = await shape();
  ramps.push({ scope: "all", placeholder: all?.placeholder, name: all?.accessibleName });
  await clearCategoryFilter();

  // `formatCount` is `Intl.NumberFormat` on the same value the app formats.
  const total = (await docCount()).toLocaleString("en-US");
  const mismatches = [];
  if (ramps[0].placeholder !== "Search in Favorites") mismatches.push(`favorites scope reads ${JSON.stringify(ramps[0].placeholder)}`);
  if (ramps[1].placeholder !== `Search in ${names[0]}`) mismatches.push(`category scope (the active category is ${JSON.stringify(names[0])}) reads ${JSON.stringify(ramps[1].placeholder)}`);
  if (ramps[2].placeholder !== `Search in ${total} documents`) mismatches.push(`all-documents scope (the status bar counts ${total}) reads ${JSON.stringify(ramps[2].placeholder)}`);
  for (const r of ramps) if (r.name !== "Search") mismatches.push(`${r.scope} scope changed the accessible name to ${JSON.stringify(r.name)}`);
  check("AC-25: the placeholder names the current scope while the accessible name stays Search",
    mismatches.length === 0, `${mismatches.join(" | ")} — categories created: ${JSON.stringify(names)}, ramps: ${JSON.stringify(ramps)}`);

  // Both menu items reach their native picker. The dialog itself belongs to the
  // OS; what the app's own boundary shows is the request it makes and the
  // recovery after the picker is dismissed.
  const requests = [];
  for (const item of ["Import files", "Import folder"]) {
    await execute(`window.__TAURI_INTERNALS__.__smokeDialog = null; return true;`);
    await jobIdle();
    await openMenuSure(".search-box .field-action", ".menu.import-menu");
    await clickMenuItem(".menu.import-menu", item);
    const request = await waitForEval(`
      const d = window.__TAURI_INTERNALS__.__smokeDialog;
      return d ? { args: d.args } : null;
    `, { timeout: 8000 });
    requests.push({ item, args: request ? request.args : null });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await keys("Escape");
      // D16: each Escape is confirmed by the app menu being gone.
      await waitForEval(`return document.querySelector('.menu') ? null : true;`, { timeout: 3000 });
    }
    const alive = await waitForEval(EVAL.appReady, { timeout: 30000 });
    if (!alive) throw new Error(`the app stopped answering after the ${item} picker was opened — ${await notReadyDiagnosis()}`);
  }
  // The dialog plugin's payload wraps everything it was asked for in `options`;
  // the claim is about what the app asked for, so the fields are read there and
  // compared by name, not by serialized key order.
  const filesOk =
    requests[0].args?.options?.multiple === true &&
    requests[0].args?.options?.filters?.length === 1 &&
    requests[0].args.options.filters[0].name === "PDF" &&
    JSON.stringify(requests[0].args.options.filters[0].extensions) === JSON.stringify(["pdf"]);
  const folderOk = requests[1].args?.options?.directory === true;
  check("AC-21: both items reach their picker — files with the PDF filter, folder as a directory",
    filesOk && folderOk, JSON.stringify(requests));
}

// AC-22 (UI-15): the status bar says nothing until there is something to say.
// Runs while the library is clean (no missing files) — the missing branch is
// verified inside the missing-file flow, where that state actually exists.
async function flowStatusBar() {
  // Self-sufficient (D14): the flow builds its own unfiltered list. AC-56: it
  // never waits out the busy gate — it runs its own bounded job (§3.1.1:
  // delete the core cover files, touch the core mtimes, rescan — a job over
  // ~100 uncached covers with real progress and a real end), and the job's
  // end is the condition for the reads that follow.
  await setupListView(1);
  await instrumentBoundary();
  await clearSelectionIfAny();
  await jobIdle(); // bounded (30 s): clear any in-flight job before starting our own

  // The progress half of the bar: the first progress state the app publishes
  // while the bounded job runs.
  const firstProgress = await startBoundedCoverJob();
  check("AC-22 / AC-53: the bounded rescan job shows a real progress bar in the bar",
    !!firstProgress, JSON.stringify(firstProgress));

  // …and the bar is quiet again once it ends: the end is awaited through the
  // app's own idle signal, then the claim holds only if the bar stays quiet
  // across several reads.
  await jobIdle();
  let quietReads = 0;
  const quietDeadline = Date.now() + 20_000;
  while (quietReads < 3 && Date.now() < quietDeadline) {
    const bar = await readStatusBar();
    quietReads = bar.progress === false && bar.resultCount === null ? quietReads + 1 : 0;
    if (quietReads < 3) await sleep(250);
  }
  const after = await readStatusBar();
  check("AC-22: the bar is quiet again once a job ends",
    quietReads >= 3 && after.progress === false && after.resultCount === null && after.docCount !== null,
    JSON.stringify({ ...after, quietReads }));

  const clean = await readStatusBar();
  check("AC-22: with nothing to say the status bar shows only the document count",
    clean.docCount !== null && clean.resultCount === null && clean.missingWarning === null &&
      clean.progress === false && clean.buttons === 0 && clean.chips === 0,
    JSON.stringify(clean));

  await searchFor("doc0010"); // core tier: doc00100–102 match this prefix
  const filtered = await readStatusBar();
  const shown = await execute(`return document.querySelectorAll('[data-row-id]').length;`);
  check("AC-22: while filtered the status bar shows the result count, and the document count stays library-wide",
    filtered.resultCount !== null && filtered.resultCount === filtered.matchedTotal && filtered.docCount === clean.docCount && shown > 0,
    `result count: ${filtered.resultCount}, rows: ${shown}, document count: ${filtered.docCount} (was ${clean.docCount})`);
  await clearSearch();
}

async function readStatusBar() {
  return execute(`
    const bar = document.querySelector('.status-bar');
    if (!bar) return null;
    const text = (sel) => {
      const el = bar.querySelector(sel);
      return el ? el.textContent.trim() : null;
    };
    const digits = (value) => (value === null ? null : Number(value.replace(/[^0-9]/g, '')));
    const search = window.__TAURI_INTERNALS__.__smokeSearch;
    return {
      docCount: digits(text('.doc-count')),
      resultCount: digits(text('.result-count')),
      matchedTotal: search && search.total !== undefined ? search.total : null,
      missingWarning: text('.missing-warning'),
      progress: !!bar.querySelector('.progress-wrap'),
      buttons: bar.querySelectorAll('button').length,
      chips: bar.querySelectorAll('.count-chip, .chip').length,
    };
  `);
}

async function clearSelectionIfAny() {
  await execute(`
    const clear = document.querySelector('.bulk-bar [aria-label="Clear selection"]');
    if (clear) clear.click();
    return true;
  `);
  await waitForEval(`return document.querySelector('.bulk-bar') ? null : true;`, { timeout: 5000 });
}

// AC-24 (UI-03 as modified): no checkbox, no category badges, one actions line
// revealed on hover or keyboard focus, Details carrying the `info` glyph while
// category actions keep `tag`, and the 64 px row with its 45×64 cover. The
// "+18 px per metadata line" half is measured in the metadata-display flow,
// which is the flow that puts the lines on a row.
async function flowRowDesign() {
  // The row design is observed on list rows; an earlier flow can have left the
  // app in grid mode or behind a filter — including a category filter, which
  // narrows the list to the fixture documents that carry author and notes text.
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  const ready = await waitForEval(`return document.querySelectorAll('.row[data-row-id]').length >= 3 ? true : null;`, { timeout: 20000 });
  if (!ready) throw new Error("no list rows are rendered for the row-design flow");

  // UI-03's measured case is the base row: 64 px, a 45×64 cover, no metadata
  // lines. The fixture corpus carries an author on every document, so the flow
  // makes one base-case row through the app's own editor — the path a user
  // takes — and measures the row that results.
  const target = await execute(`
    const el = document.querySelector('.row[data-row-id]');
    return el ? { id: el.getAttribute('data-row-id'), lines: el.querySelectorAll('.author-line, .notes-line').length } : null;
  `);
  if (!target) throw new Error("no list row is rendered for the row-design flow");
  if (target.lines > 0) {
    await openEditorForRow(`[data-row-id="${target.id}"]`);
    await setEditorField("Author", "");
    await setEditorField("Notes", "");
    await saveEditor();
    const cleared = await waitForEval(`
      const el = document.querySelector('[data-row-id="' + arguments[0] + '"]');
      return el && !el.querySelector('.author-line, .notes-line') ? true : null;
    `, { args: [target.id], timeout: 10000 });
    if (!cleared) throw new Error(`the row for ${target.id} kept its metadata lines after they were cleared`);
  }

  const info = glyphOf("info");
  const tag = glyphOf("tag");

  // "At rest" means nothing pointing at the row: the right-click above left the
  // pointer on it and the dialog's close left focus on it, and the reveal is
  // hover- and focus-driven.
  await parkPointer();
  const row = await execute(`
    const bare = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!bare) return null;
    const cover = bare.querySelector('.cover');
    const actions = bare.querySelector('.row-actions');
    const buttons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    return {
      id: bare.getAttribute('data-row-id'),
      height: Math.round(bare.getBoundingClientRect().height),
      cover: cover
        ? { width: Math.round(cover.getBoundingClientRect().width), height: Math.round(cover.getBoundingClientRect().height) }
        : null,
      checkbox: !!bare.querySelector('[role="checkbox"], input[type="checkbox"]'),
      chips: bare.querySelectorAll('.category-chip, .chip').length,
      actionsAtRest: actions ? getComputedStyle(actions).display : null,
      labels: buttons.map((b) => b.getAttribute('aria-label')),
      glyphs: buttons.map((b) => Array.from(b.querySelectorAll('svg path')).map((p) => p.getAttribute('d')).join('|')),
    };
  `, [target.id]);
  check("AC-24: a row renders no selection checkbox and no category badge",
    !!row && !row.checkbox && row.chips === 0, JSON.stringify(row && { checkbox: row.checkbox, chips: row.chips }));
  check("AC-24: a list row measures 64 px with a 45×64 cover",
    !!row && row.height === 64 && row.cover && row.cover.width === 45 && row.cover.height === 64,
    `row ${row?.height} px, cover ${row?.cover?.width}×${row?.cover?.height}`);
  check("AC-24: the star, Details and Delete are one actions line, hidden at rest",
    !!row && row.actionsAtRest === "none" && row.labels.length === 3 &&
      row.labels.some((l) => /favorite/i.test(l)) && row.labels.some((l) => l === "Details") && row.labels.some((l) => l === "Delete"),
    JSON.stringify(row && row.labels));
  check("AC-24: the Details action renders the info glyph",
    !!row && row.glyphs.some((g) => g === info) && !row.glyphs.some((g) => g === tag),
    `rendered glyph sets: ${JSON.stringify(row?.glyphs)}`);

  const revealed = await execute(`
    const el = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!el) return null;
    el.focus();
    const actions = el.querySelector('.row-actions');
    return { focusWithin: el.matches(':focus-within'), display: actions ? getComputedStyle(actions).display : null };
  `, [row.id]);
  check("AC-24: the actions line appears on keyboard focus",
    !!revealed && revealed.focusWithin && revealed.display !== "none", JSON.stringify(revealed));

  const hoverShown = await hoverRevealsActions(row.id);
  check("AC-24: the actions line appears on hover", hoverShown, `display while hovering: ${hoverShown}`);

  // The Categories submenu trigger only exists when the library has categories;
  // the flow makes its own precondition instead of borrowing another flow's
  // leftovers (no-op when earlier flows already left categories behind).
  await ensureCategories(2);
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const categoryItems = await execute(`
    const out = [];
    for (const item of document.querySelectorAll('.menu.browse-menu .menu-item')) {
      const label = (item.querySelector('.item-label')?.textContent ?? item.textContent).trim();
      if (!/categor/i.test(label)) continue;
      out.push({ label, glyph: Array.from(item.querySelectorAll('svg path')).map((p) => p.getAttribute('d')).join('|') });
    }
    return out;
  `);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  // A control renders a glyph when every path that glyph is made of appears in
  // what it renders. A submenu trigger also renders its own indicator, and that
  // is not a different category glyph.
  const renders = (rendered, required) => required.split("|").every((p) => rendered.split("|").includes(p));
  const scopeItem = categoryItems.find((c) => c.label.trim().toLowerCase() === "categories");
  check("AC-24: the category action keeps the tag glyph",
    !!scopeItem && renders(scopeItem.glyph, tag), JSON.stringify(categoryItems));
}

async function hoverRevealsActions(rowId) {
  const pos = await execute(`
    const el = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + 200), y: Math.round(r.y + r.height / 2) };
  `, [rowId]);
  if (!pos) return false;
  await execute(`document.activeElement?.blur(); return true;`);
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", x: pos.x, y: pos.y }],
      },
    ],
  });
  const shown = await waitForEval(`
    const el = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    const actions = el?.querySelector('.row-actions');
    return actions && getComputedStyle(actions).display !== 'none' ? { display: getComputedStyle(actions).display } : null;
  `, { timeout: 4000, args: [rowId] });
  await parkPointer();
  return !!shown;
}

async function hoverPoint(x, y) {
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", x, y }],
      },
    ],
  });
}

// AC-32 (D3) and AC-33 (D4): every icon-only control centres its glyph in its
// own box; the row/card actions are one control type — same 32×32 box, centres
// on the row's centre line, the app's own tooltip on hover and on keyboard
// focus — and the star keeps its switch semantics through the real command.
async function flowActionParity() {
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  await parkPointer();
  const ready = await waitForEval(`return document.querySelectorAll('.row[data-row-id]').length >= 3 ? true : null;`, { timeout: 20000 });
  if (!ready) throw new Error("no list rows for the action-parity flow");

  const glyphCentres = (selectors) => execute(`
    const out = [];
    for (const [sel, name] of arguments[0]) {
      const el = document.querySelector(sel);
      if (!el) { out.push({ name, missing: true }); continue; }
      const c = el.getBoundingClientRect();
      const svg = el.querySelector('svg');
      if (!svg) { out.push({ name, noGlyph: true }); continue; }
      const g = svg.getBoundingClientRect();
      out.push({
        name,
        dx: Number(((g.x + g.width / 2) - (c.x + c.width / 2)).toFixed(2)),
        dy: Number(((g.y + g.height / 2) - (c.y + c.height / 2)).toFixed(2)),
      });
    }
    return out;
  `, [selectors]);

  // AC-32: the controls D3 names — glyph centred in its own box, ±1 px.
  const toolbar = await glyphCentres([
    [".browse-trigger", "Browse"],
    ["button[aria-pressed]", "Select mode"],
    [".view-trigger", "View"],
    [".settings-trigger", "Settings"],
    ["button[aria-label='Minimize']", "Minimize"],
    ["button[aria-label='Maximize']", "Maximize"],
    ["button[aria-label='Close']", "Close"],
  ]);
  const off = toolbar.filter((c) => c.missing || c.noGlyph || Math.abs(c.dx) > 1 || Math.abs(c.dy) > 1);
  check("AC-32: every toolbar control centres its glyph in its own box (|dx|,|dy| ≤ 1 px)",
    toolbar.length === 7 && off.length === 0, JSON.stringify(toolbar));

  // AC-32's other half: a text control keeps the 10 px side padding the
  // icon-only class dropped. The bulk bar's text button is the shipped case.
  await execute(`
    const row = document.querySelector('[data-row-id]');
    if (row) row.focus();
    return !!row;
  `);
  await keys("Space");
  const padding = await waitForEval(`
    const btn = document.querySelector('.bulk-bar button.control');
    if (!btn) return null;
    const cs = getComputedStyle(btn);
    return { left: cs.paddingLeft, right: cs.paddingRight };
  `, { timeout: 5000 });
  check("AC-32: a text control still carries the 10 px side padding",
    !!padding && padding.left === "10px" && padding.right === "10px", JSON.stringify(padding));
  await keys("Escape"); // §5.2: Escape clears the selection and the bulk bar
  await parkPointer();

  // The row under test is the first rendered one; its actions are revealed by
  // real focus and stay revealed while focus is inside the row.
  const target = await execute(`
    const el = document.querySelector('[data-row-id]');
    return el ? el.getAttribute('data-row-id') : null;
  `);
  const rowActions = (id) => execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!row) return null;
    row.focus();
    const actions = row.querySelector('.row-actions');
    if (!actions || getComputedStyle(actions).display === 'none') return null;
    const rr = row.getBoundingClientRect();
    return {
      rowCentreY: rr.y + rr.height / 2,
      buttons: Array.from(actions.querySelectorAll('button')).map((b) => {
        const c = b.getBoundingClientRect();
        const svg = b.querySelector('svg');
        const g = svg ? svg.getBoundingClientRect() : null;
        return {
          label: b.getAttribute('aria-label'),
          role: b.getAttribute('role'),
          checked: b.getAttribute('aria-checked'),
          w: Math.round(c.width),
          h: Math.round(c.height),
          cx: c.x + c.width / 2,
          cy: c.y + c.height / 2,
          dx: g ? Number(((g.x + g.width / 2) - (c.x + c.width / 2)).toFixed(2)) : null,
          dy: g ? Number(((g.y + g.height / 2) - (c.y + c.height / 2)).toFixed(2)) : null,
        };
      }),
    };
  `, [id]);
  const actions = await rowActions(target);
  if (!actions) throw new Error(`the row for ${target} never revealed its actions line`);
  const boxes = actions.buttons.map((b) => [b.w, b.h]);
  check("AC-33: the row actions are one control type — 32×32 boxes on the row's centre line",
    actions.buttons.length >= 3 &&
      boxes.every(([w, h]) => Math.abs(w - 32) <= 1 && Math.abs(h - 32) <= 1) &&
      actions.buttons.every((b) => Math.abs(b.cy - actions.rowCentreY) <= 1),
    JSON.stringify(actions.buttons.map((b) => ({ label: b.label, w: b.w, h: b.h, dyFromCentre: Number((b.cy - actions.rowCentreY).toFixed(2)) }))));
  check("AC-32: the row action glyphs are centred in their boxes",
    actions.buttons.every((b) => b.dx !== null && Math.abs(b.dx) <= 1 && Math.abs(b.dy) <= 1),
    JSON.stringify(actions.buttons.map((b) => ({ label: b.label, dx: b.dx, dy: b.dy }))));

  // AC-33's switch semantics: the star is the kit Switch, aria-checked tracks
  // the favorite state, and every flip writes through library_set_favorite.
  const star = actions.buttons.find((b) => b.role === "switch");
  check("AC-33: the star reports role=\"switch\" with aria-checked",
    !!star && (star.checked === "true" || star.checked === "false"),
    JSON.stringify(star && { role: star.role, checked: star.checked }));

  const toggleStarInRow = async () => {
    const before = await execute(`return (window.__TAURI_INTERNALS__.__smokeSeen ?? []).length;`);
    await clickStable(`() => document.querySelector('[data-row-id="' + ${JSON.stringify(target)} + '"] .row-actions button[role="switch"]')`);
    const wrote = await waitForEval(`
      const seen = window.__TAURI_INTERNALS__.__smokeSeen ?? [];
      return seen.slice(arguments[0]).includes('library_set_favorite') ? true : null;
    `, { args: [before], timeout: 6000 });
    const after = await execute(`
      const b = document.querySelector('[data-row-id="' + arguments[0] + '"] .row-actions button[role="switch"]');
      return b ? b.getAttribute('aria-checked') : null;
    `, [target]);
    return { wrote: !!wrote, checked: after };
  };
  if (!star) throw new Error("no star button in the row actions line");
  const first = await toggleStarInRow();
  const second = await toggleStarInRow();
  check("AC-33: toggling the star flips aria-checked and writes through library_set_favorite",
    first.wrote && second.wrote && first.checked !== star.checked && second.checked === star.checked,
    JSON.stringify({ initial: star.checked, afterFirst: first.checked, afterSecond: second.checked }));

  // AC-33: the app's own tooltip on real keyboard focus — Tab reaches the row
  // (the roving tabindex) and then its action buttons.
  const keyboardTips = async (containerSel, count) => {
    await execute(`document.activeElement?.blur(); return true;`);
    const seen = [];
    let inside = false;
    for (let step = 0; step < 80 && seen.length < count; step += 1) {
      await keys("Tab");
      const stop = await execute(`
        const el = document.activeElement;
        if (!el || el.tagName !== 'BUTTON') return null;
        const actions = el.closest('.row-actions');
        if (!actions || !actions.closest(arguments[0])) return null;
        return { label: el.getAttribute('aria-label') };
      `, [containerSel]);
      if (!stop) continue;
      inside = true;
      const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 2500 });
      seen.push({ label: stop.label, tip });
    }
    return { inside, seen };
  };
  const rowTips = await keyboardTips(`[data-row-id="${target}"]`, 3);
  check("AC-33: every row action shows the app's own tooltip carrying its accessible name on keyboard focus",
    rowTips.inside && rowTips.seen.length >= 3 && rowTips.seen.every((s) => s.tip === s.label),
    JSON.stringify(rowTips.seen));

  // AC-33: the same tooltip on pointer hover.
  const hoverTips = [];
  for (const b of actions.buttons) {
    await hoverPoint(Math.round(b.cx), Math.round(b.cy));
    const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 4000 });
    hoverTips.push({ label: b.label, tip });
  }
  await parkPointer();
  check("AC-33: every row action shows the same tooltip on pointer hover",
    hoverTips.length >= 3 && hoverTips.every((s) => s.tip === s.label), JSON.stringify(hoverTips));

  // The same claims in grid view: cards carry the identical actions line.
  await setViewMode("grid");
  const cardReady = await waitForEval(`
    return document.querySelector('.card[data-row-id="' + arguments[0] + '"]') ? true : null;
  `, { args: [target], timeout: 15000 });
  if (!cardReady) throw new Error(`no card for ${target} in grid view`);
  const cardPos = await execute(`
    const card = document.querySelector('.card[data-row-id="' + arguments[0] + '"]');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, [target]);
  await hoverPoint(cardPos.x, cardPos.y); // the reveal is the card's own :hover
  const cardActions = await execute(`
    const card = document.querySelector('.card[data-row-id="' + arguments[0] + '"]');
    if (!card) return null;
    const actions = card.querySelector('.row-actions');
    if (!actions || getComputedStyle(actions).display === 'none') return null;
    return Array.from(actions.querySelectorAll('button')).map((b) => {
      const c = b.getBoundingClientRect();
      const svg = b.querySelector('svg');
      const g = svg ? svg.getBoundingClientRect() : null;
      return {
        label: b.getAttribute('aria-label'),
        role: b.getAttribute('role'),
        checked: b.getAttribute('aria-checked'),
        w: Math.round(c.width),
        h: Math.round(c.height),
        cy: c.y + c.height / 2,
        dx: g ? Number(((g.x + g.width / 2) - (c.x + c.width / 2)).toFixed(2)) : null,
        dy: g ? Number(((g.y + g.height / 2) - (c.y + c.height / 2)).toFixed(2)) : null,
      };
    });
  `, [target]);
  if (!cardActions) throw new Error(`the card for ${target} never revealed its actions line on hover`);
  const cardStar = cardActions.find((b) => b.role === "switch");
  if (!cardStar) throw new Error(`the card for ${target} has no star switch in its actions line`);
  check("AC-33: in grid the actions are the same control type — 32×32 boxes on one centre line, centred glyphs, the star a switch",
    (cardActions ?? []).length >= 3 &&
      cardActions.every((b) => Math.abs(b.w - 32) <= 1 && Math.abs(b.h - 32) <= 1) &&
      Math.max(...cardActions.map((b) => b.cy)) - Math.min(...cardActions.map((b) => b.cy)) <= 1 &&
      cardActions.every((b) => b.dx !== null && Math.abs(b.dx) <= 1 && Math.abs(b.dy) <= 1) &&
      !!cardStar && (cardStar.checked === "true" || cardStar.checked === "false"),
    JSON.stringify(cardActions));

  const cardTips = await keyboardTips(`.card[data-row-id="${target}"]`, 3);
  check("AC-33: every card action shows the app's own tooltip carrying its accessible name on keyboard focus",
    cardTips.inside && cardTips.seen.length >= 3 && cardTips.seen.every((s) => s.tip === s.label),
    JSON.stringify(cardTips.seen));

  const cardHoverTips = [];
  for (const b of cardActions) {
    const p = await execute(`
      const els = Array.from(document.querySelectorAll('.card[data-row-id="' + arguments[0] + '"] .row-actions button'));
      const b = els[arguments[1]];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `, [target, cardHoverTips.length]);
    if (!p) break;
    await hoverPoint(p.x, p.y);
    const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 4000 });
    cardHoverTips.push({ label: b.label, tip });
  }
  await parkPointer();
  check("AC-33: every card action shows the same tooltip on pointer hover",
    cardHoverTips.length >= 3 && cardHoverTips.every((s) => s.tip === s.label), JSON.stringify(cardHoverTips));

  // The card star writes through the same command and tracks the state.
  const beforeCard = await execute(`return (window.__TAURI_INTERNALS__.__smokeSeen ?? []).length;`);
  await hoverPoint(cardPos.x, cardPos.y);
  await clickStable(`() => document.querySelector('.card[data-row-id="' + ${JSON.stringify(target)} + '"] .row-actions button[role="switch"]')`);
  const cardWrote = await waitForEval(`
    const seen = window.__TAURI_INTERNALS__.__smokeSeen ?? [];
    return seen.slice(arguments[0]).includes('library_set_favorite') ? true : null;
  `, { args: [beforeCard], timeout: 6000 });
  const cardChecked = await execute(`
    const b = document.querySelector('.card[data-row-id="' + arguments[0] + '"] .row-actions button[role="switch"]');
    return b ? b.getAttribute('aria-checked') : null;
  `, [target]);
  check("AC-33: the card star tracks the favorite state and writes through the same command",
    !!cardWrote && cardChecked !== cardStar.checked,
    JSON.stringify({ before: cardStar.checked, after: cardChecked }));
  // Restore: the document is not a favorite again, the app is in list view.
  await hoverPoint(cardPos.x, cardPos.y);
  await clickStable(`() => document.querySelector('.card[data-row-id="' + ${JSON.stringify(target)} + '"] .row-actions button[role="switch"]')`);
  await parkPointer();
  await setViewMode("list");
}

// The Settings menu (UI-17): the theme submenu (AC-28) and the dialog as a
// second entry point to the same state (AC-29).
async function pickTheme(label) {
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickStable(`() => document.querySelector('.menu.settings-menu .menu-item')`);
  const up = await waitForEval(`return document.querySelector('.menu.settings-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!up) throw new Error("the theme submenu did not open");
  await clickMenuItem('.menu.settings-sub', label);
  await keys("Escape");
  await menuClosed(".menu.settings-menu");
}

async function currentRamp() {
  return execute(`
    const root = document.documentElement;
    const style = getComputedStyle(root);
    // Resolved as a color: the engine may serialize a token differently from
    // the source, and the claim is about the color the window paints.
    const probe = document.createElement('div');
    probe.style.color = 'var(--surface-0)';
    document.body.appendChild(probe);
    const surface = getComputedStyle(probe).color;
    probe.remove();
    const accentProbe = document.createElement('div');
    accentProbe.style.color = 'var(--accent)';
    document.body.appendChild(accentProbe);
    const accent = getComputedStyle(accentProbe).color;
    accentProbe.remove();
    return {
      attr: root.dataset.theme ?? null,
      scheme: style.colorScheme ?? null,
      surface,
      accent,
      os: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    };
  `);
}

async function checkedThemeItem() {
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickStable(`() => document.querySelector('.menu.settings-menu .menu-item')`);
  const up = await waitForEval(`return document.querySelector('.menu.settings-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!up) throw new Error("the theme submenu did not open");
  const active = await execute(`
    const item = document.querySelector('.menu.settings-sub .menu-item[data-active]');
    return item ? (item.querySelector('.item-label')?.textContent ?? item.textContent).trim() : null;
  `);
  await keys("Escape");
  await menuClosed(".menu.settings-sub");
  await keys("Escape");
  await menuClosed(".menu.settings-menu");
  return active;
}

async function flowThemeAndSettings() {
  // Self-sufficient (D14): the Settings "View" half of the flow needs a grid
  // with cards mounted, so the flow builds its own unfiltered grid first.
  await setupGrid(2);
  const ramps = tokenRamps();

  await pickTheme("Light");
  const light = await currentRamp();
  check("AC-28: choosing Light switches the whole window to the light ramp immediately",
    light.attr === "light" && light.surface === ramps.light && light.scheme === "light",
    `data-theme: ${light.attr}, --surface-0: ${light.surface}, color-scheme: ${light.scheme}, OS: ${light.os}`);
  // AC-43 (live half): the running app paints the corrected accent from the
  // token file the contrast test verified.
  check("AC-43: the running app resolves --accent to the corrected light value",
    light.accent === ramps.accentLight, `app: ${light.accent}, tokens: ${ramps.accentLight}`);
  check("UI-17: the theme submenu shows the chosen theme as its checked item",
    (await checkedThemeItem()) === "Light");

  await pickTheme("Dark");
  const dark = await currentRamp();
  check("AC-28: choosing Dark switches it to the dark ramp",
    dark.attr === "dark" && dark.surface === ramps.dark && dark.scheme === "dark",
    `data-theme: ${dark.attr}, --surface-0: ${dark.surface}`);
  check("AC-43: the running app resolves --accent to the corrected dark value",
    dark.accent === ramps.accentDark, `app: ${dark.accent}, tokens: ${ramps.accentDark}`);

  // Persistence: the choice is a stored setting and is applied again at startup.
  await pickTheme("Light");
  await restartApp();
  await instrumentBoundary();
  const afterRestart = await currentRamp();
  check("AC-28: the chosen ramp is applied again after a restart",
    afterRestart.attr === "light" && afterRestart.surface === ramps.light,
    `data-theme: ${afterRestart.attr}, --surface-0: ${afterRestart.surface}`);

  await pickTheme("System");
  const system = await currentRamp();
  check("AC-28: System follows the operating system",
    system.attr === system.os && (system.os === "dark" ? system.surface === ramps.dark : system.surface === ramps.light),
    `data-theme: ${system.attr}, --surface-0: ${system.surface}, OS ramp: ${system.os}`);

  // AC-29: the dialog is a second entry point to the same state, not a copy.
  // The Browse menu's counts are read first: the dialog is modal, and a modal
  // owns the keyboard — reading the menu afterwards would test the trap, not
  // the counts. The library must be unfiltered for the view half below to have
  // documents to show.
  await browseSelect("All documents");
  await clearSearch();
  const browse = await browseCounts();
  const about = await capturedValue(`() => window.__TAURI_INTERNALS__.__smokeAbout`);

  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickMenuItem('.menu.settings-menu', "Settings");
  const opened = await waitForEval(`
    const dialog = document.querySelector('.modal');
    return dialog && dialog.textContent.includes('Appearance') && dialog.textContent.includes('Library') ? true : null;
  `, { timeout: 8000 });
  check("AC-29: Settings opens the dialog with its two sections", !!opened);
  const trapped = await waitForEval(`
    const dialog = document.querySelector('.modal');
    const active = document.activeElement;
    return dialog && active && dialog.contains(active) ? true : null;
  `, { timeout: 4000 });
  const focus = await execute(`
    const active = document.activeElement;
    return active ? active.tagName.toLowerCase() + (active.className ? "." + String(active.className).trim().split(/\s+/)[0] : "") : "none";
  `);
  check("AC-29: the dialog is focus-trapped", !!trapped, `focus ended on ${focus}`);

  const library = await execute(`
    const out = {};
    for (const row of document.querySelectorAll('.modal .info-row')) {
      out[row.querySelector('dt')?.textContent.trim()] = row.querySelector('dd')?.textContent.trim();
    }
    return out;
  `);
  check("AC-29: the Library section shows the same counts the Browse menu shows and the same version About shows",
    library["Documents"] === browse["All documents"] &&
      library["Favorites"] === browse["Favorites"] &&
      library["Missing files"] === browse["Missing files"] &&
      !!about && library["Version"] === about.version && library["Application"] === about.name,
    `dialog: ${JSON.stringify(library)} | browse: ${JSON.stringify(browse)} | about: ${JSON.stringify(about)}`);

  // AC-44 (UI-22): the section headings are the dialog's own sentence-case
  // scale — no uppercase transform, no letter-spacing.
  const headings = await execute(`
    return Array.from(document.querySelectorAll('.modal .section-title')).map((h) => {
      const cs = getComputedStyle(h);
      return { text: h.textContent.trim(), transform: cs.textTransform, tracking: cs.letterSpacing };
    });
  `);
  check("AC-44: the Settings section headings compute text-transform none and letter-spacing normal",
    headings.length === 2 &&
      headings.every((h) => h.transform === "none" && (h.tracking === "normal" || h.tracking === "0px")),
    JSON.stringify(headings));

  // AC-41 (UI-21): the Library section names the location the app itself
  // writes to. The value comes from the app's own `app_data_dir` round-trip;
  // the harness compares it with the directory it drives the app with (the
  // same APPDATA path), separators and trailing slashes normalized away.
  const locationRow = await execute(`
    for (const row of document.querySelectorAll('.modal .info-row')) {
      if (row.querySelector('dt')?.textContent.trim() === 'Location') {
        return row.querySelector('dd')?.textContent.trim() ?? '';
      }
    }
    return null;
  `);
  const normPath = (p) => String(p ?? "").replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  check("AC-41: the Settings Library section shows the library location, selectable text",
    typeof locationRow === "string" && locationRow.length > 0 && normPath(locationRow) === normPath(DATA_DIR),
    `dialog: ${JSON.stringify(locationRow)} | harness data dir: ${DATA_DIR}`);
  const selectable = await execute(`
    for (const row of document.querySelectorAll('.modal .info-row')) {
      if (row.querySelector('dt')?.textContent.trim() === 'Location') {
        return getComputedStyle(row.querySelector('dd')).userSelect;
      }
    }
    return null;
  `);
  check("UI-21: the location value is selectable text", selectable === "all", `user-select: ${selectable}`);

  // AC-49 (UI-27): the dialog's vertical rhythm on the 4 px scale.
  const rhythm = await execute(`
    const sections = document.querySelectorAll('.modal .settings-section');
    if (sections.length < 2) return null;
    return { gap: getComputedStyle(sections[0]).rowGap, sep: getComputedStyle(sections[1]).marginTop };
  `);
  check("AC-49: the settings section gap and section separation are multiples of 4 px",
    !!rhythm && onScalePx(rhythm.gap) && onScalePx(rhythm.sep), JSON.stringify(rhythm));

  // One state, two entry points: a change made here is live in the View menu
  // with no reload, and a change made there is live here.
  await clickStable(`() => {
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'View');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).find((b) => b.textContent.trim() === 'Grid view') ?? null;
  }`);
  await closeDialog("the settings dialog");
  const rendered = await waitForEval(`return document.querySelectorAll('.card[data-row-id]').length > 0 ? true : null;`, { timeout: 15000 });
  await openMenuSure(".view-trigger", ".menu.view-menu");
  const viewState = await execute(`
    const active = [];
    for (const item of document.querySelectorAll('.menu.view-menu .menu-item')) {
      if (item.hasAttribute('data-active')) active.push((item.querySelector('.item-label')?.textContent ?? item.textContent).trim());
    }
    return { active, cards: document.querySelectorAll('.card[data-row-id]').length };
  `);
  await keys("Escape");
  await menuClosed(".menu.view-menu");
  check("AC-29: a view change made in the dialog is live in the View menu and on screen without a reload",
    viewState.active.includes("Grid view") && !!rendered && viewState.cards > 0, JSON.stringify(viewState));

  await openMenuSure(".view-trigger", ".menu.view-menu");
  await clickStable(`() => {
    const item = Array.from(document.querySelectorAll('.menu.view-menu .menu-item'))
      .find((e) => (e.querySelector('.item-label')?.textContent ?? e.textContent).trim().startsWith('List view'));
    return item ?? null;
  }`);
  await keys("Escape");
  await menuClosed(".menu.view-menu");
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickMenuItem('.menu.settings-menu', "Settings");
  const dialogState = await execute(`
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'View');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).map((b) => ({
      label: b.textContent.trim(), checked: b.getAttribute('aria-checked') === 'true',
    }));
  `);
  check("AC-29: the change the View menu made is live in the dialog",
    !!dialogState && dialogState.some((r) => r.label === "List view" && r.checked) &&
      dialogState.some((r) => r.label === "Grid view" && !r.checked),
    JSON.stringify(dialogState));

  await closeDialog("the settings dialog");
  const closed = await execute(`return document.querySelector('.modal') ? null : true;`);
  check("AC-29: Esc closes the settings dialog", !!closed);
}

// AC-30 (UI-18): the two modes and the selection semantics of each, in list and
// in grid. The mode itself is session state: it is off after a restart.
async function flowSelectMode() {
  await setViewMode("list");
  await browseSelect("All documents");
  await clearSearch();
  await clearSelectionIfAny();

  const off = await execute(`return document.querySelector('.select-toggle')?.getAttribute('aria-pressed') ?? null;`);
  check("AC-30: Select mode is off at startup", off === "false", `aria-pressed: ${off}`);

  const ids = await execute(`
    return Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 3).map((el) => el.getAttribute('data-row-id'));
  `);
  if (ids.length < 3) throw new Error(`the selection checks need three rendered rows, found ${ids.length}`);

  // Off: a plain click focuses, it never selects.
  await resetOpenCounter();
  await clickAtStable(`[data-row-id="${ids[0]}"]`);
  const afterClick = await selectionState();
  check("AC-30 (off): a click on a row changes no selection and takes the row's focus",
    afterClick.count === 0 && afterClick.focused === ids[0], JSON.stringify(afterClick));

  // Off: Space on the focused row selects; Ctrl/Shift-click is the pointer path.
  await keys("Space");
  const afterSpace = await selectionState();
  check("AC-30 (off): Space on the focused row selects",
    afterSpace.count === 1 && afterSpace.ids.includes(Number(ids[0])), JSON.stringify(afterSpace));

  await clickModifier(ids[1], { ctrlKey: true });
  await clickModifier(ids[2], { shiftKey: true });
  const ranged = await selectionState();
  check("AC-30 (off): Ctrl-click selects and Shift-click extends the range",
    ranged.count === 3 && ids.every((id) => ranged.ids.includes(Number(id))), JSON.stringify(ranged));

  // Off: activation is unchanged — a real double click opens.
  await resetOpenCounter();
  await doubleClickStable(`() => document.querySelector('[data-row-id="${ids[0]}"]')`);
  const opened = await openCallCount();
  check("AC-30 (off): double-click still opens the document",
    opened === 1, `app_open_document calls: ${opened}`);
  await clearSelectionIfAny();

  // On: a click toggles selection and never opens.
  await click('.select-toggle');
  const on = await execute(`return document.querySelector('.select-toggle')?.getAttribute('aria-pressed') ?? null;`);
  check("AC-30: the toolbar toggle turns Select mode on", on === "true", `aria-pressed: ${on}`);
  await resetOpenCounter();
  await clickAtStable(`[data-row-id="${ids[0]}"]`);
  const selectedByClick = await selectionState();
  const clicksOpen = await openCallCount();
  check("AC-30 (on): a click selects and never opens",
    selectedByClick.count === 1 && clicksOpen === 0, `selection: ${JSON.stringify(selectedByClick.ids)}, opens: ${clicksOpen}`);

  // The bulk actions apply to that selection (UI-04 unchanged).
  const targets = [Number(ids[0]), Number(ids[1])];
  await clickModifier(ids[1], { ctrlKey: true });
  const selectedNow = await selectionState();
  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Add to favorites"]]', "xpath");
  const starred = await starStatesReached(targets, "true");
  check("AC-30 (on): the BulkBar's favorite action applies to the selection",
    selectedNow.count === 2 && starred.every((s) => s.checked === "true"), JSON.stringify(starred));
  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Remove from favorites"]]', "xpath");
  const unstarred = await starStatesReached(targets, "false");
  check("AC-30 (on): the BulkBar's favorite action also lifts it again",
    unstarred.every((s) => s.checked === "false"), JSON.stringify(unstarred));
  await clearSelectionIfAny();

  // Grid: the same semantics on cards.
  await setViewMode("grid");
  await clickStable(`() => document.querySelector('.card[data-row-id]')`);
  const gridSelected = await execute(`
    return {
      count: document.querySelectorAll('.card[data-selected]').length,
      bulk: !!document.querySelector('.bulk-bar'),
    };
  `);
  check("AC-30 (on, grid): a click on a card selects it", gridSelected.count === 1 && gridSelected.bulk, JSON.stringify(gridSelected));
  await clearSelectionIfAny();
  await click('.select-toggle');
  const backOff = await execute(`return document.querySelector('.select-toggle')?.getAttribute('aria-pressed') ?? null;`);
  await clickStable(`() => document.querySelector('.card[data-row-id]')`);
  const gridUntouched = await execute(`
    return { selected: document.querySelectorAll('.card[data-selected]').length, bulk: !!document.querySelector('.bulk-bar') };
  `);
  check("AC-30 (off, grid): a click on a card changes no selection",
    backOff === "false" && gridUntouched.selected === 0 && !gridUntouched.bulk, JSON.stringify(gridUntouched));
  await setViewMode("list");

  // §5.2's other half: with no overlay open, Escape clears the selection. The
  // app's window-level handler defers to any overlay that consumed the key, so
  // a kit escape layer still registered by a closed menu would swallow it here.
  const focusable = await execute(EVAL.focusFirstRow);
  if (!focusable) throw new Error("no row could be focused for the selection-clearing check");
  await keys("Space");
  const selected = await selectionState();
  await keys("Escape");
  const cleared = await selectionState();
  check("§5.2: Escape with no overlay open clears the selection",
    selected.count > 0 && cleared.count === 0 && !cleared.bulk,
    `before: ${selected.count} selected, after: ${cleared.count} selected, bulk bar: ${cleared.bulk}`);

  // The mode is never persisted.
  await click('.select-toggle');
  await restartApp();
  await instrumentBoundary();
  const afterRestart = await execute(`
    return document.querySelector('.select-toggle')?.getAttribute('aria-pressed') ?? null;
  `);
  check("AC-30: Select mode is off again after a restart", afterRestart === "false", `aria-pressed: ${afterRestart}`);
}

async function selectionState() {
  return execute(`
    return {
      count: document.querySelectorAll('[data-selected]').length,
      ids: Array.from(document.querySelectorAll('[data-selected]')).map((el) => Number(el.getAttribute('data-row-id'))),
      bulk: !!document.querySelector('.bulk-bar'),
      focused: document.activeElement?.getAttribute('data-row-id') ?? null,
    };
  `);
}

async function readStarStates(rowIds) {
  return execute(`
    return arguments[0].map((id) => {
      const row = document.querySelector('[data-row-id="' + id + '"]');
      const star = row ? row.querySelector('.star') : null;
      return { id, checked: star ? star.getAttribute('aria-checked') : null };
    });
  `, [rowIds]);
}

// A bulk action is a command round-trip plus a list re-render: read the stars
// until they say what the action asked for, so the assertion measures the
// action and not how fast this machine re-rendered.
async function starStatesReached(rowIds, expected) {
  const deadline = Date.now() + 8000;
  for (;;) {
    const states = await readStarStates(rowIds);
    if (states.every((s) => s.checked === expected)) return states;
    if (Date.now() > deadline) return states;
    await sleep(150);
  }
}

// The app's own click handler, with the modifier flags a real Ctrl- or
// Shift-click produces on that exact element.
async function clickModifier(rowId, modifiers) {
  const applied = await execute(`
    const el = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: Math.round(r.x + 120), clientY: Math.round(r.y + r.height / 2),
      button: 0, ...arguments[1],
    }));
    return true;
  `, [rowId, modifiers]);
  if (!applied) throw new Error(`row ${rowId} is not rendered`);
  await sleep(200);
}

async function openCallCount() {
  return execute(`return window.__TAURI_INTERNALS__.__openCalls ?? null;`);
}

// Runs one flow isolated: a crash is recorded as a failed check named after the
// flow, the app is left in a clean state, and the rest of the suite still runs.
// D14 (AC-54): every flow is timed; the durations feed the summary table and
// the NFR-06 budget check at the end of the run.
const timings = [];
async function runFlow(name, fn) {
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (error) {
    let trace = "";
    try {
      trace = await execute(`
        const internals = window.__TAURI_INTERNALS__;
        return (internals?.__smokeSeen ?? []).slice(-12).join(' → ');
      `);
    } catch { /* the page or the session is gone */ }
    fail(`flow ${name} crashed`, error.message + (trace ? ` — after: ${trace}` : ""));
    await recoverAfterCrash();
  }
  const ms = Date.now() - started;
  timings.push({ name, ms });
  console.log(`[TIME] ${name} +${ms}ms`);
  return result;
}

// A mandatory prefix phase, timed the same way (AC-54).
async function timedPhase(name, fn) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - started;
    timings.push({ name, ms });
    console.log(`[TIME] ${name} +${ms}ms`);
  }
}

// A crashed flow can leave an overlay, a selection, or a search term behind;
// every following flow assumes a clean list.
async function recoverAfterCrash() {
  try {
    await keys("Escape");
    await sleep(200);
    await keys("Escape");
    await clearSelectionIfAny();
    await clearSearch();
  } catch { /* the session is gone; the next flow will report it */ }
}

// ============================================================ v0.0.4 flows ===
// AC-39 … AC-51 (SPEC-v0.0.4.md §4). The dialog/row flows above carry the
// measurements that belong inside flows that already open those surfaces
// (AC-41, AC-44, AC-47, and the Settings/About/progress/toast/empty-state
// halves of AC-49); the flows below add the rest.

// Shared by the gap checks: a computed length that is a multiple of 4 px.
function onScalePx(v) {
  return typeof v === "string" && /^\d+(\.\d+)?px$/.test(v) && Number.parseFloat(v) % 4 === 0;
}

// AC-39 (UI-19): the inset is real and the width math sees the content width —
// the grid window carries the 12 px inset, the derived columns fit the reduced
// content box, and the scroller never scrolls sideways.
async function flowContentGutter() {
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("grid");
  const g = await waitForEval(`
    const scroller = document.querySelector('.scroller');
    const win = scroller?.querySelector('.window');
    const block = win?.querySelector('.block');
    const cards = block ? block.querySelectorAll('[data-row-id]') : null;
    if (!scroller || !win || !block || !cards || cards.length === 0) return null;
    const probe = document.createElement('span');
    probe.style.padding = '0 var(--content-gutter)';
    document.body.append(probe);
    const pcs = getComputedStyle(probe);
    const token = { l: pcs.paddingLeft, r: pcs.paddingRight };
    probe.remove();
    const wcs = getComputedStyle(win);
    const sRect = scroller.getBoundingClientRect();
    let maxRight = 0;
    for (const c of cards) maxRight = Math.max(maxRight, c.getBoundingClientRect().right);
    return {
      token, padL: wcs.paddingLeft, padR: wcs.paddingRight,
      clientWidth: scroller.clientWidth, scrollWidth: scroller.scrollWidth,
      scrollerRight: sRect.right, maxCardRight: maxRight, cards: cards.length,
    };
  `, { timeout: 15000 });
  const px = (v) => (typeof v === "string" && /^\d+(\.\d+)?px$/.test(v) ? Number.parseFloat(v) : Number.NaN);
  check("AC-39: the grid window carries the 12 px content inset, the token's own value",
    !!g && px(g.padL) === px(g.token.l) && px(g.padL) === 12 && px(g.padR) === px(g.token.r) && px(g.padR) === 12,
    JSON.stringify(g && { padL: g.padL, padR: g.padR, token: g.token }));
  check("AC-39: the derived columns fit the content width — no horizontal overflow",
    !!g && g.scrollWidth <= g.clientWidth + 1 && g.maxCardRight <= g.scrollerRight - 12 + 1,
    JSON.stringify(g && { clientWidth: g.clientWidth, scrollWidth: g.scrollWidth, maxCardRight: g.maxCardRight, scrollerRight: g.scrollerRight }));
  await setViewMode("list");
  await waitForEval(`return document.querySelectorAll('[data-row-id]').length > 0 ? true : null;`, { timeout: 15000 });
}

// AC-35 (D6) + AC-39 (UI-19), the real-app halves at the window widths the ACs
// name that no other flow measures: 900 and 1900 px (1280 px is measured by
// flowViewColumns and flowContentGutter). In grid at Auto and at every manual
// count 2–10 — including the counts a narrow window clamps — the cards are the
// derived layout, the cover sits inside the card on all four sides, the border
// is drawn once, the gutter holds and nothing scrolls sideways; in list the
// rows carry the same gutter. Mounted nodes stay bounded at 10 000 documents.
async function flowWidthMatrix() {
  // Self-sufficient (D14): the flow builds its own unfiltered list before it
  // resizes the window. AC-56: no settle pauses — setWindowSize confirms the
  // re-derived geometry, and every view step is confirmed by the mounted rows.
  await setupListView(1);
  for (const width of [900, 1900]) {
    await setWindowSize(width);
    await browseSelect("All documents");
    await clearSearch();
    await setViewMode("grid");
    const ready = await waitForEval(`return document.querySelectorAll('.block .card[data-row-id]').length >= 2 ? true : null;`, { timeout: 20000 });
    if (!ready) throw new Error(`no cards mounted at ${width} px`);

    const autoGeo = await geometry();
    const autoExp = expected(autoGeo.area, null, autoGeo.gap);
    check(`AC-35/AC-39 (${width} px, Auto): the grid is the derived layout — cards and height exact, cover inside the card, one border, 12 px gutter, no overflow, mounted bounded`,
      gridFits(autoGeo, autoExp), JSON.stringify({ geo: autoGeo, expected: autoExp }));

    // AC-59 / D18 (DR-128): at the off-1280 widths the matrix measures the
    // clamp edges — manual 2 and manual 10 — not the full 2..10 walk; the
    // full measured walk lives in flowViewColumns at 1280 px, and
    // virtual.test.ts covers every count at every width. The menu keeps the
    // requested count (the released behavior); the layout clamps a count that
    // cannot fit at the 140 px floor (virtual.test.ts:193), so the grid is
    // measured against the clamped expectation while the menu is checked
    // against the request.
    const minState = await stepColumns(-1, 2);
    const minGeo = await geometry();
    const minExp = expected(minGeo.area, 2, minGeo.gap);
    check(`AC-35/AC-39 (${width} px, manual 2 → ${minExp.columns} columns): the derived layout holds at the lower clamp edge`,
      minState.count === 2 && gridFits(minGeo, minExp), JSON.stringify({ menu: minState.count, geo: minGeo, expected: minExp }));
    const maxState = await stepColumns(+1, 10);
    const maxGeo = await geometry();
    const maxExp = expected(maxGeo.area, 10, maxGeo.gap);
    check(`AC-35/AC-39 (${width} px, manual 10 → ${maxExp.columns} columns): the derived layout holds at the upper clamp edge`,
      maxState.count === 10 && gridFits(maxGeo, maxExp), JSON.stringify({ menu: maxState.count, geo: maxGeo, expected: maxExp }));
    await openViewMenu();
    await clickMenuItem('.menu.view-menu', "Auto");
    // The Auto click closes the menu; the next iteration starts from Auto, so
    // its application is confirmed by re-opened menu states (D16).
    if (!(await awaitAutoActive())?.autoActive) throw new Error(`Auto did not become the active choice again at ${width} px`);

    await setViewMode("list");
    const mounted = await waitForEval(`return document.querySelectorAll('.row[data-row-id]').length >= 2 ? true : null;`, { timeout: 20000 });
    if (!mounted) throw new Error(`no rows mounted in list view at ${width} px`);
    const list = await listGutter();
    check(`AC-39 (${width} px, list): the first row starts at the 12 px content inset and the meta column keeps the other edge clear`,
      !!list && list.firstLeft >= 11 && list.rightClear >= 11 && !list.hScroll, JSON.stringify(list));
  }
  // Return the harness window to its launch size with the layout re-derived
  // and confirmed by mounted cards (D16) — the next flow starts from a grid.
  await setWindowSize(1280);
  await setViewMode("grid");
  const restored = await waitForEval(`return document.querySelectorAll('.block .card[data-row-id]').length >= 2 ? true : null;`, { timeout: 20000 });
  if (!restored) throw new Error("the grid did not remount after restoring the 1280 px window");
}

// AC-42 (D10): the fill animates — the transition names the transform the
// component actually changes, with a duration that exists; the fill keeps
// width 100% and the progress rides the scaleX. The bar is caught by a
// page-side observer because a job can end between two polls; the job is the
// bounded cover job (§3.1.1), so the bar is real and long enough to measure.
async function flowProgressTransform() {
  await jobIdle(); // bounded: clear any in-flight job before starting our own
  await execute(`
    window.__progressProbe = null;
    window.__progressObs = new MutationObserver(() => {
      if (window.__progressProbe) return;
      const fill = document.querySelector('.progress-fill');
      const barEl = fill?.closest('.progress');
      const wrap = fill?.closest('.progress-wrap');
      if (!fill || !barEl) return;
      const cs = getComputedStyle(fill);
      window.__progressProbe = {
        prop: cs.transitionProperty, duration: cs.transitionDuration,
        fillWidth: cs.width, barWidth: getComputedStyle(barEl).width,
        rowGap: wrap ? getComputedStyle(wrap).rowGap : null,
      };
    });
    window.__progressObs.observe(document.body, { subtree: true, childList: true });
    return true;
  `);
  await startBoundedCoverJob(); // the flow's own job (§3.1.1) — the observer sees its bar
  const bar = await waitForEval(`return window.__progressProbe ?? null;`, { timeout: 20000 });
  await execute(`window.__progressObs?.disconnect(); return true;`);
  const px = (v) => (typeof v === "string" && /^\d+(\.\d+)?px$/.test(v) ? Number.parseFloat(v) : Number.NaN);
  check("AC-42: the progress fill transitions transform with a real duration",
    !!bar && bar.prop === "transform" && Number.parseFloat(bar.duration) > 0, JSON.stringify(bar));
  check("AC-42: the fill keeps width 100% of the bar — the progress rides the transform",
    !!bar && Math.abs(px(bar.fillWidth) - px(bar.barWidth)) <= 1, JSON.stringify(bar));
  check("AC-49: the progress row gap is a multiple of 4 px", onScalePx(bar?.rowGap), `row-gap: ${bar?.rowGap}`);
  await jobIdle();
}

// AC-45 (UI-23): the meta column is fixed — its left edge and the figures'
// right edge are the same on every row regardless of filename length. A row
// whose filename length differs from the fixtures' is imported through the
// app's own import command, and title-descending puts it in the first rendered
// rows. The imported document is deleted again at the end.
async function flowMetaColumn() {
  // Self-sufficient (D14): the flow builds its own unfiltered list view — the
  // meta column is a list-mode geometry and the count it reads must be the
  // library-wide one.
  await setupListView(1);
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const beforeText = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent.trim() ?? null;`);
  const before = Number(String(beforeText).replace(/,/g, ""));
  if (!Number.isFinite(before) || before === 0) throw new Error(`the meta-column flow needs a populated library, count: ${beforeText}`);

  // The flow's own boundary instrumentation: the import is awaited at the
  // boundary (D16) and the sort state below is verified at the same one.
  await instrumentBoundary();
  await execute(
    `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryIds: [] });`,
    [[join(FIXTURE_SPECIAL, "info-title.pdf")]],
  );
  const imported = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count');
    return t?.textContent.trim() === arguments[0] ? true : null;
  `, { timeout: 15000, args: [group(before + 1)] });
  check("meta-column flow: the differently-named fixture imported", !!imported, `count: ${beforeText} → expected ${group(before + 1)}`);

  // The sort state this flow depends on is verified where it acts: the app's
  // next query must carry the requested order (boundary capture, D16).
  await chooseSort({ primary: "Title", dir: "Descending" });
  await capturedSearch(`(s) => s.args.sort === 'title' && s.args.dir === 'desc'`);
  // The edges are the at-rest geometry: a hovered or focused row shows its
  // actions line, which takes space before the meta column and moves it.
  await parkPointer();
  const edges = await waitForEval(`
    const rows = Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 12);
    if (rows.length < 5) return null;
    const metas = [];
    const nameLengths = [];
    for (const row of rows) {
      const m = row.querySelector('.meta');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      metas.push({ left: r.left, right: r.right, width: r.width });
      nameLengths.push(row.querySelector('.filename')?.textContent.trim().length ?? 0);
    }
    return { metas, nameLengths };
  `, { timeout: 15000 });
  const spread = (a) => Math.max(...a) - Math.min(...a);
  check("AC-45: the meta column's left edge and the figures' right edge are uniform across rows",
    !!edges && spread(edges.metas.map((m) => m.left)) <= 1 && spread(edges.metas.map((m) => m.right)) <= 1,
    JSON.stringify(edges && { leftSpread: spread(edges.metas.map((m) => m.left)), rightSpread: spread(edges.metas.map((m) => m.right)) }));
  check("AC-45: the meta column reserves the fixed 96 px box",
    !!edges && edges.metas.every((m) => Math.abs(m.width - 96) <= 1),
    JSON.stringify(edges && edges.metas.map((m) => m.width)));
  check("AC-45: the measured rows actually carry filenames of different lengths",
    !!edges && new Set(edges.nameLengths).size >= 2, JSON.stringify(edges && edges.nameLengths));

  // Remove the imported document again through the app's own delete path, and
  // restore the default order for the flows that follow.
  await searchFor("Real Info Title");
  await execute(`document.querySelector('[data-row-id]')?.focus(); return true;`);
  await keys("Space");
  await execute(EVAL.focusFirstRow);
  await keys("Delete");
  const confirm = await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
  check("meta-column flow: the imported row is selected and the delete confirmation opened", !!confirm);
  await click('//button[normalize-space()="Delete from library"]', "xpath");
  const removed = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count');
    return t?.textContent.trim() === arguments[0] ? true : null;
  `, { timeout: 15000, args: [group(before)] });
  check("meta-column flow: the imported document is gone again", !!removed);
  await clearSearch();
  await chooseSort({ primary: "Title", dir: "Ascending" });
  await capturedSearch(`(s) => s.args.sort === 'title' && s.args.dir === 'asc'`);
}

// AC-46 (UI-24): the category row's live count renders as quiet tabular text
// — no ground, no border, no pill. (The dead-code half of the AC — no `.chip`
// anywhere — is asserted in `ui/src/lib/chip-cutover.test.ts`.)
async function flowQuietCounts() {
  // Self-sufficient (D14): the claim is about the manager's category rows,
  // so the flow builds some categories instead of inheriting them.
  await ensureCategories(3);
  await openCategoriesManager();
  const counts = await waitForEval(`
    const rows = document.querySelectorAll('.category-row');
    if (rows.length === 0) return null;
    const out = [];
    for (const row of rows) {
      const c = row.querySelector('.cat-count');
      if (!c) return null;
      const cs = getComputedStyle(c);
      out.push({
        text: c.textContent.trim(), ground: cs.backgroundColor,
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle, fvn: cs.fontVariantNumeric,
      });
    }
    return out;
  `, { timeout: 8000 });
  check("AC-46: a category row's count computes transparent ground, no border, tabular figures",
    !!counts && counts.length > 0 &&
      counts.every((c) => c.ground === "rgba(0, 0, 0, 0)" && c.border === "0px none" && c.fvn.includes("tabular-nums")),
    JSON.stringify(counts));
  await closeDialog("the categories manager");
}

// AC-48 (UI-26): every item of the Browse menu carries exactly one 16 px
// leading glyph in the column the menu reserves — including Manage categories,
// which takes the same `tag` path the Categories submenu trigger carries.
async function flowBrowseIcons() {
  await openMenuSure('.browse-trigger', '.menu.browse-menu');
  const items = await waitForEval(`
    const out = [];
    for (const item of document.querySelectorAll('.menu.browse-menu > .menu-item')) {
      const label = item.querySelector('.item-label');
      const svgs = label ? Array.from(label.querySelectorAll('svg')) : [];
      out.push({
        text: (label?.textContent ?? item.textContent).trim().slice(0, 30),
        glyphs: svgs.length,
        firstSize: svgs[0] ? svgs[0].getBoundingClientRect().width : null,
      });
    }
    return out;
  `, { timeout: 8000 });
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  check("AC-48: every Browse menu item renders exactly one 16 px leading glyph",
    !!items && items.length >= 5 && items.every((i) => i.glyphs === 1 && Math.abs(i.firstSize - 16) < 1),
    JSON.stringify(items));
}

// AC-51 + AC-50 + the remaining AC-49 surfaces: empty the library through the
// app's own bulk path, observe the keycap hint and the empty-state and toast
// rhythm, then let a real query on the now-empty result set mount the
// first-paint skeleton — caught by a page-side observer at the moment it
// mounts, because the query answer arrives quickly.
async function flowEmptyAndSkeleton() {
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  await clearSelectionIfAny();

  // The exact total is whatever the preceding flows left behind — read it,
  // group it the way the status bar groups it, and drive every later
  // expectation from that number.
  const countText = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent.trim() ?? null;`);
  const total = Number(String(countText).replace(/,/g, ""));
  if (!Number.isFinite(total) || total === 0) throw new Error(`the empty-library flow needs a populated library, count: ${countText}`);
  const grouped = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // The user's own path: Ctrl+A selects the loaded rows, the bulk bar's
  // "Select all N matching" extends it to the whole library.
  await execute(`document.querySelector('[data-row-id]')?.focus(); return true;`);
  await keys("^Control", "a", "~a", "~Control");
  const bulk = await waitForEval(`return !!document.querySelector('.bulk-bar');`, { timeout: 8000 });
  check("empty-library flow: Ctrl+A opened the bulk bar", !!bulk);
  await clickStable(`() => Array.from(document.querySelectorAll('.bulk-bar button')).find((b) => b.textContent.includes('matching')) ?? null`);
  const selectedAll = await waitForEval(`
    const c = document.querySelector('.bulk-bar .bulk-count');
    return c && c.textContent.includes(arguments[0] + ' selected') ? true : null;
  `, { timeout: 15000, args: [grouped] });
  check("the bulk bar's Select-all-matching selects the whole library", !!selectedAll, `wanted: "${grouped} selected"`);

  await execute(EVAL.focusFirstRow);
  await keys("Delete");
  const confirm = await waitForEval(EVAL.bodyHas, { args: [`Delete ${grouped} documents?`] });
  check("the confirmation names the whole selection", !!confirm, `wanted: "Delete ${grouped} documents?"`);
  await click('//button[normalize-space()="Delete from library"]', "xpath");
  const emptied = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count');
    return !t || t.textContent.trim() === '0' ? true : null;
  `, { timeout: 30000 });
  check("empty-library flow: the library is empty", !!emptied);

  // AC-49: the toast stack's rhythm, measured while the delete toast is up.
  const toastR = await waitForEval(`
    const stack = document.querySelector('.toast-stack');
    if (!stack || stack.children.length === 0) return null;
    const cs = getComputedStyle(stack);
    return { gap: cs.rowGap, padTop: cs.paddingTop, padBottom: cs.paddingBottom };
  `, { timeout: 8000 });
  check("AC-49: the toast stack gap and vertical padding are multiples of 4 px",
    !!toastR && onScalePx(toastR.gap) && onScalePx(toastR.padTop) && onScalePx(toastR.padBottom),
    JSON.stringify(toastR));

  // AC-51 (UI-29): the empty library names its shortcut as keycaps — the
  // combination is two kbd elements, monospace on a surface-2 ground with a
  // hairline border — and the hint's text content is the shipped string.
  const empty = await waitForEval(`
    const box = document.querySelector('.empty-state');
    const hint = box?.querySelector('.hint');
    const kbds = hint ? Array.from(hint.querySelectorAll('kbd')) : [];
    if (!box || !hint || kbds.length === 0) return null;
    const bcs = getComputedStyle(box);
    const kcs = getComputedStyle(kbds[0]);
    const probe = document.createElement('span');
    probe.style.background = 'var(--surface-2)';
    probe.style.fontFamily = 'var(--font-mono)';
    document.body.append(probe);
    const pcs = getComputedStyle(probe);
    const surface2 = pcs.backgroundColor;
    const mono = pcs.fontFamily;
    probe.remove();
    return {
      gap: bcs.rowGap,
      text: hint.textContent.replace(/\\s+/g, ' ').trim(),
      keys: kbds.map((k) => k.textContent),
      font: kcs.fontFamily, ground: kcs.backgroundColor,
      radius: kcs.borderRadius, border: kcs.borderTopWidth + ' ' + kcs.borderTopStyle,
      surface2, mono,
    };
  `, { timeout: 15000 });
  check("AC-51: the hint renders the combination as keycap elements, text content unchanged",
    !!empty && empty.keys.length === 2 && empty.keys[0] === "Ctrl" && empty.keys[1] === "I" &&
      empty.text === "or press Ctrl+I",
    JSON.stringify(empty && { keys: empty.keys, text: empty.text }));
  check("AC-51: the keycaps are monospace, on a surface-2 ground, with a hairline border and 6 px radius",
    !!empty && empty.font === empty.mono && empty.ground === empty.surface2 &&
      // The declared 1 px hairline snaps to whole device px; at 175 % scaling it
      // computes back as 0.5714 CSS px. The claim is a hairline SOLID border,
      // not a specific sub-pixel number.
      /solid/.test(empty.border) && Number.parseFloat(empty.border) > 0 &&
      Number.parseFloat(empty.radius) === 6,
    JSON.stringify(empty && { font: empty.font, ground: empty.ground, border: empty.border, radius: empty.radius }));
  check("AC-49: the empty state's vertical rhythm is a multiple of 4 px",
    !!empty && onScalePx(empty.gap), `row-gap: ${empty && empty.gap}`);

  // AC-50 (UI-28): a real query on the empty result set mounts the skeleton
  // (loading, no rows) — the observer captures the block the moment it mounts.
  await execute(`
    window.__skelProbe = null;
    window.__skelObs = new MutationObserver(() => {
      if (window.__skelProbe) return;
      const row = document.querySelector('.skeleton-row');
      if (!row) return;
      const cover = row.querySelector('.cover');
      const meta = row.querySelector('.meta');
      const title = row.querySelector('.title');
      if (!cover || !meta || !title) return;
      const r = row.getBoundingClientRect();
      const c = cover.getBoundingClientRect();
      const m = meta.getBoundingClientRect();
      const t = title.getBoundingClientRect();
      window.__skelProbe = {
        rowH: r.height, coverW: c.width, coverH: c.height,
        metaW: m.width, metaRight: m.right, rowRight: r.right, titleH: t.height,
      };
    });
    window.__skelObs.observe(document.body, { subtree: true, childList: true });
    return true;
  `);
  await typeInto(".search-input", "zzq");
  const sk = await waitForEval(`return window.__skelProbe ?? null;`, { timeout: 8000 });
  await execute(`window.__skelObs?.disconnect(); return true;`);
  check("AC-50: the skeleton row is the real row block (64 px) with the real cover placeholder (45×64)",
    !!sk && Math.abs(sk.rowH - 64) <= 1 && Math.abs(sk.coverW - 45) <= 1 && Math.abs(sk.coverH - 64) <= 1,
    JSON.stringify(sk));
  check("AC-50: the meta placeholder reserves the fixed 96 px column at the row's inset",
    !!sk && Math.abs(sk.metaW - 96) <= 1 && Math.abs(sk.rowRight - sk.metaRight - 12) <= 1,
    JSON.stringify(sk));
  await clearSearch();
}

// AC-34 (D5): with a 30-category library the Categories submenu panel lies
// wholly inside the viewport and scrolls, every category is reachable by
// pointer and by keyboard, and the View menu and a row context menu stay
// inside the window. The categories are created through the app's own manager
// (the store path) and left in place: the library is rebuilt per run
// (prepareEnvironment) and the only flow that follows never reads categories.
async function flowMenuBounds() {
  await clearCategoryFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  await parkPointer();
  await ensureCategories(30);
  const rowsReady = await waitForEval(`return document.querySelectorAll('[data-row-id]').length >= 3 ? true : null;`, { timeout: 20000 });
  if (!rowsReady) throw new Error("the menu-bounds flow needs rows for the context menu");

  const panelBox = (sel) => execute(`
    const panel = document.querySelector(arguments[0]);
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return {
      left: Math.round(r.left), top: Math.round(r.top),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      vw: window.innerWidth, vh: window.innerHeight,
      // 1 px slack on every edge: floating-ui rounds placement coordinates to
      // integers, and the driver's WebView (dpr 1.75, DR-122's probe) renders
      // the panel's 1 px borders as 0.5714 px — a flipped panel can land
      // 0.14 px past the edge there while sitting exactly flush at 1.0 scale.
      // The AC-34 claim is "no menu panel extends past a window edge" in the
      // real app; sub-device-pixel rounding is not an extension.
      inside: r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
      scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
      items: panel.querySelectorAll('.menu-item').length,
    };
  `, [sel]);
  const contained = (box) => !!box && box.inside;

  // Browse ▸ Categories submenu, opened by pointer.
  await openMenu('.browse-trigger', '.menu.browse-menu');
  const subTrigger = await waitForEval(`
    const item = Array.from(document.querySelectorAll('.menu.browse-menu .menu-item')).find((i) => i.textContent.includes('Categories'));
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, { timeout: 5000 });
  if (!subTrigger) throw new Error("the Browse menu shows no Categories submenu trigger");
  await hoverPoint(subTrigger.x, subTrigger.y);
  const subUp = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!subUp) throw new Error("the Categories submenu did not open on hover");

  const subBox = await panelBox('.menu.browse-sub');
  check("AC-34: the Categories submenu panel lies wholly inside the viewport", contained(subBox), JSON.stringify(subBox));
  check("AC-34: with 30 categories the submenu scrolls (scrollHeight > clientHeight)",
    !!subBox && subBox.items >= 30 && subBox.scrollHeight > subBox.clientHeight, JSON.stringify(subBox));

  // Every category reachable by pointer: scroll the panel and collect the
  // items fully visible at each step.
  const pointerReach = await execute(`
    const panel = document.querySelector('.menu.browse-sub');
    if (!panel) return null;
    const seen = new Set();
    const collect = () => {
      const pr = panel.getBoundingClientRect();
      for (const item of panel.querySelectorAll('.menu-item')) {
        const r = item.getBoundingClientRect();
        if (r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5) seen.add(item.textContent.trim());
      }
    };
    const total = panel.querySelectorAll('.menu-item').length;
    panel.scrollTop = 0;
    collect();
    const step = Math.max(40, Math.floor(panel.clientHeight * 0.8));
    for (let y = step; y <= panel.scrollHeight + step; y += step) {
      panel.scrollTop = y;
      collect();
    }
    return { reached: seen.size, total };
  `);
  check("AC-34: every category in the submenu is reachable by pointer (fully visible at some scroll position)",
    !!pointerReach && pointerReach.total >= 30 && pointerReach.reached === pointerReach.total, JSON.stringify(pointerReach));

  // The last item is hoverable at the bottom of the scroll.
  const lastPos = await waitForEval(`
    const panel = document.querySelector('.menu.browse-sub');
    if (!panel) return null;
    const items = panel.querySelectorAll('.menu-item');
    const last = items[items.length - 1];
    const r = last.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), name: last.textContent.trim() };
  `, { timeout: 5000 });
  await hoverPoint(lastPos.x, lastPos.y);
  const hoveredLast = await waitForEval(`
    const hi = document.querySelector('.menu.browse-sub .menu-item[data-highlighted]');
    return hi ? hi.textContent.trim() : null;
  `, { timeout: 4000 });
  check("AC-34: the last category item highlights on pointer hover at the bottom of the scroll",
    !!hoveredLast && hoveredLast === lastPos.name, JSON.stringify({ last: lastPos.name, hovered: hoveredLast }));
  await parkPointer();
  await keys("Escape"); // close the submenu; the parent menu keeps focus

  // Keyboard: walk to the trigger, open the submenu with ArrowRight; End
  // reaches the last item and focuses it; Home then ArrowDown walks every item.
  let onTrigger = false;
  for (let step = 0; step < 12 && !onTrigger; step += 1) {
    await keys("ArrowDown");
    onTrigger = !!(await waitForEval(`
      const hi = document.querySelector('.menu.browse-menu .menu-item[data-highlighted]');
      return hi && hi.textContent.includes('Categories') ? true : null;
    `, { timeout: 1000 }));
  }
  if (!onTrigger) throw new Error("keyboard navigation never reached the Categories submenu trigger");
  await keys("ArrowRight");
  const subOpen = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!subOpen) throw new Error("ArrowRight did not open the Categories submenu");
  await keys("End");
  const endState = await waitForEval(`
    const panel = document.querySelector('.menu.browse-sub');
    if (!panel) return null;
    const items = Array.from(panel.querySelectorAll('.menu-item'));
    const last = items[items.length - 1];
    const hi = panel.querySelector('.menu-item[data-highlighted]');
    const adId = document.activeElement ? document.activeElement.getAttribute('aria-activedescendant') : null;
    const ad = adId ? document.getElementById(adId) : null;
    return {
      last: last.textContent.trim(),
      highlighted: hi ? hi.textContent.trim() : null,
      focusedLast: ad === last || document.activeElement === last,
    };
  `, { timeout: 5000 });
  check("AC-34: End in the submenu reaches the last item and focuses it",
    !!endState && endState.highlighted === endState.last && endState.focusedLast, JSON.stringify(endState));
  await keys("Home");
  const walked = new Set();
  for (let step = 0; step < subBox.items + 2; step += 1) {
    const label = await execute(`
      const hi = document.querySelector('.menu.browse-sub .menu-item[data-highlighted]');
      return hi ? hi.textContent.trim() : null;
    `);
    if (label) walked.add(label);
    if (walked.size >= subBox.items) break;
    await keys("ArrowDown");
  }
  check("AC-34: ArrowDown from the first item reaches every category in the submenu",
    walked.size >= subBox.items, JSON.stringify({ walked: walked.size, total: subBox.items }));
  await keys("Escape");
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
  await parkPointer();

  // No menu panel extends past a window edge: the View menu and a row context
  // menu opened beside the window bottom.
  await openMenu('.view-trigger', '.menu.view-menu');
  const viewBox = await panelBox('.menu.view-menu');
  check("AC-34: the View menu panel stays wholly inside the viewport", contained(viewBox), JSON.stringify(viewBox));
  await keys("Escape");
  await menuClosed('.menu.view-menu');

  const bottomRow = await waitForEval(`
    let best = null;
    let bestBottom = -1;
    for (const row of document.querySelectorAll('[data-row-id]')) {
      const r = row.getBoundingClientRect();
      if (r.bottom <= window.innerHeight && r.bottom > bestBottom) { bestBottom = r.bottom; best = row.getAttribute('data-row-id'); }
    }
    return best ? '[data-row-id="' + best + '"]' : null;
  `, { timeout: 10000 });
  if (!bottomRow) throw new Error("no row near the window bottom for the context-menu check");
  await rightClick(bottomRow);
  const ctxUp = await waitForEval(`return document.querySelector('.menu .menu-item') ? true : null;`, { timeout: 5000 });
  if (!ctxUp) throw new Error("the context menu did not open on the bottom row");
  const ctxBox = await panelBox('.menu');
  check("AC-34: a row context menu opened beside the window bottom stays wholly inside the viewport",
    contained(ctxBox), JSON.stringify(ctxBox));
  await keys("Escape");
  await parkPointer();
}

// AC-49 (source half): the gap pass (UI-27) adds no token. The names below
// are each mandated by a design section of this release — --content-gutter by
// UI-19, --menu-edge by UI-25, --warning-hover/--danger-hover by D11's
// corrected ramp (DR-120) — and nothing else may be new relative to the
// released baseline (HEAD carries the v0.0.3 code).
function checkTokenSource() {
  const current = readFileSync(join(root, "ui", "src", "lib", "design-tokens.css"), "utf8");
  const released = spawnSync("git", ["show", "HEAD:ui/src/lib/design-tokens.css"], { cwd: root, encoding: "utf8" }).stdout;
  if (!released) {
    skip("AC-49 (source): token comparison against HEAD", "git show returned nothing");
    return;
  }
  const names = (text) => new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const added = [...names(current)].filter((n) => !names(released).has(n));
  const allowed = new Set(["--content-gutter", "--menu-edge", "--warning-hover", "--danger-hover"]);
  check("AC-49 (source): no token added beyond the names this release's designs mandate",
    added.every((n) => allowed.has(n)), `added: ${JSON.stringify(added)}`);
}

// AC-57 (real-app half) is measured inside flowImport10k: the import loop's
// own status-bar samples are the throughput window, recorded in the run log.

// ---------------------------------------------------------------- run shape

// Feature-area → flow mapping (SPEC-v0.0.5 §3.2, carried verbatim). Area names
// are the guide pages in docs/release/features/; scale-tier flows are the ones
// the §3.1 mapping marks — a set that names one pays the 10 000-document
// import instead of the core one. This table and the sequences below are
// maintained together whenever a flow is added, renamed, or an AC moves.
const AREAS = {
  "getting-started": ["flowStartup", "flowDropAndSkip", "flowEmptyAndSkeleton"],
  "importing-pdfs": ["flowImport10k", "flowImportAssign", "flowMetaColumn"],
  searching: ["flowSearchDebounce", "flowSearchField"],
  "browsing-and-filtering": ["flowCategories", "flowCategoriesMulti", "flowBrowseIcons", "flowMenuBounds", "flowQuietCounts"],
  categories: ["flowCategories", "flowCategoriesMulti", "flowCategoryCrud", "flowMenuBounds", "flowQuietCounts"],
  favorites: ["flowFavorites"],
  "opening-and-deleting": ["flowOpen", "flowDelete", "flowContextMenu"],
  "metadata-editing": ["flowMetadata", "flowMetadataDisplay", "flowMetaColumn"],
  "missing-files-relinking": ["flowMissingAndRelink"],
  covers: ["flowCovers"],
  "sorting-and-views": ["flowSortSecondary", "flowViewColumns", "flowContentGutter", "flowRowDesign", "flowVirtualization", "flowWidthMatrix"],
  "status-feedback": ["flowStatusBar", "flowProgressTransform"],
  "selecting-documents": ["flowSelectMode"],
  "settings-and-appearance": ["flowThemeAndSettings", "flowAbout", "flowScrollbars"],
  "the-app-window": ["flowDragRegion", "flowWindowChrome", "flowToolbarControls", "flowActionParity"],
  "keyboard-shortcuts": ["flowKeyboardAudit"],
};

// The scale tier (§3.1): these flows are the reason fixtures/docs exists.
// flowEmptyAndSkeleton belongs here because its bulk-extension claim needs
// loaded rows < total — the app pages 500 rows per query (commands.rs), so
// the "Select all N matching" control only ever exists above a 500-document
// library (DR-136).
const SCALE_FLOWS = new Set(["flowImport10k", "flowVirtualization", "flowWidthMatrix", "flowEmptyAndSkeleton"]);

// The mandatory prefix (AC-60: targeted runs start "after the mandatory
// prefix"): the app shell check, the drop pipeline check (whose result the
// scale import reuses), then the tier the selected flows need.
const PREFIX_FLOWS = [
  ["flowStartup", flowStartup],
  ["flowDropAndSkip", flowDropAndSkip],
];

// Functional section (core tier), canonical order. Each flow is
// self-sufficient (D14); the order is still meaningful for the state flows
// deliberately leave behind:
const FUNCTIONAL_SEQUENCE = [
  // Search first: the prefix import updates the DB and status events, not the
  // store's query state — the first UI query is what renders rows, and this
  // flow's claims are the debounce behavior on the core tier.
  ["flowSearchDebounce", flowSearchDebounce],
  ["flowCategories", flowCategories],
  ["flowContextMenu", flowContextMenu],
  ["flowDelete", flowDelete],
  ["flowFavorites", flowFavorites],
  ["flowMetadata", flowMetadata],
  // The status bar's quiet state is only observable while the library is
  // clean; the missing-file branch is verified inside the flow that makes a
  // file missing. Both job checks run on the bounded cover job (§3.1.1).
  ["flowStatusBar", flowStatusBar],
  ["flowProgressTransform", flowProgressTransform],
  ["flowMissingAndRelink", flowMissingAndRelink],
  ["flowMetaColumn", flowMetaColumn],
  ["flowOpen", flowOpen],
  ["flowCovers", flowCovers],
  ["flowMetadataDisplay", flowMetadataDisplay],
  ["flowSortSecondary", flowSortSecondary],
  // The full 2..10 manual walk lives here, at 1280 px (AC-59).
  ["flowViewColumns", flowViewColumns],
  ["flowContentGutter", flowContentGutter],
  ["flowCategoriesMulti", flowCategoriesMulti],
  ["flowImportAssign", flowImportAssign],
  ["flowCategoryCrud", flowCategoryCrud],
  ["flowQuietCounts", flowQuietCounts],
  ["flowBrowseIcons", flowBrowseIcons],
  ["flowScrollbars", flowScrollbars],
  ["flowDragRegion", flowDragRegion],
  ["flowToolbarControls", flowToolbarControls],
  ["flowSearchField", flowSearchField],
  ["flowRowDesign", flowRowDesign],
  ["flowActionParity", flowActionParity],
  ["flowThemeAndSettings", flowThemeAndSettings],
  ["flowSelectMode", flowSelectMode],
  ["flowAbout", flowAbout],
  ["flowWindowChrome", flowWindowChrome],
  ["flowKeyboardAudit", flowKeyboardAudit],
  // The 30-category submenu state this flow builds is left in the library;
  // it must run after every flow that reads category state.
  ["flowMenuBounds", flowMenuBounds],
];

// Scale section (docs tier), always last; the suite exits without waiting for
// the scale cover queue (§3.1).
const SCALE_SEQUENCE = [
  ["flowImport10k", flowImport10k],
  ["flowVirtualization", flowVirtualization],
  ["flowWidthMatrix", flowWidthMatrix],
  // Last flow of the run: it empties the library through the app's own bulk
  // path — the same shape the shipped suite had. Its Ctrl+A → "Select all N
  // matching" claim is only observable over the scale corpus (DR-136).
  ["flowEmptyAndSkeleton", flowEmptyAndSkeleton],
];

const SEQUENCE_NAMES = new Set([...PREFIX_FLOWS, ...FUNCTIONAL_SEQUENCE, ...SCALE_SEQUENCE].map(([n]) => n));
for (const [area, flows] of Object.entries(AREAS)) {
  for (const name of flows) {
    if (!SEQUENCE_NAMES.has(name)) throw new Error(`AREAS["${area}"] names an unknown flow: ${name}`);
  }
}

// SMOKE_SET=<area>[,<area>…] selects exactly the §3.2 mapping's flows;
// SMOKE_FLOW narrows that (or selects flows directly). Unknown names error.
function resolveWanted() {
  let wanted = null;
  const setName = process.env.SMOKE_SET;
  if (setName) {
    const areas = setName.split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = areas.filter((a) => !AREAS[a]);
    if (unknown.length) throw new Error(`unknown SMOKE_SET name: ${unknown.join(", ")} (known: ${Object.keys(AREAS).join(", ")})`);
    wanted = [...new Set(areas.flatMap((a) => AREAS[a]))];
  }
  const flowNames = process.env.SMOKE_FLOW;
  if (flowNames) {
    const flows = flowNames.split(",").map((n) => n.trim()).filter(Boolean);
    const unknown = flows.filter((n) => !SEQUENCE_NAMES.has(n));
    if (unknown.length) throw new Error(`unknown SMOKE_FLOW name: ${unknown.join(", ")}`);
    wanted = wanted ? wanted.filter((n) => flows.includes(n)) : [...new Set(flows)];
  }
  return wanted; // null = the full suite
}

// ---------------------------------------------------------------- main

async function main() {
  prepareEnvironment();
  checkTokenSource(); // AC-49 source half: no app needed, a file fact.
  const wanted = resolveWanted();
  const driver = startDriver();
  // NFR-06 measures the suite's wall time against the app; the build and
  // fixture generation are D15's concern, not the suite's.
  const suiteStart = Date.now();
  try {
    await timedPhase("open-session", openSession);
    console.log(`session ${sessionId} — app launched by tauri-driver`);

    const ran = new Set();
    for (const [name, fn] of PREFIX_FLOWS) {
      dropWorks = (await runFlow(name, fn)) === true || dropWorks;
      ran.add(name);
    }

    // The tier the selection needs (§3.2 prefix rule): a set that names a
    // scale flow pays the 10 000-document import — except when it names
    // flowImport10k itself, which IS the import and runs here, first.
    if (wanted?.includes("flowImport10k")) {
      await runFlow("flowImport10k", flowImport10k);
      ran.add("flowImport10k");
    } else if (wanted && [...wanted].some((n) => SCALE_FLOWS.has(n))) {
      await timedPhase("import-docs-tier", () => importTier("docs"));
    } else if (!wanted || [...wanted].some((n) => !SCALE_FLOWS.has(n))) {
      await timedPhase("import-core-tier", () => importTier("core"));
    }

    for (const [name, fn] of [...FUNCTIONAL_SEQUENCE, ...SCALE_SEQUENCE]) {
      if (ran.has(name)) continue;
      if (wanted && !wanted.includes(name)) continue;
      await runFlow(name, fn);
    }
  } catch (error) {
    // What the app was doing explains an abort better than the driver error.
    let trace = "";
    try {
      trace = await execute(`
        const internals = window.__TAURI_INTERNALS__;
        return (internals?.__smokeSeen ?? []).slice(-12).join(' → ');
      `);
    } catch { /* the page or the session is gone */ }
    fail("smoke run aborted", error.message + (trace ? ` — after: ${trace}` : ""));
  } finally {
    try {
      if (sessionId) await wd("DELETE", `/session/${sessionId}`);
    } catch {
      /* driver may already be gone */
    }
    driver.kill();
    spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
  }

  // ---- summary (D14/AC-54): the file-fact checks, the timing table, the
  // budget, and the run result.
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const longSleeps = [...source.matchAll(/\bsleep\((\d+)\)/g)]
    .map((m) => Number(m[1]))
    .filter((ms) => ms > 250);
  check("AC-56: no fixed sleep longer than 250 ms in the harness (source scan)",
    longSleeps.length === 0, `sleeps: ${JSON.stringify(longSleeps)}`);
  const covered = new Set(Object.values(AREAS).flat());
  const orphans = [...SEQUENCE_NAMES].filter((n) => !covered.has(n));
  check("AC-60: every flow appears in at least one feature area",
    orphans.length === 0, `flows in no area: ${JSON.stringify(orphans)}`);

  const runMs = Date.now() - suiteStart;
  console.log("\n[TIME] summary");
  for (const t of timings) console.log(`[TIME]   ${t.name.padEnd(24)} ${String(t.ms).padStart(7)} ms`);
  console.log(`[TIME]   ${"SUITE TOTAL".padEnd(24)} ${String(runMs).padStart(7)} ms`);
  check(`NFR-06 / AC-58: suite wall time within the ${NFR06_BUDGET_MS / 1000} s budget`,
    runMs <= NFR06_BUDGET_MS,
    runMs > NFR06_BUDGET_MS ? `budget exceeded: ${runMs} > ${NFR06_BUDGET_MS}` : `total ${runMs} ms`);

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped === true);
  const judged = results.length - skipped.length;
  console.log(`\n${judged - failed.length}/${judged} checks passed, ${skipped.length} skipped (harness-limited)`);
  for (const f of failed) console.log(`FAILED: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  for (const s of skipped) console.log(`SKIPPED: ${s.name} — ${s.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
