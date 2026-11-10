#!/usr/bin/env node
// UI smoke script (SPEC-v0.0.1.md §5.3.12): drives the REAL built app
// (src-tauri/target/debug/pdfkeeper.exe) through tauri-driver (W3C WebDriver,
// proxied to msedgedriver on Windows). Assertions are made against the live
// DOM and the real command boundary; keyboard flows use real key events.
// Since v0.0.6 (DR-147) the reader flows run on a second runtime: the same
// exe launched directly and driven over CDP, because reader windows are not
// part of a tauri-driver session. Both runtimes share one app build, one
// data directory, and this script's check/report/timing machinery.
//
// Prerequisites (toolchain, not product dependencies): tauri-driver and a
// version-matched msedgedriver on PATH (see spec §5.3.12 + DR-54).
// Usage: node scripts/ui-smoke.mjs
//   node scripts/ui-verify.mjs — full verification (DR-162, DR-163): full
//     mode runs every UI test case as its own lane (this file hosts the
//     functional and reader lanes, scripts/ui-10k.mjs the docs lanes), coarse
//     mode the two-suite split; every lane gets its own data directory
//     (PDFKEEPER_DATA_DIR), ports, and scoped cleanup.
//   Lane-mode environment (set by scripts/ui-verify.mjs):
//     PDFKEEPER_DATA_DIR=<absolute path>  the lane's own data directory
//     SMOKE_SCOPED=1                      cleanup touches only this process's
//                                         own tree; global image kills only in
//                                         single-suite mode
//     SMOKE_DRIVER_PORT / SMOKE_NATIVE_PORT  this lane's tauri-driver ports
//     SMOKE_CDP_PORT                      this lane's CDP debug port (reader
//                                         lanes; per-port WebView2 profile dir)
//     SMOKE_PREFIX_QUIET=1                the mandatory prefix runs as setup:
//                                         passing checks log, failures record
//   SMOKE_SET=<area>[,<area>…]  run exactly the flows of the named feature
//   areas (the SPEC-v0.0.6 §3.2 mapping, carried verbatim in AREAS below):
//   getting-started, importing-pdfs, searching, browsing-and-filtering,
//   tags, favorites, reading-collection, opening-and-deleting, reading-pdfs,
//   metadata-editing, missing-files-relinking, covers, sorting-and-views,
//   status-feedback, selecting-documents, settings-and-appearance,
//   the-app-window, keyboard-shortcuts. Unknown area names error.
//   SMOKE_FLOW=flowTags,flowDelete  run only these flows (narrows
//   SMOKE_SET when both are given; debugging aid). Unknown flow names error.
// Tier rule (DR-161): every UI test case against the 10 000-document corpus
// runs in its own suite — node scripts/ui-10k.mjs — so this suite never
// pays the docs tier: the full run and every named set run on the core
// tier. The reader flows import the multi tier through the app itself on
// their own instance; a reader-only selection pays no WebDriver session at
// all.
// Exit code: 0 all checks pass, 1 any check fails (including the NFR-06
// wall-time budget, AC-58).

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_EXE = join(root, "src-tauri", "target", "debug", "pdfkeeper.exe");
// Same variable the app-side resolver reads (DR-162): scripts/ui-verify.mjs
// points each suite at its own isolated library under the app data dir;
// standalone runs keep the app's own directory.
const DATA_DIR = process.env.PDFKEEPER_DATA_DIR || join(process.env.APPDATA, "com.pdfkeeper.app");
// Under the orchestrator the two suites run at once: cleanup closes only
// this suite's own windows, never image-name kills that would hit the
// other suite's app.
const SCOPED = process.env.SMOKE_SCOPED === "1";
export { SCOPED };
export const FIXTURE_DOCS = join(root, "fixtures", "docs");
const FIXTURE_CORE = join(root, "fixtures", "core"); // core tier (DR-135)
const FIXTURE_SPECIAL = join(root, "fixtures", "special");
const CORE_DOC_COUNT = 100; // core tier size, mirroring make-fixtures.mjs
export const NFR06_BUDGET_MS = 300_000; // NFR-06 wall-time budget (AC-54/AC-58)
const CARGO_BIN = join(homedir(), ".cargo", "bin");
const DRIVER_PORT = Number(process.env.SMOKE_DRIVER_PORT ?? 4444);
const NATIVE_PORT = process.env.SMOKE_NATIVE_PORT ? Number(process.env.SMOKE_NATIVE_PORT) : 0;
const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- checks

export const results = [];
// Lane mode (DR-163): when the mandatory prefix runs as setup for a
// single-flow lane (SMOKE_PREFIX_QUIET), its passing checks log as SETUP and
// are not recorded — the two prefix test cases are verified by the prefix
// lane. A failed setup check is always recorded: a lane whose setup broke
// never passes silently.
const PREFIX_QUIET = process.env.SMOKE_PREFIX_QUIET === "1";
let quietChecks = false;
export function check(name, ok, detail = "") {
  if (quietChecks && ok) {
    console.log(`SETUP ok  ${name}${detail ? ` — ${detail}` : ""}`);
    return;
  }
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

// Color comparison for the AC-97 grounds. WebView2 serializes a custom
// property's color value in normalized hex8 form (a declared
// `rgba(100, 74, 201, 0.12)` reads back as `#644ac91f`), while a painted
// `background-color` reads back as `rgba(...)`. The check therefore parses
// both sides instead of comparing strings: exact rgb channels, alpha within
// one 8-bit step (the hex8 quantization).
function parseCssColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hex = text.match(/^#([0-9a-f]{6})(([0-9a-f]{2})?)$/i);
  if (hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex[1].slice(i - 1, i + 1), 16));
    const a = hex[3] ? parseInt(hex[3], 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgb = text.match(
    /^rgba?\(\s*(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i,
  );
  if (rgb) {
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(rgb[i], 10));
    let a = 1;
    if (rgb[4]) a = rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return { r, g, b, a };
  }
  return null;
}
function sameCssColor(a, b) {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  if (!ca || !cb) return false;
  return ca.r === cb.r && ca.g === cb.g && ca.b === cb.b && Math.abs(ca.a - cb.a) <= 1 / 255;
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

export function prepareEnvironment() {
  // Standalone runs sweep stray apps; under the orchestrator the other
  // suite may already have its app up — a global kill is its job (DR-162).
  if (!SCOPED) {
    spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
  }
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

export function startDriver() {
  const env = { ...process.env, PATH: `${CARGO_BIN};${process.env.PATH}` };
  const args = ["--port", String(DRIVER_PORT)];
  // Two tauri-drivers coexist under the orchestrator: each gets its own
  // driver port and its own underlying WebDriver port (DR-162).
  if (NATIVE_PORT) args.push("--native-port", String(NATIVE_PORT));
  const driver = spawn(
    process.platform === "win32" ? join(CARGO_BIN, "tauri-driver.exe") : "tauri-driver",
    args,
    { stdio: ["ignore", "pipe", "pipe"], env },
  );
  // The app under test always lives inside this driver's process subtree
  // (tauri-driver → msedgedriver → pdfkeeper.exe, verified 2026-11-07), so
  // the subtree walk below identifies exactly this suite's app (DR-162).
  suiteDriverPid = driver.pid;
  driver.stderr.on("data", (d) => process.stderr.write(`[driver] ${d}`));
  return driver;
}

// ---------------------------------------------------------------- process identity

let suiteDriverPid = null;

// One WMI snapshot: pid → children with names.
function processChildren() {
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      'Get-CimInstance Win32_Process | ForEach-Object { "{0}`t{1}`t{2}" -f $_.ProcessId, $_.ParentProcessId, $_.Name }',
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const children = new Map();
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const [pid, ppid, name] = line.split("\t");
    const p = Number(pid);
    const pp = Number(ppid);
    if (!Number.isFinite(p) || !Number.isFinite(pp)) continue;
    let list = children.get(pp);
    if (!list) {
      list = [];
      children.set(pp, list);
    }
    list.push({ pid: p, name: (name || "").toLowerCase() });
  }
  return children;
}

// This suite's app processes: pdfkeeper.exe descendants of its own driver.
// The other suite's app hangs under the other driver and never appears.
function ownAppProcesses() {
  if (!suiteDriverPid) return [];
  const children = processChildren();
  const out = [];
  const stack = [suiteDriverPid];
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (child.name === "pdfkeeper.exe") out.push(child.pid);
      stack.push(child.pid);
    }
  }
  return out;
}

// ---------------------------------------------------------------- WebDriver

export let sessionId = null;

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

export async function wd(method, path, body) {
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

export async function execute(script, args = []) {
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
  Shift: "\uE008",
  Escape: "\uE00C",
  Enter: "\uE007",
  Space: "\uE00D",
  Delete: "\uE017",
  Tab: "\uE004",
  ArrowDown: "\uE015",
  ArrowUp: "\uE013",
  ArrowRight: "\uE014",
  ArrowLeft: "\uE012",
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
        // Geometry at the instant of occlusion (DR-169): where the target is
        // now, whether its reveal is still up, what covers the click point,
        // and the first mounted rows with their positions — one line that
        // makes any future occlusion readable.
        probe: (() => {
          const el = (${findSource})();
          if (!el) return { el: "gone" };
          const b = el.getBoundingClientRect();
          const actions = el.closest('.row-actions');
          const row = el.closest('[data-row-id]');
          const at = document.elementFromPoint(arguments[0], arguments[1]);
          const rectOf = (q) => { const r = q.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
          return {
            elRect: rectOf(el),
            actionsDisplay: actions ? getComputedStyle(actions).display : null,
            rowFocused: row ? row.contains(document.activeElement) : null,
            rowFocusWithin: row ? row.matches(':focus-within') : null,
            docHasFocus: document.hasFocus(),
            atTag: at ? String(at.tagName + "." + at.className) : null,
            atRect: at ? rectOf(at) : null,
            rows: Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 4).map((r) => ({
              id: r.dataset.rowId,
              rect: rectOf(r),
              actions: getComputedStyle(r.querySelector('.row-actions') ?? r).display,
            })),
            scrollerScrollTop: (() => { const s = document.querySelector('.document-area .scroller') ?? document.querySelector('.scroller'); return s ? s.scrollTop : null; })(),
          };
        })(),
      };
    `, [x, y]);
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
// field's import control (SearchBox.svelte) and *Rescan documents*
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

// Browse menu paths (UI-09): the saved-search items, and *Rescan documents* — the
// action item whose disabled state while a job runs is the FR-15 busy gate
// (UI-09 moved the control here from the status bar, DR-96b).
async function rescanItemEnabled() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const enabled = await execute(`
    const items = Array.from(document.querySelectorAll('.menu.browse-menu .menu-item'));
    const item = items.find((e) => e.textContent.trim().startsWith('Rescan documents'));
    if (!item) return null;
    return !(item.hasAttribute('data-disabled') || item.getAttribute('aria-disabled') === 'true');
  `);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  return enabled;
}

async function runRescan() {
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  await clickMenuItem(".menu.browse-menu", "Rescan documents");
  await waitForEval(`return document.querySelector('.menu.browse-menu') ? null : true;`, { timeout: 5000 });
}

// Opens the Browse menu and chooses a saved-search item by its label.
async function browseSelect(label) {
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', label);
  await menuClosed('.menu.browse-menu');
}

// A tag filter through the Browse submenu; multi-select keeps the menu
// open, so the caller closes it explicitly (DR-82).
async function browseSelectTag(name) {
  // A tag click is the user's full path: open Browse, open Tags,
  // click the item. If the menu vanishes mid-path (the app re-rendered under
  // an event the harness did not cause), a user simply opens it again — the
  // same path, retried, bounded, and said out loud when it happens.
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await openMenuSure('.browse-trigger', '.menu.browse-menu');
      await clickMenuItem('.menu.browse-menu', "Tags");
      const sub = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
      if (!sub) throw new Error("the Tags submenu did not open");
      await clickMenuItem('.menu.browse-sub', name);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.warn(`[retry ${attempt}] Browse → Tags → ${name}: ${String(lastError).slice(0, 300)}`);
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
// how it is cleared. The tag set lives in the Tags submenu, so it is
// opened, read, and closed again.
// The tag list as the Browse menu offers it: Browse → Tags → the
// items, optionally only the ones the app marks active. The recorded
// `tags_list` answer is deliberately not used — it can be the list from
// before a create, while the menu is what the app is showing now. The Browse
// menu carries the tag scope only when tags exist
// (BrowseMenu.svelte's own gate), so no scope means no tags.
async function tagMenuNames(activeOnly) {
  await openMenuSure('.browse-trigger', '.menu.browse-menu');
  const scope = await execute(`
    return Array.from(document.querySelectorAll('.menu.browse-menu .menu-item'))
      .some((e) => ((e.querySelector('.item-label')?.textContent ?? e.textContent).trim().toLowerCase() === 'tags')) ? true : null;
  `);
  if (!scope) {
    await keys("Escape");
    await menuClosed('.menu.browse-menu');
    return [];
  }
  await clickMenuItem('.menu.browse-menu', "Tags");
  const up = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, {
    timeout: 5000,
  });
  if (!up) throw new Error("the Tags submenu did not open");
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

const activeTagNames = () => tagMenuNames(true);
const allTagNames = () => tagMenuNames(false);

// ---------------------------------------------------------------- boundary capture
// The ordering and tag checks below compare what the app asked the backend
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

// The boundary observer script (DR-44's fallback transport). It installs into
// any window of either runtime — the WebDriver `execute` here and the CDP
// `Runtime.evaluate` of the reader runtime (DR-147) — and records commands,
// their arguments, and the answers the app itself received.
const BOUNDARY_SCRIPT = `
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || !window.chrome || !window.chrome.webview) return null;
    if (internals.__smokeBoundary) return true;
    internals.__smokeBoundary = true;
    internals.__smokeSearch = { args: null, rows: null, total: 0 };
    internals.__smokeAbout = null;
    internals.__smokeWindow = {};
    internals.__smokeDialog = null;
    internals.__openCalls = 0;
    internals.__readerOpenCalls = 0;
    internals.__openDataDirCalls = 0;
    internals.__openFolderCalls = 0;
    internals.__pageServeCalls = 0;
    internals.__pageRequested = new Set();
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
            tags: r.tags,
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
        if (message.cmd === 'app_open_reader_window') internals.__readerOpenCalls++;
        if (message.cmd === 'app_open_data_dir') internals.__openDataDirCalls++;
        if (message.cmd === 'app_open_containing_folder') {
          // UI-40 (AC-111): the reveal request the app posts; the file
          // manager's window itself belongs to the OS.
          internals.__openFolderCalls = (internals.__openFolderCalls ?? 0) + 1;
          internals.__openFolderLast = message.payload;
        }
        if (message.cmd === 'app_pdf_page') {
          internals.__pageServeCalls++;
          // AC-73's requested-side: the page+width as the app asked for it.
          // The key matches the cache file name the answer will produce.
          if (message.payload && typeof message.payload.page === 'number') {
            internals.__pageRequested.add(message.payload.page + '-' + message.payload.targetWidth);
          }
        }
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
  `;

async function instrumentBoundary() {
  const installed = await execute(BOUNDARY_SCRIPT);
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
  await execute(`window.__TAURI_INTERNALS__.__openCalls = 0; window.__TAURI_INTERNALS__.__readerOpenCalls = 0; window.__TAURI_INTERNALS__.__openDataDirCalls = 0; window.__TAURI_INTERNALS__.__openFolderCalls = 0; return true;`);
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

// The tag set a capture was asked for, as a comparable key.
const idKey = (ids) => [...ids].map(Number).sort((a, b) => a - b).join(",");

/**
 * A page-side expression matching a capture asked for exactly these tag
 * ids. Predicates handed to `capturedSearch` run inside the app's page, where
 * harness helpers are not in scope — so this returns source, not a function.
 */
function askedFor(ids) {
  return `[...s.args.tagIds].map(Number).sort((a, b) => a - b).join(",") === ${JSON.stringify(idKey(ids))}`;
}

// ---------------------------------------------------------------- filter helpers

async function resultCount() {
  return execute(`
    const c = document.querySelector('.result-count');
    return c ? Number(c.textContent.replace(/[^0-9]/g, '')) : null;
  `);
}

// The status bar's always-present content (UI-15): the quiet document count.
export async function docCount() {
  const text = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] ?? null;`);
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

// Assigns the current selection to exactly one tag through the picker
// (UI-04): the picker pre-arms every tag the selection lacks and every
// tag it already has, so the step un-arms everything but the target before
// Apply is the user's confirmation.
async function applyTagToSelection(name) {
  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Tags"]]', "xpath");
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

  // The picker pre-ticks every tag the selection lacks *and* every tag
  // it already has (UI-04), so Apply would write all of them. A step that
  // intends exactly one tag un-ticks the rest, exactly as a user who wants
  // one tag does — and the resulting state is read back before Apply.
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
  if (!closed) throw new Error("the tag picker stayed open after Apply");
}

async function openTagsManager() {
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', "Manage tags");
  const up = await waitForEval(
    `return document.querySelector('.modal input[aria-label="Add tag"]') ? true : null;`,
    { timeout: 5000 },
  );
  if (!up) throw new Error("the tags manager did not open");
}

async function createTag(name) {
  await typeInto('.modal input[aria-label="Add tag"]', name);
  await keys("Enter");
  const made = await waitForEval(
    `return Array.from(document.querySelectorAll('.modal .tag-name')).some((e) => e.textContent.trim() === arguments[0]) ? true : null;`,
    { timeout: 8000, args: [name] },
  );
  if (!made) throw new Error(`tag was not created: ${name}`);
}

// Makes sure enough tag rows exist for a scroll container to overflow
// (the scrollbar checks need containers that actually scroll).
async function ensureTags(count) {
  let existing = await allTagNames();
  if (existing.length < count) {
    await openTagsManager();
    for (let i = existing.length + 1; i <= count; i++) await createTag(`Scrollbar Probe ${String(i).padStart(2, "0")}`);
    await closeDialog("the tags manager");
    existing = await allTagNames();
  }
  if (existing.length < count) {
    throw new Error(`the app offers ${existing.length} tag items after creating up to ${count}: ${JSON.stringify(existing)}`);
  }
  return existing;
}

async function browseToggleTag(name) {
  await browseSelectTag(name);
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
}

// Makes exactly `names` the active tag set (FR-02 as modified): each
// change is the user's own path, Browse → Tags → the tag item.
async function setActiveTags(names) {
  const want = new Set(names);
  const current = new Set(await activeTagNames());
  for (const name of current) if (!want.has(name)) await browseToggleTag(name);
  for (const name of names) if (!current.has(name)) await browseToggleTag(name);
}

// Clears every active tag (UI-09: the Browse menu is the only place a
// filter is cleared now that no chip renders anywhere).
async function clearTagFilter() {
  for (;;) {
    const active = await activeTagNames();
    const name = active[0];
    if (!name) return;
    await browseToggleTag(name);
    const stillActive = await activeTagNames();
    if (stillActive.includes(name)) throw new Error(`tag not cleared: ${name}`);
  }
}

// The sort items live inside the View menu (UI-08 as modified): *Sort by*
// carries the primary key and the direction, *Then by* the secondary key. The
// standalone Sort control is gone, so opening a sort item means opening View and
// clicking its submenu trigger.
const SORT_MENU = ".menu.view-sort";
const THENBY_MENU = ".menu.view-thenby";

async function openViewSubmenu(triggerLabel, menuSelector) {
  // Harness robustness, not product behavior (same tag as
  // withStaleRetry): once in a full-suite run the View menu closed itself
  // between the stable-click poll on its trigger and the submenu claim,
  // while the same flow passes standalone. Re-run the open sequence exactly
  // once before declaring it failed.
  try {
    await openViewSubmenuOnce(triggerLabel, menuSelector);
  } catch {
    await openViewSubmenuOnce(triggerLabel, menuSelector);
  }
}

async function openViewSubmenuOnce(triggerLabel, menuSelector) {
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

const SECONDARY_LABELS = { none: "None", title: "Title", date_added: "Date added", size: "Size" };

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
// Scoped mode (DR-162): the other suite's app shares the image name, so the
// poll looks only at this suite's own app (subtree of its driver) and a
// timeout force-kill touches only that tree.
async function waitProcessExit(image = "pdfkeeper.exe", timeoutMs = 15000) {
  if (SCOPED) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const mine = ownAppProcesses();
      if (mine.length === 0) return;
      if (Date.now() > deadline) {
        for (const pid of mine) {
          spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
        }
        return;
      }
      await sleep(200);
    }
  }
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

export async function openSession() {
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

// ---------------------------------------------------------------- CDP runtime (reader flows, DR-147)
// Under tauri-driver a second WebviewWindow is unreachable (measured: window
// commands 404, no debug port — DR-147). Reader flows therefore drive the
// real binary directly with the WebView2 debug port enabled and reach every
// window as a CDP target. The helpers mirror the WebDriver section:
// `evaluate` is `execute`, `waitFor` is `waitForEval`, `key`/`clickAt`/
// `insertText` are real key and pointer events, and the boundary observer
// installs unchanged.
// Lane mode (DR-163): concurrent reader lanes each own a debug port and a
// WebView2 profile directory; the default stays port 9223 / tmp/smoke-webview.
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT ?? 9223);
const CDP_PROFILE = join(root, "tmp", CDP_PORT === 9223 ? "smoke-webview" : `smoke-webview-${CDP_PORT}`); // isolated WebView2 profile: a hard-killed run must not lock the app one

class CdpSession {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    this.closed = false;
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error(`CDP websocket failed for ${wsUrl}`));
    });
    this.ws.onclose = () => {
      this.closed = true;
      for (const settle of this.pending.values()) settle({ error: "CDP connection closed" });
      this.pending.clear();
    };
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    };
  }

  send(method, params = {}) {
    if (this.closed) throw new Error(`CDP send ${method} on a closed session`);
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  // Mirrors `execute`, and the harness scripts' `return …` shape: the body is
  // wrapped in an async IIFE so awaits work, resolved by value. A CDP reply
  // nests the payload twice: `{id, result: {result: RemoteObject,
  // exceptionDetails?}}` — protocol errors are the top-level `error`.
  async evaluate(script) {
    const message = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${script} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const body = message.result ?? {};
    if (body.exceptionDetails) {
      throw new Error(`CDP evaluate failed: ${body.exceptionDetails.exception?.description ?? body.exceptionDetails.text}`);
    }
    if (message.error) throw new Error(`CDP ${JSON.stringify(message.error).slice(0, 200)}`);
    return body.result?.value;
  }

  // Mirrors `waitForEval`: a plain false/null keeps polling — the value is a
  // condition, not a pause (D16).
  async waitFor(script, { timeout = 15000, interval = 100 } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      let value = null;
      try {
        value = await this.evaluate(script);
      } catch {
        value = null; // a session mid-teardown is "not there yet", same as a driver error
      }
      if (value) return value;
      if (Date.now() > deadline) return null;
      await sleep(interval);
    }
  }

  // `modifiers` is the CDP modifier bitmask (Alt 1, Ctrl 2, Meta 4,
  // CapsLock 1 << 6) — a plain number, not an object.
  async key(key, code, windowsVirtualKeyCode, modifiers) {
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type, key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
        ...(modifiers ? { modifiers } : {}),
      });
    }
  }

  async insertText(text) {
    await this.send("Input.insertText", { text });
  }

  async pointer(type, x, y, { button = "left", clickCount = 1 } = {}) {
    await this.send("Input.dispatchMouseEvent", { type, x, y, button, clickCount, buttons: button === "right" ? 2 : 1 });
  }

  async clickAt(x, y, { button = "left", clickCount = 1 } = {}) {
    await this.pointer("mousePressed", x, y, { button, clickCount });
    await this.pointer("mouseReleased", x, y, { button, clickCount });
  }

  // A real double click: press/release at clickCount 1, then press/release at
  // clickCount 2 — the sequence Chromium produces for a mouse (the CDP port
  // has no Actions API).
  async doubleClickAt(x, y) {
    await this.clickAt(x, y, { clickCount: 1 });
    await this.clickAt(x, y, { clickCount: 2 });
  }

  async rightClickAt(x, y) {
    await this.clickAt(x, y, { button: "right" });
  }

  async hoverAt(x, y) {
    await this.pointer("mouseMoved", x, y);
  }

  async setMetrics(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 0, mobile: false });
  }

  async clearMetrics() {
    await this.send("Emulation.clearDeviceMetricsOverride");
  }
}

let cdpApp = null;
let cdpMain = null;

// Every CDP helper below takes the debug port as an optional argument: the
// reader runtime uses the lane's fixed port (its own instance, DR-147),
// and the functional runtime uses the port the WebDriver driver opened on
// the app it launched (`functionalCdpPort`, AC-99).
async function cdpTargets(port = CDP_PORT) {
  return fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
}

async function cdpWaitForTarget(pred, { timeout = 30000, port = CDP_PORT } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const hit = (await cdpTargets(port)).find(pred);
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await sleep(250);
  }
}

// The document id a reader-window target carries (the `?reader=<id>` route
// parameter of §3.3), or null for any other window.
function cdpReaderId(target) {
  if (target.type !== "page") return null;
  try {
    const raw = new URL(target.url).searchParams.get("reader");
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch {
    return null;
  }
}

async function cdpReaderTargetIds(port = CDP_PORT) {
  const ids = [];
  for (const target of await cdpTargets(port)) {
    const id = cdpReaderId(target);
    if (id !== null) ids.push(id);
  }
  return ids; // duplicates kept: two windows for one document must count as two
}

// The functional instance's WebView browser is started with a DevTools port
// by the driver itself — that is how tauri-driver/msedgedriver talks to the
// app — and the port is written into `<profile>/DevToolsActivePort` (first
// line) in the driver's own scoped temp profile. A port handed to the app
// through the environment is ignored under the driver (measured, DR-147:
// "no debug port"); this is the real one, so a functional flow can read a
// second window the app opened (AC-99). The instance is identified through
// the driver's process subtree (the same walk the scoped cleanup uses,
// DR-162), so a lane only ever finds its own app.
export async function functionalCdpPort() {
  const deadline = Date.now() + 15000;
  for (;;) {
    // Candidate webview processes (the app's browser and its children) with
    // their command lines — the profile path lives there.
    const r = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "--webview-exe-name=pdfkeeper" } | ForEach-Object { "{0}`t{1}" -f $_.ProcessId, $_.CommandLine }',
      ],
      { encoding: "utf8", windowsHide: true },
    );
    const cmds = new Map();
    for (const line of (r.stdout || "").split(/\r?\n/)) {
      const [pid, cmd] = line.split("\t");
      if (!pid) continue;
      cmds.set(Number(pid), cmd ?? "");
    }
    if (cmds.size) {
      // The full parent map (the scoped-cleanup snapshot, DR-162) decides
      // which of them belong to this suite's driver; the app process itself
      // is between the driver and its webviews, so the walk must run over
      // the whole tree, not over the candidates.
      const children = processChildren();
      const parentOf = new Map();
      for (const [pid, list] of children) {
        for (const child of list) parentOf.set(child.pid, pid);
      }
      const descendsFromDriver = (pid) => {
        let cur = pid;
        for (let guard = 0; guard < 30 && cur; guard += 1) {
          if (cur === suiteDriverPid) return true;
          cur = parentOf.get(cur);
        }
        return false;
      };
      for (const [pid, cmd] of cmds) {
        if (!descendsFromDriver(pid)) continue;
        const m = cmd.match(/--user-data-dir=([^ ]+)/);
        if (!m) continue;
        const dir = m[1].replace(/^"|"$/g, "");
        try {
          const port = Number(readFileSync(join(dir, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0]);
          if (Number.isFinite(port) && port > 0) return port;
        } catch {
          /* the browser has not written the port file yet */
        }
      }
    }
    if (Date.now() > deadline) return null;
    await sleep(250);
  }
}

async function startCdpApp() {
  if (SCOPED) {
    // Close this suite's own window gracefully. Lane mode (DR-163): other
    // lanes' apps are alive by design, so only this process's own app has to
    // be gone — the subtree of its own driver (the DR-162 empirical result
    // holds: every instance spawns its own browser, so a still-running other
    // lane does not shadow this one's debug port). A reader-only lane
    // launched no app of its own: there is nothing to wait for.
    try {
      if (sessionId) await wd("DELETE", `/session/${sessionId}`);
    } catch {
      /* the session may already be gone */
    }
    sessionId = null;
    if (suiteDriverPid) {
      const deadline = Date.now() + 120000;
      while (ownAppProcesses().length) {
        if (Date.now() > deadline) {
          throw new Error("this suite's own app was still alive when the CDP instance had to start — the lane is not isolated");
        }
        await sleep(200);
      }
    }
  } else {
    spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
    spawnSync("taskkill", ["/IM", "msedgewebview2.exe", "/F"], { stdio: "ignore" });
  }
  rmSync(CDP_PROFILE, { recursive: true, force: true });
  cdpApp = spawn(APP_EXE, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: CDP_PROFILE,
    },
  });
  const mainTarget = await cdpWaitForTarget((t) => t.type === "page" && t.url === "http://tauri.localhost/", { timeout: 40000 });
  if (!mainTarget) throw new Error("the driverless instance exposed no main-window target");
  cdpMain = new CdpSession(mainTarget.webSocketDebuggerUrl);
  await cdpMain.ready;
  const ready = await cdpMain.waitFor(EVAL.appReady, { timeout: 30000 });
  if (!ready) throw new Error("the driverless app never reached the document area");
  const installed = await cdpMain.evaluate(BOUNDARY_SCRIPT);
  if (installed !== true) throw new Error("the app exposes no observable command boundary");
  console.log(`cdp instance on port ${CDP_PORT} — app launched directly (DR-147)`);
}

function stopCdpApp() {
  try { cdpMain?.ws.close(); } catch { /* already gone */ }
  cdpMain = null;
  if (SCOPED) {
    // Only the tree of the instance this process launched itself (DR-162).
    if (cdpApp) spawnSync("taskkill", ["/PID", String(cdpApp.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    if (cdpApp) cdpApp.kill();
    spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
    spawnSync("taskkill", ["/IM", "msedgewebview2.exe", "/F"], { stdio: "ignore" });
  }
  cdpApp = null;
}

// Reads of the library window at the CDP runtime.
const cMainEval = (script) => cdpMain.evaluate(script);
const cMainWait = (script, opts) => cdpMain.waitFor(script, opts);

async function cInvoke(command, payload) {
  return cMainEval(`return window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(payload)});`);
}

// The native top-level window titles of a process tree (user32 EnumWindows
// through PowerShell). The CDP target title is the document title — the
// window title property (DR-140/DR-206) is native, and only the OS sees it.
function nativeWindowTitles(pid) {
  const script = `
Add-Type -Namespace Win -Name W -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern int GetWindowTextLengthW(IntPtr h);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
'@
$appPid = [uint32]${pid}
$kids = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $appPid) -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.ProcessId })
$tree = @($appPid) + $kids
$found = New-Object System.Collections.Generic.List[string]
$cb = {
  param($h, $l)
  $p = 0
  [void][Win.W]::GetWindowThreadProcessId($h, [ref]$p)
  if ($tree -contains [uint32]$p) {
    $n = [Win.W]::GetWindowTextLengthW($h)
    if ($n -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($n + 1)
      [void][Win.W]::GetWindowTextW($h, $sb, $sb.Capacity)
      $found.Add($sb.ToString())
    }
  }
  return $true
}
[void][Win.W]::EnumWindows($cb, [IntPtr]::Zero)
$found | ForEach-Object { Write-Output $_ }
`;
  const res = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 30000 });
  return (res.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function cOpenCalls() {
  return cMainEval(`return window.__TAURI_INTERNALS__.__openCalls ?? null;`);
}
async function cReaderOpenCalls() {
  return cMainEval(`return window.__TAURI_INTERNALS__.__readerOpenCalls ?? null;`);
}
function cResetOpenCounter() {
  return cMainEval(`window.__TAURI_INTERNALS__.__openCalls = 0; window.__TAURI_INTERNALS__.__readerOpenCalls = 0; return true;`);
}

// The search through the app's own field: focus, real insertText, the app's
// own debounce and query (mirrors searchFor).
async function cSearch(term) {
  // Same contract as `typeInto`: "this is the field's content now" — the
  // existing selection is what insertText replaces, so a previous search's
  // text can never survive into the new term.
  await cMainEval(`
    const input = document.querySelector('.search-input');
    if (!input) return false;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    return true;
  `);
  await cdpMain.insertText(term);
  const applied = await cMainWait(
    `return (document.querySelector('.search-input')?.value ?? '') === ${JSON.stringify(term)} ? true : null;`,
    { timeout: 8000 },
  );
  if (!applied) throw new Error(`search term not applied: ${term}`);
  const shown = await cMainWait(`
    const rows = document.querySelectorAll('[data-row-id]');
    if (rows.length === 0) return null;
    return (rows[0].querySelector('.title-line')?.textContent ?? '').includes(${JSON.stringify(term)}) ? true : null;
  `, { timeout: 20000 });
  if (!shown) throw new Error(`the search term ${term} did not reach the rendered rows`);
}

async function cClearSearch() {
  await cMainEval(`document.querySelector('.search-input')?.focus(); return true;`);
  await cdpMain.key("Escape", "Escape", 27);
  await cMainWait(`return (document.querySelector('.search-input')?.value ?? '') === '' ? true : null;`, { timeout: 5000 });
}

// The row carrying a title, scrolled into view; coordinates are read in a
// second round-trip so the scroll has settled.
async function cRow(titleNeedle) {
  const found = await cMainEval(`
    const rows = Array.from(document.querySelectorAll('[data-row-id]'));
    const row = rows.find((r) => (r.querySelector('.title-line')?.textContent ?? '').includes(${JSON.stringify(titleNeedle)}));
    if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    return true;
  `);
  if (!found) return null;
  return cMainEval(`
    const row = Array.from(document.querySelectorAll('[data-row-id]')).find((r) => (r.querySelector('.title-line')?.textContent ?? '').includes(${JSON.stringify(titleNeedle)}));
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { id: Number(row.getAttribute('data-row-id')), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
}

// Delete through the app's own path (DR-149): row context menu → Delete →
// "Delete from library". The store deletes and the row goes with it — an
// invoke behind the store's back would only change the database.
async function cDeleteViaUi(x, y) {
  await cdpMain.rightClickAt(x, y);
  const item = await cMainWait(`
    const item = Array.from(document.querySelectorAll('.menu .menu-item')).find((i) => (i.textContent ?? '').trim() === 'Delete');
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, { timeout: 5000 });
  if (!item) throw new Error("the row context menu did not offer Delete");
  await cdpMain.clickAt(item.x, item.y);
  const confirm = await cMainWait(`
    const button = Array.from(document.querySelectorAll('.dialog-actions .control')).find((b) => (b.textContent ?? '').trim() === 'Delete from library');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, { timeout: 5000 });
  if (!confirm) throw new Error("the delete confirmation dialog did not open");
  await cdpMain.clickAt(confirm.x, confirm.y);
}

async function cDocIdByTitle(titleNeedle) {
  return cMainEval(`
    const row = Array.from(document.querySelectorAll('[data-row-id]')).find((r) => (r.querySelector('.title-line')?.textContent ?? '').includes(${JSON.stringify(titleNeedle)}));
    return row ? Number(row.getAttribute('data-row-id')) : null;
  `);
}

// Search, double-click the row, wait for the reader target, connect: the
// activation path AC-64 describes, through the app's own gestures.
async function cOpenReader(titleNeedle) {
  await cSearch(titleNeedle);
  const row = await cRow(titleNeedle);
  if (!row) throw new Error(`no row for ${titleNeedle}`);
  const openedAt = Date.now();
  await cResetOpenCounter();
  await cdpMain.doubleClickAt(row.x, row.y);
  const target = await cdpWaitForTarget((t) => cdpReaderId(t) === row.id, { timeout: 15000 });
  if (!target) throw new Error(`no reader window opened for ${titleNeedle} (id ${row.id})`);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.ready;
  return { id: row.id, session, openedAt };
}

async function cReaderConnected(id, { timeout = 15000, port = CDP_PORT } = {}) {
  const target = await cdpWaitForTarget((t) => cdpReaderId(t) === id, { timeout, port });
  if (!target) return null;
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.ready;
  return session;
}

// What the reader surface says: the page field's accessible name, the zoom
// label, the mounted pages with their rendered widths, the scroller box.
const READER_STATE = `
  const label = document.querySelector('.reader-controls input[aria-label]')?.getAttribute('aria-label') ?? null;
  const zoom = document.querySelector('.zoom-value')?.textContent?.trim() ?? null;
  const scroller = document.querySelector('.reader-scroll');
  const pages = Array.from(document.querySelectorAll('.page')).map((p) => {
    const img = p.querySelector('img');
    const placeholder = p.querySelector('.page-placeholder');
    return {
      // Mounted means mounted — the honest skeleton carries the same page
      // identity as the image it stands in for.
      alt: img?.getAttribute('alt') ?? placeholder?.getAttribute('aria-label') ?? null,
      complete: !!(img && img.complete && img.naturalWidth > 0),
      width: img ? Math.round(img.getBoundingClientRect().width) : 0,
    };
  });
  return {
    label, zoom, pages,
    mounted: pages.length,
    clientWidth: scroller?.clientWidth ?? null,
    scrollTop: Math.round(scroller?.scrollTop ?? -1),
    ready: !!document.querySelector('.reader'),
    errorState: document.querySelector('.error-state') ? (document.querySelector('.error-state')?.textContent ?? '') : null,
  };
`;

async function readerState(session) {
  return session.evaluate(READER_STATE);
}

// Poll the reader window until its page field reads `label`, and return the
// full state from that same atomic read. Polling the label in one round-trip
// and reading the mount in the next can straddle two JS contexts: a reader
// window's document is sometimes replaced early in its life by the
// WebView2/Tauri plumbing (DR-156), the poll then answered by the live
// context and the later read by the frozen one. One evaluation returns the
// label, the scroll position and the mounted pages together, so a check can
// only ever see one context's coherent state.
async function waitReaderAt(session, label, { timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let state = null;
    try { state = await session.evaluate(READER_STATE); } catch { state = null; }
    if (state && state.label === label) return state;
    if (Date.now() > deadline) return state;
    await sleep(100);
  }
}

// AC-72's measured rows: a named duration against its budget, recorded in the
// timing table like every other measured duration (AC-54).
function timingRow(name, ms, budgetMs, context) {
  timings.push({ name, ms });
  check(
    `NFR-08 / AC-72: ${name} within ${budgetMs} ms`,
    ms <= budgetMs,
    `measured ${ms} ms${context ? ` (${context})` : ""}`,
  );
}

// ---------------------------------------------------------------- DOM probes

export const EVAL = {
  appReady: `return !!document.querySelector('.app .status-bar');`,
  rowCount: `return document.querySelectorAll('[data-row-id]').length;`,
  docTotal: `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] ?? null;`,
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
      { sel: 'button[aria-label="Import PDFs"]' }, // UI-44 (AC-114)
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

export function toastContains(text) {
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
// Which fixture tier this run loaded (the core tier only — since DR-161 the
// docs tier belongs to scripts/ui-10k.mjs), and the titles that library
// holds. Expected counts are derived from the fixture manifest, never
// hard-coded.
let importedTiers = [];
let importedTitles = [];
// Whether the synthesized tauri://drag-drop reached the app's real listener
// (flowDropAndSkip, mandatory prefix, is the one that establishes this). The
// scale import goes through the app's own drop handler only when it did —
// run state, not a flow parameter, so every run shape uses the same path.
let dropWorks = false;

const tierDir = (tier) => (tier === "core" ? FIXTURE_CORE : FIXTURE_DOCS);
export const tierPdfPaths = (dir) =>
  readdirSync(dir).filter((n) => n.endsWith(".pdf")).sort().map((n) => join(dir, n));
const coreManifest = () => JSON.parse(readFileSync(join(FIXTURE_CORE, "manifest.json"), "utf8"));

// Loads one fixture tier through the app's own import command and waits for
// the status-bar count to reach the expected total. Delta-based (DR-159):
// the import runs after the prefix flows have already touched the library,
// so the expectation is the current count plus this tier. The current count
// is read from the status bar, which the mandatory prefix flows (AC-60)
// guarantee is published before any tier phase runs.
async function importTier(tier) {
  const paths = tierPdfPaths(tierDir(tier));
  const before = await docCount();
  if (!Number.isFinite(before)) throw new Error(`importTier(${tier}) could not read the library count: ${before}`);
  const expected = (before + paths.length).toLocaleString("en-US");
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [paths],
  );
  const done = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
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

// Self-sufficient flow setup (D14): a flow starts from a known state — full
// library, no tag filter, no search, rows on screen — instead of
// inheriting whatever the previous flow left behind.
async function setupListView(minRows = 3) {
  await clearTagFilter();
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
  await clearTagFilter();
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

// Flows build their own entities (D14): create the named tags that do
// not exist yet, through the manager dialog.
async function ensureTagNames(names) {
  const existing = new Set(await allTagNames());
  const missing = names.filter((n) => !existing.has(n));
  if (!missing.length) return;
  await openTagsManager();
  for (const name of missing) await createTag(name);
  await closeDialog("the tags manager");
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
  // The touch must produce a change the app can see: it stores mtime at whole-
  // second resolution (mtime_secs), and the flow's own import may have stored
  // a file mtime from the same second — a plain `now` touch would then be
  // invisible to Rescan and the job would enqueue nothing (measured 2026-11-07:
  // the rescan re-imported 0 files, no progress event ever fired). A bump to
  // strictly past the file's current mtime is always a detectable change; the
  // file is never modified after generation, so its mtime is always >= what any
  // import stored, and the drift stays bounded by a few seconds.
  for (const p of tierPdfPaths(FIXTURE_CORE)) {
    const bump = new Date(Math.max(Date.now(), statSync(p).mtimeMs + 2000));
    utimesSync(p, bump, bump);
  }
  // The bar is caught by a page-side observer armed BEFORE the click, the
  // same pattern flowProgressTransform uses for its own measurement: on an
  // idle machine the whole job (100 re-renders) runs and finishes while the
  // Rescan menu is still closing, so a DOM poll started after the click can
  // miss the bar entirely (measured 2026-11-07: the job completed inside the
  // menu-close wait, covers went 0 → 92 with no observable bar). The
  // observer records the first bar mounted after arming; every caller has
  // established the app is idle first, so that bar is this job's.
  await execute(`
    window.__boundedBar = null;
    window.__boundedObs = new MutationObserver(() => {
      if (window.__boundedBar) return;
      const wrap = document.querySelector('.progress-wrap');
      if (!wrap) return;
      const m = wrap.textContent.match(/([0-9,]+)\\s*\\/\\s*([0-9,]+)/);
      window.__boundedBar = { label: wrap.getAttribute('aria-label'), text: m ? m[0] : wrap.textContent.trim().slice(0, 60) };
    });
    window.__boundedObs.observe(document.body, { subtree: true, childList: true });
    return true;
  `);
  await runRescan();
  const first = await waitForEval(`
    const bar = window.__boundedBar ?? null;
    if (bar) window.__boundedObs?.disconnect();
    return bar;
  `, { timeout: 15000 });
  if (!first) {
    await execute(`window.__boundedObs?.disconnect(); return true;`);
    throw new Error("the bounded rescan job never showed a progress bar (delete-covers + mtime touch + Rescan — §3.1.1)");
  }
  return first;
}

// ---------------------------------------------------------------- flows

export async function flowStartup() {
  const ready = await waitForEval(EVAL.appReady, { timeout: 45000 });
  if (!ready) throw new Error(`app window never reached the document area — ${await notReadyDiagnosis()}`);
  check("startup: app shell + document area mount", true);

  // The empty-state variant renders after the app's first status round-trip,
  // a beat after the shell mounts. A single read races it: measured
  // 2026-11-07, in the cap-10 flood's launch storm (ten apps starting within
  // 1.2 s) the mount check passed and this read saw the pre-status DOM at
  // +650 ms. Observe it the way the mount is observed — polled, within a
  // bound the app's own startup claim (NFR-01 < 3 s) is far inside.
  const empty = await waitForEval(EVAL.bodyHas, { timeout: 15000, args: ["Your library is empty"] });
  check("startup: empty-state variant for a fresh library", !!empty,
    empty ? undefined : `not rendered within 15 s; status bar: ${await execute(`return document.querySelector('.status-bar')?.textContent.trim().slice(0, 80) ?? "no status bar";`)}`);
}

export async function emitDrop(paths) {
  try {
    await execute(EVAL.emitDragDrop, [paths]);
    return true;
  } catch {
    return false;
  }
}

export async function flowDropAndSkip() {
  // Drop wiring end-to-end: a synthesized tauri://drag-drop reaches the
  // app's real listener; a non-PDF comes back as a reported skip (FR-01/FR-11).
  if (await emitDrop([join(FIXTURE_SPECIAL, "notes.txt")])) {
    const skipped = await toastContains("document skipped");
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
    `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] });`,
    [[join(FIXTURE_SPECIAL, "notes.txt")]],
  );
  const skipped = await toastContains("document skipped");
  check("non-PDF import is reported as a skip, never silently ignored (FR-11)", !!skipped);
  return false;
}

// Scale flow (exported for scripts/ui-10k.mjs — DR-161): this suite never
// loads the docs tier; the corpus is the measured import that runs first in
// that suite, and NFR-01's mount bound is verified there.

export async function flowVirtualization() {
  // Self-sufficient (D14): the flow establishes its own full-list query
  // instead of relying on the previous flow leaving one visible.
  await clearTagFilter();
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
  await clearTagFilter();
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

async function flowTags() {
  // Self-sufficient (D14): the flow needs its own rows to select.
  await setupListView(3);

  // UI-10: the tag CRUD lives in the manager dialog, reached through
  // Browse → Manage tags.
  await openMenu('.browse-trigger', '.menu.browse-menu');
  await clickMenuItem('.menu.browse-menu', "Manage tags");
  const manager = await waitForEval(`return document.querySelector('.modal input[aria-label="Add tag"]') ? true : null;`, { timeout: 5000 });
  check("UI-10: Manage tags opens the tags manager", !!manager);

  await typeInto('.modal input[aria-label="Add tag"]', "Smoke Cat");
  await keys("Enter");
  // Poll both halves together: the info toast auto-dismisses after 6 s, so
  // waiting out a failed list check first would erase the toast evidence.
  const both = await waitForEval(`
    const row = !!document.querySelector('.modal .tag-row .tag-name') &&
      Array.from(document.querySelectorAll('.modal .tag-name')).some((b) => b.textContent.includes('Smoke Cat'));
    const toast = Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes('Tag created'));
    return row && toast;
  `, { timeout: 15000 });
  if (both) {
    check("AC-03 UI: tag creation via keyboard (manager field + Enter)", true);
  } else {
    const diag = await execute(`
      return {
        input: document.querySelector('.modal input[aria-label="Add tag"]')?.value ?? null,
        rows: Array.from(document.querySelectorAll('.modal .tag-name')).map((e) => e.textContent.trim()),
        toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
      };
    `);
    check("AC-03 UI: tag creation via keyboard (manager field + Enter)", false, `state: ${JSON.stringify(diag)}`);
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

  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Tags"]]', "xpath");
  const picker = await waitForEval(EVAL.bodyHas, { args: ["Tags for 3 documents"] });
  check("bulk bar opens the tag picker (UI-04)", !!picker);

  // UI-04 baseline: a tag none of the selection has is pre-ticked for
  // ADD; the user confirms before anything is written.
  const addChecked = () =>
    execute(`return document.querySelector('input[aria-label="Add: Smoke Cat"]')?.checked ?? null;`);
  const baseline = await waitForEval(`
    return document.querySelector('input[aria-label="Add: Smoke Cat"]')?.checked === true;
  `, { timeout: 5000 });
  check("picker pre-ticks add for a tag the selection lacks (UI-04)", !!baseline);
  await click('input[aria-label="Add: Smoke Cat"]');
  const toggledOff = (await addChecked()) === false;
  await click('input[aria-label="Add: Smoke Cat"]');
  const toggledOn = (await addChecked()) === true;
  check("picker add checkbox toggles the assignment off and on", toggledOff && toggledOn);
  await click('//button[normalize-space()="Apply"]', "xpath");

  // The filter is now a Browse-menu choice (UI-09); the result count is the
  // same number the manager row shows.
  await browseSelectTag("Smoke Cat");
  const filtered = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '3 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  const chip = await activeTagNames();
  check("AC-03 UI: a tag filter from Browse shows exactly the assigned documents", !!filtered, `status: ${filtered}`);
  check("UI-09: the active tag appears as a checked item", chip.includes("Smoke Cat"), `checked: ${JSON.stringify(chip)}`);
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

  // AC-68 (UI-31): the menu carries Open then Open in external viewer; the
  // external item reaches `app_open_document` exactly once, the in-app item
  // reaches `app_open_reader_window` and never the OS path; the row's action
  // line stays favorite/details/delete — Open is not a row action.
  await clearSelection();
  await instrumentBoundary();
  await resetOpenCounter();
  await rightClick("[data-row-id]");
  const items = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    return Array.from(menu.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
  `, { timeout: 5000 });
  check(
    "AC-68: the context menu carries Open then Open in external viewer",
    Array.isArray(items) && items[0] === "Open" && items[1] === "Open in external viewer",
    JSON.stringify(items),
  );
  await clickMenuItem('.menu', "Open in external viewer");
  const externalProof = await waitForEval(`
    const internals = window.__TAURI_INTERNALS__;
    if ((internals.__openCalls ?? 0) < 1) return null;
    return { open: internals.__openCalls, reader: internals.__readerOpenCalls ?? 0 };
  `, { timeout: 8000 });
  await menuClosed(".menu");
  check(
    "AC-68: the external item calls app_open_document exactly once and not the reader command",
    !!externalProof && externalProof.open === 1 && externalProof.reader === 0,
    JSON.stringify(externalProof),
  );
  await expectNoErrorToast("AC-68: the external open of a present file surfaces no failure");

  await rightClick("[data-row-id]");
  await clickMenuItem('.menu', "Open");
  const inAppProof = await waitForEval(`
    const internals = window.__TAURI_INTERNALS__;
    if ((internals.__readerOpenCalls ?? 0) < 1) return null;
    return { open: internals.__openCalls, reader: internals.__readerOpenCalls };
  `, { timeout: 8000 });
  await menuClosed(".menu");
  check(
    "AC-68: the in-app item calls app_open_reader_window and never app_open_document",
    !!inAppProof && inAppProof.reader >= 1 && inAppProof.open === 1,
    JSON.stringify(inAppProof),
  );
  await expectNoErrorToast("AC-68: opening a present file in the reader surfaces no failure");

  const rowActions = await execute(`
    const row = document.querySelector('[data-row-id]');
    if (!row) return null;
    return Array.from(row.querySelectorAll('.row-actions button')).map((b) => b.getAttribute('aria-label'));
  `);
  check(
    "AC-68: the row action line is unchanged — no Open action appears on rows",
    JSON.stringify(rowActions) === JSON.stringify(["Details", "Add to favorites", "Delete"]),
    JSON.stringify(rowActions),
  );
}

async function flowDelete() {
  // Self-sufficient (D14): the flow builds its own delete case — a tag
  // holding exactly three documents — instead of borrowing flowTags'
  // selection, and reads the library total before and after instead of
  // naming a corpus-specific number.
  const grouped = (n) => n.toLocaleString("en-US");
  await setupListView(3);
  await ensureTagNames(["Delete Probe"]);
  await selectFirstRows(3);
  await applyTagToSelection("Delete Probe");
  await clearSelection();
  await browseSelectTag("Delete Probe");
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
  const emptyTag = await waitForEval(EVAL.bodyHas, { args: ["This tag is empty"] });
  const total = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0];
    return t === ${JSON.stringify(grouped(before - 3))} ? t : null;
  `, { timeout: 10000 });
  const toast = await toastContains("Deleted 3 documents");
  check("AC-04 UI: 'Delete from library' removes exactly the selection", !!emptyTag && total === grouped(before - 3) && !!toast);

  await browseSelect("All documents");
  const allBack = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0];
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

async function flowReading() {
  // FR-19 (AC-121/AC-102/AC-103): the Reading action on a row marks the document,
  // the Browse menu's Reading view shows exactly the marked documents with a
  // live count, the mode composes with search like the other modes, and the
  // toggle removes membership again. Self-sufficient (D14): the flow marks
  // and unmarks its own document and leaves no Reading state behind.
  await setupListView(6);
  const target = await waitForEval(`
    const rows = document.querySelectorAll('.row[data-row-id]');
    if (rows.length < 6) return null;
    const r = rows[2];
    return { id: r.getAttribute('data-row-id'), title: r.textContent.trim().slice(0, 60) };
  `, { timeout: 15000 });
  check("reading flow: a mid-list row is available", !!target);

  // Row actions are display:none until the row is hovered or focused (UI-03).
  await execute(`
    document.querySelector('[data-row-id="${target.id}"]')?.focus();
    return true;
  `);
  await click(`//div[@data-row-id="${target.id}"]//button[@aria-label="Add to Reading"]`, "xpath");
  const marked = await browseCountIs("Reading", "1");
  check("FR-19: the Reading action updates the Reading count", marked);

  // UI-43: the toggle follows the membership state — the same button now
  // carries the removal label (and the filled glyph).
  const relabeled = await waitForEval(`
    return document.querySelector('[data-row-id="${target.id}"] button[aria-label="Remove from Reading"]') ? true : null;
  `, { timeout: 5000 });
  check("UI-43: the Reading toggle follows the membership state", !!relabeled);

  await browseSelect("Reading");
  const onlyTarget = await waitForEval(`
    const c = document.querySelector('.result-count');
    const rows = document.querySelectorAll('.row[data-row-id]');
    return c && c.textContent === '1 shown' && rows.length === 1 &&
      rows[0].getAttribute('data-row-id') === arguments[0] ? true : null;
  `, { timeout: 10000, args: [target.id] });
  let viewDetail = "";
  if (!onlyTarget) {
    viewDetail = JSON.stringify(await execute(`
      const c = document.querySelector('.result-count');
      const rows = Array.from(document.querySelectorAll('.row[data-row-id]'));
      return {
        count: c ? c.textContent : null,
        rows: rows.map((r) => r.getAttribute('data-row-id')),
        want: arguments[0],
        active: Array.from(document.querySelectorAll('.menu.browse-menu .menu-item[data-active]')).length,
      };
    `, [target.id]));
  }
  const checked = await browseCheckedItems();
  check("FR-19: the Reading view shows exactly the marked document", !!onlyTarget, viewDetail);
  check("UI-43: the Reading mode appears as a checked item", checked.some((text) => text.startsWith("Reading")), `checked: ${JSON.stringify(checked)}`);

  // AC-102 (the manual-only rule): opening a document changes no membership.
  // The external-viewer path runs here; the reader and relink paths are the
  // Rust half — the flag is written only by the Reading action.
  await rightClick(`[data-row-id="${target.id}"]`);
  await clickMenuItem('.menu', "Open in external viewer");
  const untouched = await browseCountIs("Reading", "1");
  check("AC-102: opening a document leaves Reading membership unchanged", untouched);
  const stillMarked = await waitForEval(`
    return document.querySelector('[data-row-id="${target.id}"] button[aria-label="Remove from Reading"]') ? true : null;
  `, { timeout: 5000 });
  check("AC-102: the opened row is still marked", !!stillMarked);

  // AC-103: the view composes with search — a term matching nothing inside
  // the view narrows the result to zero; the mode itself stays active.
  await typeInto(".search-input", "zzqx-no-such-term");
  const zeroed = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '0 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  check("FR-19: the Reading view composes with search", !!zeroed, `status: ${zeroed}`);
  await clearSearch();

  // Removing membership: the count returns to zero, the document is back in
  // the full list, and the Reading view shows its empty state.
  await browseSelect("All documents");
  await execute(`
    document.querySelector('[data-row-id="${target.id}"]')?.focus();
    return true;
  `);
  await click(`//div[@data-row-id="${target.id}"]//button[@aria-label="Remove from Reading"]`, "xpath");
  const cleared = await browseCountIs("Reading", "0");
  check("FR-19: the Reading action removes the document from the collection", cleared);
  await browseSelect("Reading");
  const empty = await waitForEval(`
    return document.body.textContent.includes('Nothing marked as reading') ? true : null;
  `, { timeout: 10000 });
  check("FR-19: an empty Reading view shows its empty state", !!empty);
  await browseSelect("All documents");
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
  // Self-sufficient (D14) and lane-safe (DR-163): the flow works on a private
  // probe copy under tmp/ — in lane mode other lanes import the shared
  // fixture tree concurrently, and moving a fixture file out of it would
  // disturb their imports. The probe is imported through the same command the
  // drop handler calls (setup, not the import path under test).
  const probeDir = join(root, "tmp", "relink-probe");
  const awayDir = join(root, "tmp", "relink-probe-away");
  rmSync(probeDir, { recursive: true, force: true }); // leftovers of an aborted run
  rmSync(awayDir, { recursive: true, force: true });
  mkdirSync(probeDir, { recursive: true });
  copyFileSync(join(tierDir("core"), "doc00500.pdf"), join(probeDir, "relinkprobe.pdf"));
  const moved = join(probeDir, "relinkprobe.pdf");
  const outside = join(awayDir, "relinkprobe.pdf");
  await setupListView(1);
  const before = await docCount();
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [[moved]], // the script's argument is the array of paths (execute() convention, as in importTier)
  );
  const target = (before + 1).toLocaleString("en-US");
  const imported = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
    { timeout: 30000, args: [target] },
  );
  if (!imported) throw new Error(`the relink probe was not imported (library: ${await execute(EVAL.docTotal)})`);

  // FR-15 busy gate on the bounded core-library job (§3.1.1): the gate is
  // closed while the job runs and open again when it completes — both halves
  // observed, on a job the app can actually start in this library. The
  // progress→idle transition is the observation; jobIdle() bounds it.
  const started = Date.now();
  const job = await startBoundedCoverJob();
  // The gate half, observed in-page (DR-247): the menu item's disabled state
  // and the status bar's progress row share one source — the feedback store's
  // job state — and since the DR-196 encoder tuning and the DR-233 chunked
  // pipeline the bounded job drains inside a WebDriver menu round-trip
  // (measured 2026-11-09: the openMenuSure probe never caught the closed
  // gate). The bar is caught from inside the page by the helper's own
  // observer; the gate is caught the same way: keep the Browse menu open in-
  // page while the job runs and read the item's disabled state. The job's
  // cover phase emits batched events (one per 25 renders), so "done" is a
  // sustained bar absence (2 s — longer than any batch gap), not one read.
  await execute(`
    window.__gateSeen = false;
    window.__done = false;
    (async () => {
      const trigger = document.querySelector('.browse-trigger');
      let lastBar = Date.now();
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (document.querySelector('.progress-wrap')) lastBar = Date.now();
        if (!window.__gateSeen) {
          const menu = document.querySelector('.menu.browse-menu');
          if (!menu) {
            if (Date.now() - lastBar <= 2000) trigger.click();
          } else {
            const item = [...menu.querySelectorAll('.menu-item')]
              .find((e) => e.textContent.trim().startsWith('Rescan documents'));
            if (item && (item.hasAttribute('data-disabled') || item.getAttribute('aria-disabled') === 'true')) {
              window.__gateSeen = true;
            }
          }
        }
        if (Date.now() - lastBar > 2000) { window.__done = true; return; }
        await sleep(25);
      }
    })();
    return true;
  `);
  const drained = await waitForEval(`return window.__done === true ? "drained" : null;`, { timeout: 25000 });
  const completed = drained === "drained";
  if (completed) {
    try {
      await jobIdle();
    } catch (error) {
      completed = false;
      console.error(`[job] ${error.message}`);
    }
  }
  const gateObs = await waitForEval(`return window.__gateSeen === true ? "closed" : "missed";`, { timeout: 3000 });
  const gateClosed = gateObs === "closed";
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  const reEnabled = await rescanItemEnabled();
  check(
    "job progress completes; Rescan re-enables after the bounded job drains (FR-15)",
    gateClosed && completed && reEnabled === true,
    `gate closed during job: ${gateClosed}; completed: ${completed}; re-enabled: ${reEnabled}; ${((Date.now() - started) / 1000).toFixed(1)} s; progress: ${JSON.stringify(job)}`,
  );
  if (!completed) throw new Error("the bounded job never completed — the flow cannot continue against a busy app");

  mkdirSync(awayDir, { recursive: true });
  renameSync(moved, outside);

  await runRescan();
  const found = await toastContains("1 missing document found");
  check("AC-05 UI: manual Rescan reports the missing file", !!found);

  // The relink checks need the full library (search ∩ tag would show
  // nothing) — the flow's own setup already established the unfiltered view.
  // The probe's name is unique: the filter shows exactly the probe row.
  await typeInto(".search-input", "relinkprobe");
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
    };
  `);
  check("AC-47: the row flag is plain text in the corrected warning color — no ground, no pill",
    !!flag && flag.ground === "rgba(0, 0, 0, 0)" && flag.radius === "0px" && flag.color === flag.expected,
    JSON.stringify(flag));
  // AC-87 (UI-37): the path tooltip is the app's own — the check hovers the
  // flag and reads the opened tooltip node (the mechanism AC-33's toolbar
  // survey uses), not a native title attribute.
  const flagTip = (await tooltipOnHover("[data-row-id][data-missing] .missing-flag")).tip;
  check("AC-47: the row flag's tooltip carries the stored path",
    typeof flagTip === "string" && flagTip.includes("relinkprobe"), JSON.stringify(flagTip));

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
  await typeInto(".search-input", "relinkprobe");
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
      height: rect.height,
    };
  `, { timeout: 10000 });
  check("AC-47: the card overlay keeps a warning-tinted ground with radius at half its height",
    !!badge && badge.bg === badge.ground && badge.bg !== "rgba(0, 0, 0, 0)" && badge.radius <= badge.height / 2 + 0.5,
    JSON.stringify(badge));
  const badgeTip = (await tooltipOnHover(".card[data-missing] .missing-flag.over-image")).tip;
  check("AC-47: the card badge's tooltip carries the stored path",
    typeof badgeTip === "string" && badgeTip.includes("relinkprobe"), JSON.stringify(badgeTip));
  // The badge sample leaves the pointer on the flag with its tooltip open —
  // since DR-213 the content is viewport-positioned and can cover the card's
  // own centre. Park first so the next hover is the card, not the tooltip.
  await parkPointer();

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
    !!warning && /1 document missing/.test(warning), `status bar: ${JSON.stringify(warning)}`);

  // Enter on the missing row -> failed command -> toast WITH its action (R4.6).
  await execute(EVAL.focusFirstRow);
  await keys("Enter");
  const errorToast = await toastContains("file is missing");
  const action = await waitForEval(EVAL.toastActionLabel, { timeout: 5000 });
  check("failed command produces a toast with its action (Relink)", !!errorToast && action === "Relink", `action: ${action}`);

  await click('.toast.error .control');
  const dialog = await waitForEval(EVAL.bodyHas, { args: ["Relink missing document"] });
  check("AC-05 UI: the toast action opens the relink dialog", !!dialog);

  await keys("Escape");
  const closed = await waitForEval(`return !document.body.textContent.includes('Relink missing document');`, { timeout: 5000 });
  check("Esc closes the innermost overlay", !!closed);

  // UI-02: the editor offers Relink on a missing document (same dialog).
  await openEditorForRow('[data-row-id][data-missing]');
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Relink"]', "xpath");
  const editorRelink = await waitForEval(EVAL.bodyHas, { args: ["Relink missing document"] });
  check("UI-02: the editor's Relink opens the relink dialog", !!editorRelink);
  await keys("Escape");
  await waitForEval(`return !document.body.textContent.includes('Relink missing document') ? true : null;`, { timeout: 5000 });

  renameSync(outside, moved);
  await runRescan();
  const restored = await toastContains("1 document found again");
  const stillMissing = await execute(EVAL.missingRow);
  check("AC-05 UI: Rescan finds the file again and clears the flag", !!restored && !stillMissing);
  const warningGone = await execute(`return document.querySelector('.status-bar .missing-warning') ? null : true;`);
  check("AC-22: the status bar stops saying it once nothing is missing", !!warningGone);
  rmSync(probeDir, { recursive: true, force: true });
  rmSync(awayDir, { recursive: true, force: true });

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
  // D1 / AC-12 (v0.0.5) + AC-64 (v0.0.6): counting calls at the real command
  // boundary shows exactly which gesture activates a document — since v0.0.6
  // the activation command is `app_open_reader_window`; `app_open_document` is
  // the external-viewer path (flowContextMenu). The reader window itself is
  // outside this WebDriver session; the boundary record is the proof here, the
  // window's own behavior is the CDP reader flows' claim. A failure would
  // surface as an error toast. Self-sufficient (D14): builds its own rows.
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
        open: window.__TAURI_INTERNALS__.__openCalls,
        reader: window.__TAURI_INTERNALS__.__readerOpenCalls,
        selected: !!row && row.hasAttribute('data-selected'),
        bulk: !!document.querySelector('.bulk-bar'),
      };
    })();
  `, [target.id]);
  check(
    "AC-12 / AC-30 / AC-64: a single click opens nothing and, in browse mode, selects nothing (DR-66, UI-18)",
    single.open === 0 && single.reader === 0 && !single.selected && !single.bulk,
    `open: ${single.open}, reader: ${single.reader}, selected: ${single.selected}`,
  );

  await doubleClickStable(titleAt);
  // D16: the wait is a condition, not a pause — poll whether the boundary
  // counter moved; the skip branch runs only once it definitively has not.
  const doubled = await waitForEval(
    `return window.__TAURI_INTERNALS__.__readerOpenCalls > 0 ? true : null;`,
    { timeout: 3000 },
  );
  const afterDoubleClick = await execute(`return window.__TAURI_INTERNALS__.__readerOpenCalls;`);
  if (doubled) {
    check("AC-64: a real double-click activates the document (reader window)", true, `reader open calls: ${afterDoubleClick}`);
  } else {
    skip("AC-64: native double-click generation", `msedgedriver's action chain produced no dblclick (calls stayed ${afterDoubleClick})`);
    await execute(`
      const el = document.querySelector('[data-row-id="' + arguments[0] + '"] .title-line');
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    `, [target.id]);
    const synthetic = await waitForEval(`return window.__TAURI_INTERNALS__.__readerOpenCalls > 0 ? true : null;`, { timeout: 5000 });
    check("AC-64: the double-click handler activates the document", !!synthetic);
  }
  await expectNoErrorToast("AC-64: opening a present file in the reader surfaces no failure");

  const before = await execute(`return window.__TAURI_INTERNALS__.__readerOpenCalls;`);
  await execute(`document.querySelector('[data-row-id="' + arguments[0] + '"]')?.focus(); return true;`, [target.id]);
  await keys("Enter");
  const afterEnter = await waitForEval(`return window.__TAURI_INTERNALS__.__readerOpenCalls > arguments[0] ? true : null;`, { timeout: 5000, args: [before] });
  check("AC-64: Enter still activates the focused row", !!afterEnter);

  // The reader window this flow opened belongs to a core-tier document; the
  // flows that delete this document (flowDelete, flowEmptyAndSkeleton) close
  // it through the app's own delete path (AC-67). Leave the row unselected.
  await keys("Escape");
  await waitForEval(`return !document.querySelector('.bulk-bar') ? true : null;`, { timeout: 5000 });
}

async function flowCovers() {
  // Covers are queued at import (and re-queued by the bounded jobs of the
  // status-bar flows); the cover job's completion re-query (DR-231 as
  // corrected by DR-237) carries the finished paths into the open view.
  // Self-sufficient (D14): the flow establishes its own unfiltered list
  // view first.
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

  // AC-100 (FR-16 further MODIFIED, DR-231 as corrected by DR-237/DR-238):
  // covers that finish while the view is open appear on their own. The
  // window: the list is filtered to `doc010` — a query no imported document
  // matches yet — while the batch (a 40-file slice of the docs tier,
  // doc01001…, titles no core document carries, plus the two unrenderable
  // specials) is imported. The import re-queries nothing (measured, DR-235);
  // from the import through the appearance the flow performs no reload, no
  // search and no view switch — the rows can only reach the view through the
  // cover job's completion re-query (DR-231/DR-237).
  await typeInto(".search-input", "doc010");
  const filtered = await waitForEval(
    `return (document.querySelector('.search-input')?.value ?? '') === 'doc010' && document.querySelectorAll('[data-row-id]').length === 0 ? true : null;`,
    { timeout: 8000 },
  );
  if (!filtered) throw new Error("the AC-100 window needs the filtered list to be empty before the import");

  const batch = [
    ...Array.from({ length: 40 }, (_, i) => join(FIXTURE_DOCS, `doc${String(1001 + i).padStart(5, "0")}.pdf`)),
    join(FIXTURE_SPECIAL, "malformed.pdf"),
    join(FIXTURE_SPECIAL, "encrypted.pdf"),
  ];
  const before100 = await docCount();
  if (!Number.isFinite(before100)) throw new Error(`flowCovers could not read the library count: ${before100}`);
  const expected100 = (before100 + batch.length).toLocaleString("en-US");
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [batch],
  );
  const landed = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
    { timeout: 90000, args: [expected100] },
  );
  if (!landed) throw new Error(`the AC-100 batch import did not complete (count: ${await execute(EVAL.docTotal)})`);
  importedTitles = importedTitles.concat(
    batch.slice(0, 40).map((p) => `Fixture Doc ${basename(p).replace(/\.pdf$/, "")}`),
    ["malformed", "encrypted"],
  );

  // The appearance itself: no user action from the import through it. A
  // mid-import partial drain (chunk N's covers finishing before chunk N+1
  // commits) may bring a partial window earlier — still no user action,
  // conformant (DR-238). The assertion stands on the mounted rows being
  // fully covered, served and rendered.
  const covered100 = await waitForEval(`
    const rows = Array.from(document.querySelectorAll('.row[data-row-id]'));
    if (rows.length < 8) return null;
    const imgs = rows.map((r) => r.querySelector('.cover img')).filter(Boolean);
    if (imgs.length !== rows.length) return null;
    return {
      rows: rows.length,
      served: imgs.filter((i) => i.src.includes('covers')).length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    };
  `, { timeout: 120000 });
  check("AC-100: finished covers render in the open view with no reload, search or view switch — the completion event's own re-query did it",
    !!covered100 && covered100.served === covered100.rows && covered100.loaded === covered100.rows,
    covered100 ? `mounted rows: ${covered100.rows}, served asset paths: ${covered100.served}, rendered: ${covered100.loaded}`
      : "the mounted rows never gained their covers without a further user action");

  // Selection and scroll are established on the appeared window; the next
  // cover completion — two further matching files, whose queue drains within
  // ~1 s of its import (measured, DR-238) — re-runs the re-query under
  // them, and they must stand.
  await execute(`
    const s = document.querySelector('.document-area .scroller') ?? document.querySelector('.scroller');
    if (!s) return null;
    s.scrollTop = 99999; // clamps to the bottom: the mounted window is the tail rows
    return true;
  `);
  const picked100 = await execute(`
    const rows = document.querySelectorAll('.row[data-row-id]');
    return rows.length > 8 ? rows[Math.floor(rows.length / 2)].getAttribute('data-row-id') : null;
  `);
  if (!picked100) throw new Error("the AC-100 window mounted too few rows to select one");
  await execute(`document.querySelector('[data-row-id="' + arguments[0] + '"]').focus(); return true;`, [picked100]);
  await keys("Space");
  const selected100 = await waitForEval(
    `return document.querySelector('[data-row-id="' + arguments[0] + '"]').hasAttribute('data-selected') ? true : null;`,
    { timeout: 8000, args: [picked100] },
  );
  if (!selected100) throw new Error("the AC-100 flow needs a selected row to prove the re-query leaves it standing");
  // The baseline is read after the selection: focusing the row may scroll it
  // into view, and the claim is about the re-query, not about the focus.
  const scrolled100 = await execute(`
    const s = document.querySelector('.document-area .scroller') ?? document.querySelector('.scroller');
    return s ? s.scrollTop : null;
  `);
  if (!Number.isFinite(scrolled100)) throw new Error("no list scroller to scroll for the AC-100 window");

  const more100 = [
    join(FIXTURE_DOCS, "doc01041.pdf"),
    join(FIXTURE_DOCS, "doc01042.pdf"),
  ];
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [more100],
  );
  const landedMore = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
    { timeout: 60000, args: [(before100 + batch.length + more100.length).toLocaleString("en-US")] },
  );
  if (!landedMore) throw new Error("the AC-100 second import did not complete");
  // The second completion re-query is proven at the store: the flow touches
  // nothing after the import — no search, no refresh, no view action — and
  // imports through `invoke` directly, bypassing the store's own import path,
  // so the only way the two new rows can reach `library.rows` is the
  // completion event's re-query (DR-231/DR-237). They are NOT expected in
  // the mounted DOM: at the preserved bottom scroll the new rows (title ASC
  // — they sort last) sit below the viewport, and the scroll staying put is
  // exactly what the next check claims.
  const reappeared100 = await waitForEval(`
    return (globalThis.__library?.rows ?? []).some((r) => (r.title ?? '').includes('doc01041')) ? true : null;
  `, { timeout: 30000 });
  if (!reappeared100) throw new Error("the second cover completion did not re-query the window");
  const held100 = await execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    const s = document.querySelector('.document-area .scroller') ?? document.querySelector('.scroller');
    return {
      selected: !!row && row.hasAttribute('data-selected'),
      bulk: !!document.querySelector('.bulk-bar .bulk-count'),
      scrollTop: s ? s.scrollTop : null,
    };
  `, [picked100]);
  check("AC-100: the completion re-query leaves selection and scroll state untouched",
    held100.selected && held100.bulk && held100.scrollTop === scrolled100, JSON.stringify(held100));

  // The unrenderable fixtures: their cover jobs never produce a cover —
  // after the batch drained, their rows keep the glyph fallback.
  await clearSearch();
  for (const name of ["malformed", "encrypted"]) {
    await searchFor(name);
    const special100 = await waitForEval(`
      const row = document.querySelector('.row[data-row-id]');
      if (!row) return null;
      return {
        glyph: !!row.querySelector('.cover .glyph'),
        img: !!row.querySelector('.cover img'),
      };
    `, { timeout: 10000 });
    check(`AC-100: the unrenderable fixture ${name}.pdf keeps the glyph fallback unchanged`,
      !!special100 && special100.glyph && !special100.img, JSON.stringify(special100));
  }
  await clearSearch();
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
  const notes = ("A note long enough to be ellipsized inside a list row: " + "wrapped continuation text ".repeat(20)).trimEnd();

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
        clipped: notesLine.scrollWidth > notesLine.clientWidth,
        height: Math.round(el.getBoundingClientRect().height),
      };
    })();
  `, { timeout: 10000 });
  check("AC-08: author and notes render as their own lines under the title",
    !!row && row.authorText === author, row ? `author line: ${row.authorText}` : "no author/notes line in the row");
  // AC-87 (UI-37): the full text is the app's own tooltip — each line is
  // hovered and the opened tooltip node is read (no native title remains).
  const titleTip = (await tooltipOnHover("[data-row-id] .title-line")).tip;
  const authorTip = (await tooltipOnHover("[data-row-id] .author-line")).tip;
  const notesTip = (await tooltipOnHover("[data-row-id] .notes-line")).tip;
  check("AC-08: every ellipsized line carries its full text as a tooltip",
    !!row && row.clipped && notesTip === notes && authorTip === author && titleTip === "Fixture Doc doc00300",
    row ? `clipped: ${row.clipped}, notes tooltip: ${notesTip?.length} chars` : "");
  check("AC-08/AC-24/DR-85: the row is exactly as tall as the metadata lines it renders (122 px base + 18 px per line)",
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
        notesLines: el.querySelectorAll('.notes-line').length,
      };
    })();
  `, { timeout: 15000 });
  // The hover point is at a quarter of the line, not its center: the card's
  // actions pill (four boxes since the Reading toggle, UI-43) covers the
  // line's right half on hover, and the tooltip must open on the visible text.
  const cardAuthorTip = (await tooltipOnHover(".card[data-row-id] .author-line", { xRatio: 0.25 })).tip;
  check("AC-08: the grid card shows the author line and no notes line",
    !!card && card.authorText === author && cardAuthorTip === author && card.notesLines === 0, JSON.stringify(card));

  // AC-83 (UI-03 as modified, DR-183): the card renders no size/date line.
  // The list side of this AC (the row's meta column unchanged) is asserted
  // by flowMetaColumn, which fails when any row lacks its `.meta`.
  const cardContent = await execute(`
    return (() => {
      const el = document.querySelector('.card[data-row-id]');
      if (!el) return null;
      const text = el.textContent;
      return {
        metaNodes: el.querySelectorAll('.meta').length,
        hasUnit: /\\b(B|kB|MB|GB)\\b/.test(text),
        hasSeparator: text.includes("·"),
        hasDateDigits: /\\d{1,4}[./-]\\d{1,2}/.test(text),
      };
    })();
  `);
  check("AC-83: a grid card mounts no .meta node and no size or date text",
    !!cardContent && cardContent.metaNodes === 0 && !cardContent.hasUnit && !cardContent.hasSeparator && !cardContent.hasDateDigits,
    JSON.stringify(cardContent));

  // AC-84 (UI-03 as modified, DR-184): the action ground. The measured
  // values are compared to the tokens as the page resolves them — the same
  // method the ramp flows use — so the check holds in either ramp.
  const slotPaint = () =>
    execute(`
      return (() => {
        const el = document.querySelector('.card[data-row-id]');
        const slot = el?.querySelector('.actions-slot');
        if (!slot) return null;
        const cs = getComputedStyle(slot);
        const toRgb = (v) => {
          const hex = String(v).trim().match(/^#([0-9a-f]{6})$/i);
          if (hex) { const n = parseInt(hex[1], 16); return \`rgb(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255})\`; }
          return String(v).trim();
        };
        const root = getComputedStyle(document.documentElement);
        const shadowTok = String(root.getPropertyValue("--shadow-overlay")).trim();
        const sm = shadowTok.match(/^(\\d+)(?:px)? (\\d+)px (\\d+)px (.+)$/);
        // Colors are compared as the engine serializes them: the token may
        // carry #rrggbbaa or rgba(), the computed style always rgba().
        const normColor = (c) => {
          c = String(c).trim();
          const hex = c.match(/^#([0-9a-f]{6})(?:([0-9a-f]{2}))?$/i);
          if (hex) {
            const n = parseInt(hex[1], 16);
            const rgb = \`\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255}\`;
            const a = hex[2] ? parseInt(hex[2], 16) / 255 : 1;
            return a >= 1 ? \`rgb(\${rgb})\` : \`rgba(\${rgb}, \${a.toFixed(2)})\`;
          }
          const rgba = c.match(/^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)$/);
          if (rgba) {
            const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
            return a >= 1 ? \`rgb(\${rgba[1]}, \${rgba[2]}, \${rgba[3]})\` : \`rgba(\${rgba[1]}, \${rgba[2]}, \${rgba[3]}, \${a.toFixed(2)})\`;
          }
          return c;
        };
        const expectedShadow = sm ? \`\${normColor(sm[4])} \${sm[1]}px \${sm[2]}px \${sm[3]}px 0px\` : null;
        const boxes = Array.from(slot.querySelectorAll('.icon-button, .star')).map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        return {
          ground: cs.backgroundColor,
          wantGround: toRgb(root.getPropertyValue("--surface-0")),
          borderColor: cs.borderTopColor,
          wantBorder: toRgb(root.getPropertyValue("--border-hairline")),
          borderWidth: cs.borderTopWidth,
          boxShadow: cs.boxShadow,
          wantShadow: expectedShadow,
          boxes,
        };
      })();
    `);
  // The border is asserted as the hairline the design states: the hairline
  // color and a border that is actually painted (1 CSS px declared; Chrome
  // snaps it to 1 device px, which reads as 1/DPR in computed styles on a
  // fractional device scale — 0.571 px at 175 %). The shadow is compared to
  // the --shadow-overlay token as the page resolves it. The box count is the
  // current action set: favorite, Reading (UI-43), Details, Delete.
  const groundOk = (p) =>
    !!p && p.ground === p.wantGround && parseFloat(p.borderWidth) >= 0.5 && p.borderColor === p.wantBorder &&
    p.boxShadow === p.wantShadow && p.boxes.length === 4 && p.boxes.every((b) => b.w === 32 && b.h === 32);

  // At rest the slot is empty and carries no ground (the pill appears with
  // the actions line, never as a lone box).
  await parkPointer();
  const rest = await slotPaint();
  check("AC-84: at rest the card's actions slot carries no ground",
    !!rest && rest.ground === "rgba(0, 0, 0, 0)" && rest.borderWidth === "0px" && rest.boxShadow === "none",
    JSON.stringify(rest));

  // On pointer hover: the pill — surface-0 fill, hairline border, overlay
  // shadow — and the untouched 32×32 action boxes.
  const cardPos = await execute(`
    return (() => {
      const r = document.querySelector('.card[data-row-id]').getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })();
  `);
  await hoverPoint(cardPos.x, cardPos.y);
  const hoveredPaint = await slotPaint();
  check("AC-84: on card hover the actions group renders on an opaque ground — the ramp's --surface-0, the hairline border and the overlay shadow — with the 32×32 boxes unchanged",
    groundOk(hoveredPaint), JSON.stringify(hoveredPaint));
  await parkPointer();

  // On keyboard focus the same ground (the same :focus-within rule).
  await execute(`document.querySelector('.card[data-row-id]').focus(); return true;`);
  const focusedPaint = await slotPaint();
  check("AC-84: on card keyboard focus the actions group renders on the same ground",
    groundOk(focusedPaint), JSON.stringify(focusedPaint));
  await execute(`document.activeElement?.blur(); return true;`);

  await setViewMode("list");
  await clearSearch();
}

// FR-13 / AC-09: the order is exactly primary → secondary → id, the secondary
// follows the primary's direction (DR-81), and the choice survives a restart.
// Every fixture PDF is byte-identical in size, so with Size as the primary
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
  await clearTagFilter();
  await browseSelect("All documents");
  await clearSearch();
  await instrumentBoundary();

  await chooseSort({ primary: "Size", dir: "Descending" });
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
    activePrimary.includes("Size") && activePrimary.includes("Descending") &&
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
// The card height the same formula produces (§3.10 as modified by D6 and
// re-derived by DR-245): the inset cover box (the card's inner width minus the
// 5 px content inset on each side), the fixed 70 px text block, and the inset
// top and bottom — `coverHeight(cardWidth) + (389 − 10 − 309) + 2 × 5`.
const expectedCardHeight = (cardWidth) =>
  Math.round(((cardWidth - 12) * 309) / 218) + (389 - 10 - 309) + 10;

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
    // AC-35 re-derived by DR-245: the cover is inset by the card's 1 px border
    // plus the 5 px content inset on top and both sides — measured 5..7 px
    // (the driver's WebView renders a specified 1 px at 0.5714 px under its DPI
    // scaling, DR-122). The bottom inset is the text block below the cover,
    // still inside the card.
    geo.coverInsets.top >= 5 && geo.coverInsets.top <= 7 &&
    geo.coverInsets.right >= 5 && geo.coverInsets.right <= 7 &&
    geo.coverInsets.left >= 5 && geo.coverInsets.left <= 7 &&
    geo.coverInsets.bottom >= 0 &&
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

// FR-02 as modified / AC-17 + AC-13: several tags are active at once and
// the result is exactly their union (the overlap counted once); the set
// composes with a saved search and with the terms as (A OR B) AND mode AND
// terms; an empty set behaves exactly as the shipped single-tag default;
// the active set survives a restart as chips, and a v0.0.1 `cat:<id>` value
// restores as that one tag.
async function flowTagsMulti() {
  const NAME_A = "Union A";
  const NAME_B = "Union B";
  // Self-sufficient (D14): the flow builds its own unfiltered list view and
  // its own tags instead of inheriting either from a previous flow.
  await setupListView(1);
  const A = ["Fixture Doc doc00100", "Fixture Doc doc00101", "Fixture Doc doc00102"];
  const B = ["Fixture Doc doc00200", "Fixture Doc doc00201", "Fixture Doc doc00202", "Fixture Doc doc00100"];
  const titlesOf = (page) => page.rows.map((r) => r.title).sort();
  const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  await instrumentBoundary();
  await ensureTagNames([NAME_A, NAME_B]);

  // Assign: A gets doc00100..doc00102, B gets doc00200..doc00202 and doc00100
  // (the overlap) — through the bulk picker, the shipped UI-04 path.
  await searchFor("doc0010");
  await selectFirstRows(3);
  await applyTagToSelection(NAME_A);
  await clearSelection();
  await clearSearch();
  await searchFor("doc0020");
  await selectFirstRows(3);
  await applyTagToSelection(NAME_B);
  await clearSelection();
  await clearSearch();
  await searchFor("doc00100");
  await selectFirstRows(1);
  await applyTagToSelection(NAME_B);
  await clearSelection();
  await clearSearch();

  // The ids are read from the app's own queries: choosing a tag in Browse
  // makes the app ask for exactly that id, and the boundary capture is where
  // the harness sees it. Tag creation updates the app's list from the
  // command's own answer (no `tags_list` re-query), so no such call is
  // expected or needed here.
  const singleTag = `(s) => s.args.tagIds.length === 1`;
  await setActiveTags([NAME_A]);
  const pageA = await capturedSearch(singleTag);
  const [idA] = pageA.args.tagIds;
  await setActiveTags([NAME_B]);
  const pageB = await capturedSearch(singleTag);
  const [idB] = pageB.args.tagIds;
  await setActiveTags([NAME_A, NAME_B]);
  const pageAB = await capturedSearch(`(s) => ${askedFor([idA, idB])}`);

  const union = [...new Set([...titlesOf(pageA), ...titlesOf(pageB)])];
  check("AC-17: each single tag filter still selects exactly its own set",
    sameSet(titlesOf(pageA), A) && sameSet(titlesOf(pageB), B),
    `A: ${titlesOf(pageA).length} rows, B: ${titlesOf(pageB).length} rows`);
  check("AC-17: two active tags select exactly their union",
    sameSet(titlesOf(pageAB), union), `union: ${titlesOf(pageAB).length} rows, expected: ${union.length}`);
  check("AC-17: a document in both tags is counted once",
    pageAB.total === pageA.total + pageB.total - 1 && pageAB.rows.length === pageAB.total,
    `|A|=${pageA.total} + |B|=${pageB.total} − 1 overlap = ${pageAB.total}`);
  const shownAB = await resultCount();
  check("AC-13: the status count and the rows agree with the union",
    shownAB === pageAB.total, `status: ${shownAB}`);
  const activeNames = await activeTagNames();
  check("AC-13 / UI-09: the active tags appear as exactly one checked item each",
    activeNames.includes(NAME_A) && activeNames.includes(NAME_B) && activeNames.length === 2, JSON.stringify(activeNames));

  const chips = await execute(`
    return document.querySelectorAll('.filter-chips, .chip, .count-chip, [data-chip]').length;
  `);
  check("AC-23: no filter chip renders anywhere while a filter is active", chips === 0, `chip elements: ${chips}`);

  await browseToggleTag(NAME_A);
  const onlyB = await capturedSearch(`(s) => ${askedFor([idB])}`);
  const activeAfter = await activeTagNames();
  check("AC-13 / UI-09: clearing one tag in the Browse menu drops that filter and nothing else",
    sameSet(titlesOf(onlyB), B) && activeAfter.length === 1 && activeAfter[0] === NAME_B, JSON.stringify(activeAfter));

  // Composition with a saved search: Favorites ∩ (A OR B).
  await setActiveTags([NAME_A]);
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
  check("AC-17: the tag set combines with a saved search as (A OR …) AND mode",
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
  await setActiveTags([NAME_A, NAME_B]);
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
  await clearTagFilter();
  const empty = await capturedSearch(`(s) => s.args.tagIds.length === 0`);
  const total = await docCount();
  const shownEmpty = await resultCount();
  check("AC-17: an empty tag set is identical to the shipped unfiltered list",
    empty.total > pageAB.total && shownEmpty === null && (await activeTagNames()).length === 0,
    `total: ${total}`);

  // The active set is a stored preference: after a relaunch the Browse menu
  // shows it as checked items (UI-09 — the only place a filter is displayed).
  await setActiveTags([NAME_A, NAME_B]);
  await capturedSearch(`(s) => ${askedFor([idA, idB])}`);
  await restartApp();
  await instrumentBoundary();
  await requeryAfterRestart("doc001");
  const startupNames = await activeTagNames();
  const restoredUnion = await capturedSearch(`(s) => s.args.query === '' && ${askedFor([idA, idB])}`);
  check("AC-13 / AC-23: the restored last filter is the active filter at startup, displayed in the Browse menu",
    startupNames.includes(NAME_A) && startupNames.includes(NAME_B) && sameSet(titlesOf(restoredUnion), union),
    `checked: ${JSON.stringify(startupNames)}, rows: ${restoredUnion.rows.length}`);

  // A v0.0.1 `cat:<id>` value written by the earlier release restores as that
  // one tag — the upgrade path through the real settings command.
  // The write is awaited at the boundary (D16): the command's answer is the
  // condition, not a pause before the restart.
  await execute(
    `return window.__TAURI_INTERNALS__.invoke('app_set_setting', { key: 'last_filter', value: 'cat:' + arguments[0] });`,
    [String(idA)],
  );
  await restartApp();
  await instrumentBoundary();
  await requeryAfterRestart("doc001");
  const legacyNames = await activeTagNames();
  const legacyPage = await capturedSearch(`(s) => s.args.query === '' && ${askedFor([idA])}`);
  check("AC-17: a v0.0.1 `cat:<id>` setting restores as exactly that one tag",
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

// FR-10 as modified / AC-18: importing while several tags are active
// assigns every imported document to all of them; with none active, nothing.
async function flowImportAssign() {
  const NAME_A = "Union A";
  const NAME_B = "Union B";
  // Self-sufficient (D14): the flow builds its own list view and its own
  // tags (the union flows create the same names; ensure is idempotent).
  await setupListView(1);
  await ensureTagNames([NAME_A, NAME_B]);
  const before = await docCount();
  await instrumentBoundary();
  await setActiveTags([NAME_A, NAME_B]);
  const page = await capturedSearch(`(s) => s.args.tagIds.length === 2`);
  const activeIds = page.args.tagIds.slice().sort((a, b) => a - b);

  const path = join(FIXTURE_SPECIAL, "info-title.pdf"); // not imported by any earlier flow
  const delivered = await emitDrop([path]);
  if (!delivered) {
    skip("AC-18: the drop path itself", "native drag channel is not synthesizable through WebDriver");
    await execute(
      `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: arguments[1] });`,
      [[path], activeIds],
    );
  }
  const imported = await toastContains("Imported 1 PDF");
  const assigned = await capturedSearch(`(s) => s.rows.some((r) => r.title === 'Real Info Title')`);
  const doc = assigned.rows.find((r) => r.title === "Real Info Title");
  check("AC-18: an import with two tags active assigns the document to both",
    !!doc && doc.tags.includes(NAME_A) && doc.tags.includes(NAME_B),
    `tags on the imported row: ${JSON.stringify(doc?.tags ?? null)}, import toast: ${!!imported}`);
  const after = await docCount();
  check("AC-18: the import adds exactly one document to the library", after === before + 1, `${before} → ${after}`);

  await clearTagFilter();
  // The document is found by its own title: in a full library the first page
  // of an unfiltered list would never contain it, so reading it from the list
  // would test the page size, not the assignment.
  await searchFor("Real Info Title");
  const unassigned = await capturedSearch(`(s) => s.args.tagIds.length === 0 && s.args.query === 'Real Info Title'`);
  const still = unassigned.rows.find((r) => r.title === "Real Info Title");
  check("AC-18: the assignment is stored on the document, not on the filter",
    !!still && still.tags.includes(NAME_A) && still.tags.includes(NAME_B), JSON.stringify(still?.tags));
}

// AC-101 (FR-10 MODIFIED, DR-233): the responsive-import half in the real app.
// The Rust half (opening event, chunk bound 25, events outside the connection)
// is the library::service event audit; this flow is the real-app half: the bar
// is visible from the opening event through completion, a search answers while
// the import is in flight, and the completion toast reports the counts as released.
async function flowImportProgress() {
  // Self-sufficient (D14): the flow imports its own batch — 2 000 docs-tier
  // files (doc02001..doc04000). The docs tier is never loaded by the functional
  // suite, so the mid-flight search has a known row count: doc00050 exists in
  // the core tier only. The batch is deliberately large: the search must land
  // while the import is still running, and the status-bar count only changes at
  // completion — reading it below proves the import was in flight at that moment.
  await setupListView(1);
  const batch = tierPdfPaths(FIXTURE_DOCS).slice(2000, 4000);
  const target = batch.length;
  const before = await docCount();

  // Record every render of the bar (label and counts) and every removal. Only
  // samples labelled as the import job enter the claims: the cover queue starts
  // at the import's completion and its bar is a different job.
  await execute(`
    window.__barRead = () => {
      const el = document.querySelector('.progress-wrap');
      if (!el) return { gone: true };
      const m = (el.querySelector('.progress-label')?.textContent || '')
        .match(/([0-9,]+)\\s*\\/\\s*([0-9,]+)/);
      return {
        gone: false,
        label: el.getAttribute('aria-label') || '',
        processed: m ? Number(m[1].replace(/,/g, '')) : null,
        total: m ? Number(m[2].replace(/,/g, '')) : null,
      };
    };
    window.__importBar = { samples: [] };
    const mo = new MutationObserver(() => window.__importBar.samples.push(window.__barRead()));
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.__importBarStop = () => mo.disconnect();
    return true;
  `);

  const delivered = await emitDrop(batch);
  if (!delivered) throw new Error("the synthesized drop could not deliver the 2 000-file batch");

  const opened = await waitForEval(`
    return window.__importBar.samples.some((s) => !s.gone && /Importing/.test(s.label)
      && s.processed === 0 && s.total === arguments[0]) ? true : null;
  `, { timeout: 20000, args: [target] });
  check(
    "AC-101: the status bar's progress bar is present from the opening event — processed 0, total = the candidate count",
    !!opened,
    `first bar samples: ${JSON.stringify(await execute("return window.__importBar.samples.slice(0, 3);")).slice(0, 300)}`,
  );

  // The interaction half: the search is typed while the import is in flight and
  // must answer. The bar still reads the import job, and the status count has
  // not moved — both prove the import was running when the results appeared.
  await searchFor("doc00050");
  const rows = await resultCount();
  const midBar = await execute("return window.__barRead();");
  const midCount = await docCount();
  check(
    "AC-101: a search typed while the import is in flight returns its results",
    rows === 1 && midCount < before + target
      && !!midBar && !midBar.gone && /Importing/.test(midBar.label) && midBar.total === target,
    `search rows: ${rows}, status count at search: ${midCount} (target ${before + target}), bar: ${JSON.stringify(midBar)}`,
  );
  await clearSearch();

  const done = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0];
    return t && Number(t.replace(/[^0-9]/g, '')) === arguments[0] ? true : null;
  `, { timeout: 180000, args: [before + target] });
  const toast = await toastContains(`Imported ${target.toLocaleString("en-US")} PDFs`);
  check(
    "AC-101: the completion toast reports the counts as released",
    !!done && !!toast,
    `library count ${before} → ${await docCount()}`,
  );

  // The progress half: between the first and the last import-job render the bar
  // never disappears, and its counts advance monotonically in steps no larger
  // than the chunk bound. Re-renders of unchanged counts (the search's own row
  // updates) are dropped — they are not progress.
  const run = await execute(`
    window.__importBarStop();
    const out = [];
    for (const s of window.__importBar.samples) {
      if (s.gone) { out.push(s); continue; }
      if (!/Importing/.test(s.label)) continue; // the cover job's bar — a different job
      const prev = out[out.length - 1];
      if (prev && !prev.gone && prev.processed === s.processed) continue;
      out.push(s);
    }
    const first = out.findIndex((s) => !s.gone);
    const last = out.map((s) => !s.gone).lastIndexOf(true);
    return { run: first < 0 || last < 0 ? [] : out.slice(first, last + 1) };
  `);
  const steps = run.run.filter((s) => !s.gone);
  let monotonic = steps.length >= 3;
  for (let i = 1; i < steps.length; i++) {
    monotonic = monotonic
      && steps[i].processed > steps[i - 1].processed
      && steps[i].processed - steps[i - 1].processed <= 5
      && steps[i].total === target;
  }
  check(
    "AC-101/AC-123: the bar advances through per-chunk events from the opening event to completion (each step ≤ 5 — the D25 chunk bound, monotonic), without a gap",
    !!done && steps.length >= 3 && !run.run.some((s) => s.gone) && monotonic
      && steps[0].processed === 0
      && steps[steps.length - 1].processed >= target - 5,
    `import-job samples: ${JSON.stringify(steps).slice(0, 400)}`,
  );
}

// UI-10 / AC-14: the tags manager offers the shipped CRUD unchanged —
// add (covered in flowTags), rename with the duplicate-name inline error,
// and delete with its confirmation and its reassignment behavior.
async function flowTagCrud() {
  const clickRowAction = async (name, label) => {
    const revealed = await execute(`
      const rows = Array.from(document.querySelectorAll('.modal .tag-row'));
      const row = rows.find((r) => r.querySelector('.tag-name')?.textContent.trim() === arguments[0]);
      const opener = row ? row.querySelector('.tag-select') : null;
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
      const rows = Array.from(document.querySelectorAll('.modal .tag-row'));
      const row = rows.find((r) => r.querySelector('.tag-name')?.textContent.trim() === ${JSON.stringify(name)});
      if (!row) return null;
      // Re-focus on every lookup: a status update re-renders the row list and
      // the :focus-within reveal is lost between finding the button and
      // clicking it — a hidden button reports a 0×0 box at the overlay origin.
      row.querySelector('.tag-select')?.focus();
      return Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)}) ?? null;
    }`);
  };

  // Self-sufficient (D14): the flow builds the tags it renames and
  // deletes; the union flows create the same names, ensure is idempotent.
  await ensureTagNames(["Union A", "Union B"]);
  await openTagsManager();

  await clickRowAction("Union A", "Rename tag");

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
    return Array.from(document.querySelectorAll('.modal .tag-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? true : null;
  `, { timeout: 8000 });
  check("AC-14: renaming updates the manager list", !!renamed);

  await clickRowAction("Union A Renamed", "Delete tag");
  const confirm = await waitForEval(`return document.body.textContent.includes('Delete tag “Union A Renamed”') ? true : null;`, { timeout: 5000 });
  check("AC-14: delete asks for confirmation naming the tag", !!confirm);
  await click('//button[normalize-space()="Discard"]', "xpath");
  const kept = await waitForEval(`
    return document.querySelector('.modal') &&
      Array.from(document.querySelectorAll('.modal .tag-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? true : null;
  `, { timeout: 5000 });
  check("AC-14: discarding the confirmation keeps the tag", !!kept);

  // Deleting detaches the tag from its documents and never the documents.
  const beforeTotal = await docCount();
  await clickRowAction("Union A Renamed", "Delete tag");
  await click('//button[normalize-space()="Delete tag"]', "xpath");
  const gone = await waitForEval(`
    return Array.from(document.querySelectorAll('.modal .tag-name')).some((e) => e.textContent.trim() === 'Union A Renamed') ? null : true;
  `, { timeout: 8000 });
  await closeDialog("the tags manager");
  const afterTotal = await docCount();
  const rows = await execute(`return document.querySelectorAll('[data-row-id]').length;`);
  check("AC-14: deleting a tag detaches it from documents and deletes no document",
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
  // the whole library, and the two tag surfaces holding a list long
  // enough to pass their own max-height.
  await ensureTags(30);
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
  const expectedRgb = ramp === "dark" ? "rgb(68, 71, 90)" : "rgb(188, 186, 179)"; // dark: the Dracula Selection token #44475A (§3.6); light: the Alucard BackgroundColorDarker #BCBAB3 (UI-35, DR-182)
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
    !!lightRamp && !!darkRamp && lightRamp.thumb === "#bcbab3" && darkRamp.thumb === "#44475a",
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
  await clickMenuItem('.menu.browse-menu', "Tags");
  await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  await sleep(200);
  const menuSurfaces = await read([
    ["browse menu", ".menu.browse-menu"],
    ["tags submenu", ".menu.browse-sub"],
  ]);
  await keys("Escape");
  await menuClosed('.menu.browse-menu');
  await openTagsManager();
  await sleep(200);
  const dialogSurfaces = await read([["tags manager list", ".tags-dialog"]]);
  await closeDialog("the tags manager");

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
  check("UI-17: the Settings menu carries the theme cycle item, Settings and About",
    items.some((text) => /^Theme: (Light|Dark|Auto)$/.test(text)) &&
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
  // Self-sufficient as a named set (DR-157): this flow reads boundary records
  // and must not depend on an earlier flow having installed the observer.
  await instrumentBoundary();
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

async function tooltipOnHover(selector, { parkFirst = true, xRatio = 0.5 } = {}) {
  // Start from a parked pointer: if a previous flow left the cursor on this
  // very control, a move to the same point fires no pointerenter and the kit
  // never opens the tooltip. From a neutral position every hover is real.
  // `parkFirst: false` keeps the caller's pointer placement — for controls
  // that only render while the pointer already hovers their container (the
  // tag manager's row actions), where parking would hide them again.
  // `xRatio` picks the horizontal landing point on the control: the card's
  // actions pill (four 32 px boxes after UI-43) is absolutely positioned at
  // the card's bottom-right and covers the author line's center on hover,
  // so the card text checks hover left of the pill.
  const measurePos = () => execute(`
    const el = document.querySelector(arguments[0]);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.max(1, Math.min(Math.round(r.x + r.width * arguments[1]), window.innerWidth - 2));
    const y = Math.max(1, Math.min(Math.round(r.y + r.height / 2), window.innerHeight - 2));
    return { x, y };
  `, [selector, xRatio]);
  const moveTo = (pos) => wd("POST", `/session/${sessionId}/actions`, {
    actions: [
      {
        type: "pointer",
        id: "mouse",
        parameters: { pointerType: "mouse" },
        actions: [{ type: "pointerMove", x: pos.x, y: pos.y }],
      },
    ],
  });
  if (parkFirst) await parkPointer();
  // DR-157: measure, move, and confirm the pointer actually landed on the
  // control. If another flow changed the layout between measuring and moving,
  // the first move lands beside the control and no pointerenter ever fires —
  // one verified re-measure covers that.
  let pos = await measurePos();
  if (!pos) return { tip: null, nodes: -1 };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await moveTo(pos);
    const landed = await execute(`
      const el = document.querySelector(arguments[0]);
      const at = document.elementFromPoint(arguments[1], arguments[2]);
      return !!(el && at && el.contains(at));
    `, [selector, pos.x, pos.y]);
    if (landed) break;
    pos = await measurePos();
    if (!pos) return { tip: null, nodes: -1 };
  }
  const tip = await waitForEval(OPEN_TOOLTIP, { timeout: 4000 });
  // Sampled while the pointer is still on the control: whether the kit mounted a
  // tooltip node at all is the difference between "the tooltip never opens" and
  // "it opens but says something else". AC-87 (UI-37) additionally reads the
  // open node's paint — the ramp's overlay ground and the shadow declaration —
  // from the same sample.
  const nodes = await execute(`
    const mounted = document.querySelectorAll('.tooltip');
    const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
    if (!tip) return { nodes: mounted.length, paint: null };
    const toRgb = (v) => {
      const hex = String(v).trim().match(/^#([0-9a-f]{6})$/i);
      if (hex) { const n = parseInt(hex[1], 16); return \`rgb(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255})\`; }
      return String(v).trim();
    };
    const cs = getComputedStyle(tip);
    const root = getComputedStyle(document.documentElement);
    return {
      nodes: mounted.length,
      paint: { bg: cs.backgroundColor, wantBg: toRgb(root.getPropertyValue("--surface-1")), shadow: cs.boxShadow },
    };
  `);
  // D16: dismissal is the condition — the next flow starts from a page with
  // no lingering tooltip node, observed rather than waited out.
  await parkPointer();
  await waitForEval(`return document.querySelectorAll('.tooltip').length === 0 ? true : null;`, { timeout: 3000 });
  return { tip, nodes: nodes.nodes, paint: nodes.paint };
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
  check("AC-21: the trailing control is the import control, named (UI-44: Import PDFs)",
    !!empty && empty.actions.length === 1 && empty.actions[0].label === "Import PDFs", JSON.stringify(empty?.actions));

  // The control is job-gated (UI-14): the import result and the last progress
  // event are not ordered, so the idle state is established here, not assumed.
  await jobIdle();
  await openMenuSure(".search-box .field-action", ".menu.import-menu");
  const items = await execute(`
    return Array.from(document.querySelectorAll('.menu.import-menu .menu-item')).map((e) => ({
      label: e.querySelector('.item-label span')?.textContent?.trim() ?? e.textContent.trim(),
      keys: e.querySelector('.item-keys')?.textContent?.trim() ?? null,
    }));
  `);
  await keys("Escape");
  await menuClosed(".menu.import-menu");
  check("AC-21 / AC-114: the plus opens exactly Import PDFs and Import folder; AC-115: each item names its shortcut",
    items.length === 2 && items[0].label === "Import PDFs" && items[0].keys === "Ctrl+I" &&
      items[1].label === "Import folder" && items[1].keys === "Ctrl+O", JSON.stringify(items));

  await typeInto(".search-input", "doc00");
  const filled = await shape();
  check("AC-21: while the field holds text the clear button occupies that slot",
    !!filled && filled.actions.length === 1 && filled.actions[0].visible && filled.actions[0].label === "Clear search",
    JSON.stringify(filled?.actions));
  await clearSearch();

  // AC-25's rendered half: the placeholder names the scope the user is in, and
  // the accessible name never changes with it.
  const names = await ensureTags(2);
  const ramps = [];
  await browseSelect("Favorites");
  const favorites = await shape();
  ramps.push({ scope: "favorites", placeholder: favorites?.placeholder, name: favorites?.accessibleName });
  // Each scope on its own: Favorites, then a tag with no mode active, then
  // nothing. (Favorites together with a tag is a different, separately
  // worded string — UI-16 — so the mode has to be cleared first.)
  await browseSelect("All documents");
  await setActiveTags([names[0]]);
  const tag = await shape();
  ramps.push({ scope: "tag", placeholder: tag?.placeholder, name: tag?.accessibleName });
  await browseSelect("All documents");
  const all = await shape();
  ramps.push({ scope: "all", placeholder: all?.placeholder, name: all?.accessibleName });
  await clearTagFilter();

  // `formatCount` is `Intl.NumberFormat` on the same value the app formats.
  const total = (await docCount()).toLocaleString("en-US");
  const mismatches = [];
  if (ramps[0].placeholder !== "Search in Favorites") mismatches.push(`favorites scope reads ${JSON.stringify(ramps[0].placeholder)}`);
  if (ramps[1].placeholder !== `Search in ${names[0]}`) mismatches.push(`tag scope (the active tag is ${JSON.stringify(names[0])}) reads ${JSON.stringify(ramps[1].placeholder)}`);
  if (ramps[2].placeholder !== `Search in ${total} documents`) mismatches.push(`all-documents scope (the status bar counts ${total}) reads ${JSON.stringify(ramps[2].placeholder)}`);
  for (const r of ramps) if (r.name !== "Search") mismatches.push(`${r.scope} scope changed the accessible name to ${JSON.stringify(r.name)}`);
  check("AC-25: the placeholder names the current scope while the accessible name stays Search",
    mismatches.length === 0, `${mismatches.join(" | ")} — tags created: ${JSON.stringify(names)}, ramps: ${JSON.stringify(ramps)}`);

  // Both menu items reach their native picker. The dialog itself belongs to the
  // OS; what the app's own boundary shows is the request it makes and the
  // recovery after the picker is dismissed. The observer belongs to this flow
  // (D14/DR-157): reading the boundary without installing it makes the flow
  // pass only when an earlier flow happened to instrument the session.
  await instrumentBoundary();
  const requests = [];
  for (const item of ["Import PDFs", "Import folder"]) {
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

  // AC-91 (UI-15 as modified by DR-210): the count carries its unit label —
  // "N documents" through the plural catalog — in the same tertiary 12 px
  // tabular style as the released bare number.
  const labeled = await execute(`
    const el = document.querySelector('.status-bar .doc-count');
    if (!el) return null;
    const style = getComputedStyle(el);
    const token = getComputedStyle(document.documentElement).getPropertyValue('--text-12').trim();
    return {
      raw: el.textContent.trim(),
      labeled: /^[0-9,]+ documents$/.test(el.textContent.trim()),
      fontSize: style.fontSize,
      tokenSize: token,
      tabular: style.fontVariantNumeric,
    };
  `);
  check("AC-91: the document count is labeled with its unit, same tertiary tabular style",
    labeled?.labeled === true && labeled.tabular === "tabular-nums" && labeled.fontSize === labeled.tokenSize,
    JSON.stringify(labeled));

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

// AC-24 (UI-03 as modified): no checkbox, no tag badges, one actions line
// revealed on hover or keyboard focus, Details carrying the `info` glyph while
// tag actions keep `tag`, and the 122 px row with its 75×106 cover inset
// 8 px from the separator lines (UI-03 as modified by §3.12/DR-189, then
// re-derived by UI-45/DR-278, AC-88 unchanged). The
// "+18 px per metadata line" half is measured in the metadata-display flow,
// which is the flow that puts the lines on a row.
async function flowRowDesign() {
  // The row design is observed on list rows; an earlier flow can have left the
  // app in grid mode or behind a filter — including a tag filter, which
  // narrows the list to the fixture documents that carry author and notes text.
  await clearTagFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  const ready = await waitForEval(`return document.querySelectorAll('.row[data-row-id]').length >= 3 ? true : null;`, { timeout: 20000 });
  if (!ready) throw new Error("no list rows are rendered for the row-design flow");

  // UI-03's measured case is the base row: 122 px, a 75×106 cover, no metadata
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
        ? {
            width: Math.round(cover.getBoundingClientRect().width),
            height: Math.round(cover.getBoundingClientRect().height),
            // AC-88: the cover sits inset from the row box's edges — the
            // separator hairline of the row above at its top, the row's own
            // border-bottom at its bottom.
            topInset: Math.round(cover.getBoundingClientRect().top - bare.getBoundingClientRect().top),
            bottomInset: Math.round(bare.getBoundingClientRect().bottom - cover.getBoundingClientRect().bottom),
          }
        : null,
      checkbox: !!bare.querySelector('[role="checkbox"], input[type="checkbox"]'),
      chips: bare.querySelectorAll('.tag-chip, .chip').length,
      actionsAtRest: actions ? getComputedStyle(actions).display : null,
      labels: buttons.map((b) => b.getAttribute('aria-label')),
      glyphs: buttons.map((b) => Array.from(b.querySelectorAll('svg path')).map((p) => p.getAttribute('d')).join('|')),
    };
  `, [target.id]);
  check("AC-24: a row renders no selection checkbox and no tag badge",
    !!row && !row.checkbox && row.chips === 0, JSON.stringify(row && { checkbox: row.checkbox, chips: row.chips }));
  check("AC-24: a list row measures 122 px with a 75×106 cover (UI-03 as modified by DR-189, re-derived by UI-45/DR-278)",
    !!row && row.height === 122 && row.cover && row.cover.width === 75 && row.cover.height === 106,
    `row ${row?.height} px, cover ${row?.cover?.width}×${row?.cover?.height}`);
  check("AC-88: the cover's top and bottom edges sit 8 px inside the row box — against the separator hairline above and the row's own border-bottom",
    !!row && row.cover && Math.abs(row.cover.topInset - 8) <= 1 && Math.abs(row.cover.bottomInset - 8) <= 1,
    JSON.stringify(row && row.cover));
  check("AC-24: the star, Details, Reading and Delete are one actions line, hidden at rest (the Reading action joins per UI-43)",
    !!row && row.actionsAtRest === "none" && row.labels.length === 4 &&
      row.labels.some((l) => /favorite/i.test(l)) && row.labels.some((l) => l === "Details") &&
      row.labels.some((l) => /reading/i.test(l)) && row.labels.some((l) => l === "Delete"),
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

  // The Tags submenu trigger only exists when the library has tags;
  // the flow makes its own precondition instead of borrowing another flow's
  // leftovers (no-op when earlier flows already left tags behind).
  await ensureTags(2);
  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const tagItems = await execute(`
    const out = [];
    for (const item of document.querySelectorAll('.menu.browse-menu .menu-item')) {
      const label = (item.querySelector('.item-label')?.textContent ?? item.textContent).trim();
      if (!/tag/i.test(label)) continue;
      out.push({ label, glyph: Array.from(item.querySelectorAll('svg path')).map((p) => p.getAttribute('d')).join('|') });
    }
    return out;
  `);
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  // A control renders a glyph when every path that glyph is made of appears in
  // what it renders. A submenu trigger also renders its own indicator, and that
  // is not a different tag glyph.
  const renders = (rendered, required) => required.split("|").every((p) => rendered.split("|").includes(p));
  const scopeItem = tagItems.find((c) => c.label.trim().toLowerCase() === "tags");
  check("AC-24: the tag action keeps the tag glyph",
    !!scopeItem && renders(scopeItem.glyph, tag), JSON.stringify(tagItems));
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

// v0.0.8 (FR-21, AC-107/AC-108): rename a document's file from inside the
// app. Self-sufficient (D14) and lane-safe (DR-163): the flow works on
// private probe copies under tmp/ — a rename moves the file itself, which the
// shared fixture tree must not feel — and it removes both records and the
// probe directory at the end. The subject fixture is special/info-none.pdf
// (no Info dictionary → the title IS the filename fallback, so the row title
// tracks every rename exactly).
async function flowRename() {
  const probeDir = join(root, "tmp", "rename-probe");
  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(probeDir, { recursive: true });
  const subjectPath = join(probeDir, "rename subject.pdf");
  const takenPath = join(probeDir, "rename taken.pdf");
  copyFileSync(join(FIXTURE_SPECIAL, "info-none.pdf"), subjectPath);
  copyFileSync(join(FIXTURE_SPECIAL, "info-none.pdf"), takenPath);

  await setupListView(1);
  const before = await docCount();
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [[subjectPath, takenPath]], // setup through the command the drop handler calls (the relink flow's pattern)
  );
  await searchFor("rename");
  const rows = await execute(`
    return Array.from(document.querySelectorAll('[data-row-id]'))
      .filter((r) => (r.querySelector('.title-line')?.textContent ?? "").includes("rename "))
      .map((r) => ({ id: Number(r.getAttribute('data-row-id')), title: r.querySelector('.title-line').textContent.trim() }));
  `);
  const subject = rows.find((r) => r.title === "rename subject");
  const taken = rows.find((r) => r.title === "rename taken");
  if (!subject || !taken) throw new Error(`the rename probes did not appear as rows: ${JSON.stringify(rows)}`);

  // The dialog (§3.4): opened from the row's context menu, prefilled with the
  // current full name, the folder shown read-only above the field.
  await rightClick(`[data-row-id="${subject.id}"]`);
  await clickMenuItem('.menu', "Rename");
  const TOP_FIELD = '(//input[contains(@class,"field")])[last()]';
  const prefilled = await waitForEval(`
    const field = document.querySelectorAll('.modal .field')[document.querySelectorAll('.modal .field').length - 1];
    const folder = document.querySelector('.modal .folder-line')?.textContent ?? "";
    return field && field.value === 'rename subject.pdf' && folder.includes('rename-probe') ? true : null;
  `, { timeout: 5000 });
  check("AC-107: Rename opens the dialog prefilled with the current name, the folder shown read-only above it", !!prefilled);

  const submitRename = async () => {
    await click('(//div[contains(@class,"modal")]//button[normalize-space()="Rename"])[last()]', "xpath");
  };
  const topFieldState = () =>
    execute(`
      const fields = document.querySelectorAll('.modal .field');
      const field = fields[fields.length - 1];
      if (!field) return null;
      const modal = field.closest('.modal');
      return {
        value: field.value,
        error: modal?.querySelector('.inline-error')?.textContent?.trim() ?? null,
      };
    `);

  // AC-108 half 1: an invalid name (a reserved character) is refused inline;
  // the dialog keeps the field open, nothing changed on disk or in the row.
  await typeInto(TOP_FIELD, "bad<name.pdf", "xpath");
  await submitRename();
  const invalid = await waitForEval(`
    const fields = document.querySelectorAll('.modal .field');
    const field = fields[fields.length - 1];
    const box = field ? field.closest('.modal')?.querySelector('.inline-error') : null;
    return box && /file name/.test(box.textContent) ? true : null;
  `, { timeout: 5000 });
  const invalidState = await topFieldState();
  check(
    "AC-108: an invalid name is refused with the typed inline error and the dialog keeps the field open",
    !!invalid && invalidState?.value === "bad<name.pdf" && !existsSync(join(probeDir, "bad<name.pdf")),
    JSON.stringify(invalidState),
  );

  // AC-108 half 2: a name already taken in the same folder is refused; the
  // file, the record and the other document are untouched.
  await typeInto(TOP_FIELD, "rename taken.pdf", "xpath");
  await submitRename();
  const conflict = await waitForEval(`
    const fields = document.querySelectorAll('.modal .field');
    const field = fields[fields.length - 1];
    const box = field ? field.closest('.modal')?.querySelector('.inline-error') : null;
    return box && /already exists/.test(box.textContent) ? true : null;
  `, { timeout: 5000 });
  const conflictState = await topFieldState();
  check(
    "AC-108: a colliding name is refused with the typed inline error and nothing on disk or in the record changes",
    !!conflict && conflictState?.value === "rename taken.pdf" && existsSync(subjectPath) && !existsSync(join(probeDir, "renamed result.pdf")),
    JSON.stringify(conflictState),
  );
  const stillThere = await waitForEval(
    `return document.querySelector('[data-row-id="${subject.id}"] .title-line')?.textContent?.trim() === 'rename subject' ? true : null;`,
    { timeout: 3000 },
  );
  check("AC-108: the refused rename leaves the row exactly as it was", !!stillThere);

  // AC-107 half 1: a valid rename moves the file on disk and the record with
  // it — the row keeps its identity (the same id) and carries the new name;
  // the old name is gone from disk and from the library. The active search
  // term "rename" is a prefix of every state the subject passes through
  // ("rename subject", "renamed result", "rename final"), so the store's own
  // refresh keeps the row in the query — the prefix-token rule (FR-03) at
  // work, not a re-search.
  await typeInto(TOP_FIELD, "renamed result.pdf", "xpath");
  await submitRename();
  const closedAfterRename = await waitForEval(`return document.querySelector('.modal .folder-line') ? null : true;`, { timeout: 8000 });
  const movedOnDisk = existsSync(join(probeDir, "renamed result.pdf")) && !existsSync(subjectPath);
  const renamedRow = await waitForEval(`
    const row = document.querySelector('[data-row-id="${subject.id}"]');
    const title = row?.querySelector('.title-line')?.textContent?.trim();
    return title === 'renamed result' ? { id: ${subject.id}, title } : null;
  `, { timeout: 15000 });
  check(
    "AC-107: the rename changes the file on disk and the record together — the row keeps its id and shows the new name",
    movedOnDisk && !!renamedRow,
    `row: ${JSON.stringify(renamedRow)}, disk moved: ${movedOnDisk}`,
  );
  await expectNoErrorToast("AC-107: the rename surfaces no failure toast");

  // AC-107 half 2 (DR-267): the Details dialog follows the new name — the
  // rename reached it from the editor's own footer action, and the editor
  // re-reads the renamed row in place: path line and title field both carry
  // the new name, the dialog never closed.
  await rightClick(`[data-row-id="${subject.id}"]`);
  await clickMenuItem('.menu', "Details");
  const detailsPath = await waitForEval(`
    const code = document.querySelector('.modal .path-line code');
    return code && code.textContent.includes('renamed result.pdf') ? true : null;
  `, { timeout: 8000 });
  check("AC-107: the Details editor shows the renamed file's path", !!detailsPath);
  await click('(//div[contains(@class,"modal")]//button[normalize-space()="Rename"])[last()]', "xpath");
  const prefilledAgain = await waitForEval(`
    const fields = document.querySelectorAll('.modal .field');
    const field = fields[fields.length - 1];
    return field && field.value === 'renamed result.pdf' ? true : null;
  `, { timeout: 5000 });
  if (!prefilledAgain) throw new Error("the Details-footer rename did not open its dialog prefilled");
  await typeInto(TOP_FIELD, "rename final.pdf", "xpath");
  await submitRename();
  const followed = await waitForEval(`
    const modals = document.querySelectorAll('.modal');
    if (modals.length !== 1) return null; // the rename dialog closed, the editor stayed open
    const code = modals[0].querySelector('.path-line code');
    const title = modals[0].querySelector('.field');
    return code && code.textContent.includes('rename final.pdf') && title && title.value === 'rename final' ? true : null;
  `, { timeout: 8000 });
  const finalOnDisk = existsSync(join(probeDir, "rename final.pdf")) && !existsSync(join(probeDir, "renamed result.pdf"));
  check(
    "AC-107: a rename from the Details footer keeps the editor open and it follows the new name (path line and title field)",
    !!followed && finalOnDisk,
    `page: ${JSON.stringify(await execute(`return Array.from(document.querySelectorAll('.modal')).length;`))}, disk final: ${finalOnDisk}`,
  );
  await keys("Escape"); // the editor carries no changes — Esc closes it (§5.2)
  const editorClosed = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 8000 });
  if (!editorClosed) throw new Error("the Details editor stayed open after Escape");

  // §3.4: the rename action applies only when the file exists — a missing
  // document carries the relink path instead. The taken probe is made missing
  // (its file removed, then the app's own rescan) and its menu is read.
  rmSync(takenPath, { force: true });
  await execute(`window.__TAURI_INTERNALS__.invoke('library_rescan'); return true;`);
  await searchFor("taken"); // the re-query is what presents the rescan's result
  const flagged = await waitForEval(`
    const row = document.querySelector('[data-row-id="${taken.id}"]');
    return row && row.querySelector('.missing-flag') ? true : null;
  `, { timeout: 30000 });
  if (!flagged) throw new Error("the taken probe never showed as missing");
  await rightClick(`[data-row-id="${taken.id}"]`);
  const missingItems = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    return Array.from(menu.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
  `, { timeout: 5000 });
  check(
    "§3.4: a missing document's menu carries Relink and no Rename",
    Array.isArray(missingItems) && missingItems.includes("Relink") && !missingItems.includes("Rename"),
    JSON.stringify(missingItems),
  );
  await keys("Escape");
  await menuClosed(".menu");

  // D14: the library ends as it started — both records through the app's own
  // delete command, the probe files with them.
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_delete_document', { ids: arguments[0] }); return true;`,
    [[subject.id, taken.id]],
  );
  const restored = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
    { timeout: 15000, args: [before.toLocaleString("en-US")] },
  );
  check("rename flow: both probe records are removed again", !!restored, `library: ${await execute(EVAL.docTotal)}`);
  await clearSearch();
  rmSync(probeDir, { recursive: true, force: true });
}

// AC-32 (D3) and AC-33 (D4): every icon-only control centres its glyph in its
// own box; the row/card actions are one control type — same 32×32 box, centres
// on the row's centre line, the app's own tooltip on hover and on keyboard
// focus — and the star keeps its switch semantics through the real command.
// UI-40 (AC-111): *Open containing folder* — the context-menu item and the
// Details action, present only when the file exists. Self-sufficient (D14):
// the reveal itself changes nothing in the library, so the present-document
// half runs on an ordinary core-fixture row; only the missing-document half
// needs a private probe under tmp/, removed at the end. The file manager's
// window belongs to the OS and is the user's Phase-B observation; what the
// lane asserts is the app's side: the item, the typed request the app posts
// for exactly that document, and the item's absence for a missing file.
async function flowOpenFolder() {
  await setupListView(1);
  await instrumentBoundary();
  await execute(`window.__TAURI_INTERNALS__.__openFolderCalls = 0; return true;`);
  await searchFor("doc00001");
  const subject = await execute(`
    const row = document.querySelector('[data-row-id]');
    return row ? Number(row.getAttribute('data-row-id')) : null;
  `);
  if (!subject) throw new Error("the doc00001 fixture row did not appear");

  // Context menu half: the item is there, and activating it posts exactly one
  // reveal request carrying this document's id.
  await rightClick(`[data-row-id="${subject}"]`);
  const items = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    return Array.from(menu.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
  `, { timeout: 5000 });
  check(
    "AC-111: the context menu carries Open containing folder",
    Array.isArray(items) && items.includes("Open containing folder"),
    JSON.stringify(items),
  );
  await clickMenuItem('.menu', "Open containing folder");
  await menuClosed(".menu");
  const revealed = await waitForEval(`
    const internals = window.__TAURI_INTERNALS__;
    if ((internals.__openFolderCalls ?? 0) < 1) return null;
    return { calls: internals.__openFolderCalls, last: internals.__openFolderLast };
  `, { timeout: 8000 });
  check(
    "AC-111: the item asks the app to reveal exactly this document's file",
    !!revealed && revealed.last && revealed.last.id === subject,
    JSON.stringify(revealed),
  );
  await expectNoErrorToast("AC-111: the reveal surfaces no failure");

  // Details half: the same action in the editor's footer; the editor stays
  // open after it (a reveal is not a mutation).
  await execute(`window.__TAURI_INTERNALS__.__openFolderCalls = 0; return true;`);
  await rightClick(`[data-row-id="${subject}"]`);
  await clickMenuItem('.menu', "Details");
  const footerItem = await waitForEval(`
    const buttons = Array.from(document.querySelectorAll('.modal .dialog-actions .control'));
    return buttons.some((b) => b.textContent.trim() === 'Open containing folder') ? true : null;
  `, { timeout: 8000 });
  check("AC-111: the Details dialog carries Open containing folder", !!footerItem);
  await click('(//div[contains(@class,"modal")]//button[normalize-space()="Open containing folder"])', "xpath");
  const revealedAgain = await waitForEval(`
    const internals = window.__TAURI_INTERNALS__;
    if ((internals.__openFolderCalls ?? 0) < 1) return null;
    const editor = document.querySelector('.modal .dialog-actions');
    return { calls: internals.__openFolderCalls, last: internals.__openFolderLast, editorOpen: !!editor };
  `, { timeout: 8000 });
  check(
    "AC-111: the Details action reveals the same file and the editor stays open",
    !!revealedAgain && revealedAgain.last?.id === subject && revealedAgain.editorOpen,
    JSON.stringify(revealedAgain),
  );
  await keys("Escape");
  const closed = await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 8000 });
  if (!closed) throw new Error("the Details editor stayed open after Escape");
  await clearSearch();

  // The absence half: a missing document shows no reveal item — its path is
  // Relink. Private probe: import, remove the file from disk, rescan.
  const probeDir = join(root, "tmp", "openfolder-probe");
  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(probeDir, { recursive: true });
  const probePath = join(probeDir, "openfolder missing.pdf");
  const beforeProbe = await docCount();
  copyFileSync(join(FIXTURE_SPECIAL, "info-none.pdf"), probePath);
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [[probePath]],
  );
  rmSync(probePath, { force: true });
  await execute(`window.__TAURI_INTERNALS__.invoke('library_rescan'); return true;`);
  await searchFor("openfolder missing");
  const missingId = await waitForEval(`
    const row = Array.from(document.querySelectorAll('[data-row-id]')).find((r) =>
      (r.querySelector('.title-line')?.textContent ?? "").includes("openfolder missing"));
    if (!row || !row.querySelector('.missing-flag')) return null;
    return Number(row.getAttribute('data-row-id'));
  `, { timeout: 30000 });
  if (!missingId) throw new Error("the openfolder probe never showed as missing");
  await rightClick(`[data-row-id="${missingId}"]`);
  const missingItems = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    return Array.from(menu.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
  `, { timeout: 5000 });
  check(
    "AC-111: a missing document's menu shows no Open containing folder",
    Array.isArray(missingItems) && !missingItems.includes("Open containing folder") && missingItems.includes("Relink"),
    JSON.stringify(missingItems),
  );
  await keys("Escape");
  await menuClosed(".menu");

  // D14: the probe record leaves the library again; the file is already gone.
  // The raw command call updates the DB and the counts event, but rows are
  // re-queried only through the store's own paths — so the removal is
  // observed by re-running the app's search: the record is gone when the
  // query that found it now finds nothing.
  // The counts event is the delete-completion barrier: the command answers
  // asynchronously, and a re-query fired before it commits would observe the
  // record still present. Then re-query through the app's own search — with a
  // term the field does not already hold (the SearchBox guard skips a query
  // identical to the active one): the token that found the probe now finds
  // nothing, which is what the removal means.
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_delete_document', { ids: [${missingId}] }); return true;`,
  );
  const countBack = await waitForEval(`
    const text = document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0];
    return text === ${JSON.stringify(beforeProbe.toLocaleString("en-US"))} ? true : null;
  `, { timeout: 20000 });
  if (!countBack) throw new Error("the probe delete never reached the counts");
  await typeInto(".search-input", "openfolder");
  const gone = await waitForEval(
    `return document.querySelector('[data-row-id="${missingId}"]') ? null : true;`,
    { timeout: 15000 },
  );
  check(
    "open-folder flow: the probe record is removed again",
    !!gone,
    JSON.stringify(
      await execute(`
        const row = document.querySelector('[data-row-id="${missingId}"]');
        return {
          rowMounted: !!row,
          rowTitle: row?.querySelector('.title-line')?.textContent?.trim() ?? null,
          searchValue: document.querySelector('.search-input')?.value ?? null,
          rowCount: document.querySelectorAll('[data-row-id]').length,
        };
      `),
    ),
  );
  await clearSearch();
  rmSync(probeDir, { recursive: true, force: true });
}

// UI-41 (AC-112): the bulk bar's ONE favorite control — its label, icon and
// action follow the selection. Self-sufficient (D14): one ordinary fixture
// row, selected through the released Ctrl-click path; the flow ends exactly
// as it started (unfavorited, deselected, unfiltered).
async function flowBulkFavorite() {
  await setupListView(1);
  await searchFor("doc00002");
  const target = await execute(`
    const row = document.querySelector('[data-row-id]');
    return row ? Number(row.getAttribute('data-row-id')) : null;
  `);
  if (!target) throw new Error("the doc00002 fixture row did not appear");
  await clickModifier(target, { ctrlKey: true });
  const bar = await waitForEval(`return document.querySelector('.bulk-bar') ? true : null;`, { timeout: 8000 });
  if (!bar) throw new Error("the bulk bar did not appear for the selection");

  const favoriteControl = () =>
    execute(`
      const buttons = Array.from(document.querySelectorAll('.bulk-bar button.control'));
      const favorites = buttons.filter((b) => /favorites/.test(b.textContent));
      if (favorites.length !== 1) return { count: favorites.length, labels: buttons.map((b) => b.textContent.trim()) };
      const b = favorites[0];
      return {
        count: 1,
        label: b.querySelector('span')?.textContent?.trim() ?? null,
        glyph: b.querySelector('svg')?.getAttribute('fill') ?? null,
      };
    `);

  // A non-favorite selection: the control adds — outline star (fill none),
  // "Add to favorites". Exactly one favorite control, never the old pair.
  const before = await favoriteControl();
  check("AC-112: the bulk bar carries exactly one favorite control", before.count === 1, JSON.stringify(before));
  check(
    "AC-112: a non-favorite selection shows Add to favorites with the outline star",
    before.label === "Add to favorites" && before.glyph === "none",
    JSON.stringify(before),
  );

  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Add to favorites"]]', "xpath");
  const starred = await starStatesReached([target], "true");
  check("AC-112: the control adds the selection to the favorites", starred.every((s) => s.checked === "true"), JSON.stringify(starred));

  // The same selection is now all-favorite: the one control re-derives to
  // remove — filled star (fill currentColor), "Remove from favorites".
  const after = await favoriteControl();
  check(
    "AC-112: an all-favorite selection shows Remove from favorites with the filled star",
    after.count === 1 && after.label === "Remove from favorites" && after.glyph === "currentColor",
    JSON.stringify(after),
  );

  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Remove from favorites"]]', "xpath");
  const unstarred = await starStatesReached([target], "false");
  check("AC-112: the control removes them again", unstarred.every((s) => s.checked === "false"), JSON.stringify(unstarred));
  const restored = await favoriteControl();
  check(
    "AC-112: after the removal the control reads Add to favorites again",
    restored.count === 1 && restored.label === "Add to favorites" && restored.glyph === "none",
    JSON.stringify(restored),
  );

  await clearSelectionIfAny();
  await clearSearch();
}

async function flowActionParity() {
  // Self-sufficient as a named set (DR-157): the star's command write-through
  // is proven at the boundary, so the observer belongs to this flow.
  await instrumentBoundary();
  await clearTagFilter();
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
    // DR-169: re-assert the flow's precondition (row focus reveals the actions
    // line) before aiming the click — a no-op while focus is where this flow
    // left it, and it removes the failure class where the revealed state was
    // transiently lost between the stable aim and the hit test under load.
    await execute(`document.querySelector('[data-row-id="' + arguments[0] + '"]')?.focus(); return true;`, [target]);
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

// The Settings menu (UI-17 as modified by §3.13): one theme action item
// showing the mode in effect; each activation advances the cycle
// Light → Dark → Auto → Light. pickTheme drives that cycle to the wanted
// mode — callers keep their existing vocabulary, "System" names the mode the
// menu labels Auto (the internal value stays `system`).
async function pickTheme(label) {
  const wanted = label === "System" ? "Auto" : label;
  for (let step = 0; step < 3; step++) {
    await openMenuSure(".settings-trigger", ".menu.settings-menu");
    const shown = await execute(`
      const item = document.querySelector('.menu.settings-menu .menu-item .item-label');
      return item ? item.textContent.trim() : null;
    `);
    if (shown === `Theme: ${wanted}`) {
      await keys("Escape");
      await menuClosed(".menu.settings-menu");
      return;
    }
    await clickStable(`() => document.querySelector('.menu.settings-menu .menu-item')`);
    await menuClosed(".menu.settings-menu");
  }
  throw new Error(`the theme cycle did not reach ${wanted} (last item: ${await execute(`return document.querySelector('.menu.settings-menu .menu-item .item-label')?.textContent?.trim() ?? null;`)})`);
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

// The cycle item's expected glyphs (UI-17 as modified, §3.13): the full
// icons.ts path sets — sun for Light, moon for Dark, the auto disc for Auto
// with its half disc rendered filled (FILLED_PATHS).
const THEME_GLYPHS = {
  Light: {
    d: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42"],
    filled: [],
  },
  Dark: { d: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"], filled: [] },
  Auto: {
    d: ["M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 2a10 10 0 0 1 0 20z"],
    filled: [1],
  },
};

// Opens the Settings menu and reads its theme item: the label text and the
// icon's path set. Leaves the menu open — the caller either activates the
// item (one cycle step) or closes it.
async function readThemeItem() {
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  return waitForEval(`
    const el = document.querySelector('.menu.settings-menu .menu-item');
    if (!el) return null;
    const label = el.querySelector('.item-label');
    const svg = label ? label.querySelector('svg') : null;
    if (!label || !svg) return null;
    return {
      text: label.textContent.trim(),
      glyphs: Array.from(svg.querySelectorAll('path')).map((p) => ({
        d: p.getAttribute('d'),
        filled: p.getAttribute('fill') === 'currentColor',
      })),
    };
  `, { timeout: 5000 });
}

const themeItemMatches = (item, mode) => {
  const want = THEME_GLYPHS[mode];
  if (!item || item.text !== `Theme: ${mode}`) return false;
  if (item.glyphs.length !== want.d.length) return false;
  if (item.glyphs.map((g) => g.d).join("\n") !== want.d.join("\n")) return false;
  const filled = item.glyphs.map((g, i) => (g.filled ? i : -1)).filter((i) => i >= 0);
  return JSON.stringify(filled) === JSON.stringify(want.filled);
};

// One cycle step through the real item: the click activates the cycle and
// the menu STAYS open with the item re-rendered for the new mode (DR-209 —
// the kit's closeOnSelect=false on the theme item; AC-89's re-asserted
// clause). The stay-open is asserted here; the item's new content is read
// by the caller's readThemeItem.
async function cycleThemeStep() {
  await clickStable(`() => document.querySelector('.menu.settings-menu .menu-item')`);
  const stillOpen = await waitForEval(
    `return document.querySelector('.menu.settings-menu .menu-item') ? true : null;`,
    { timeout: 5000 },
  );
  check("AC-89: activating the theme item keeps the Settings menu open (DR-209)", stillOpen === true);
  if (!stillOpen) throw new Error("the Settings menu closed on a theme activation — the cycle cannot continue");
}

// AC-116 (D20): the browser context menu is suppressed everywhere — the guard
// at each window's root (ui/src/lib/contextmenu.ts) prevents every
// contextmenu event nothing has already prevented. The harness dispatches a
// real cancelable event at the named surfaces; the window-level guard runs on
// the bubble path, so its prevent is observable as defaultPrevented. The
// app's own menus are the counter-example: the kit's trigger prevents its own
// event and the guard respects it — a real right-click on a row still mounts
// the app menu (the menu's behavior is flowContextMenu's claim; here the
// claim is that the guard does not swallow it). The AC's copy/paste half is
// keyboard behavior, verified in the Phase B real-app check.
async function flowContextMenuSuppression() {
  await setupListView(3);
  const librarySurfaces = await execute(`
    const surfaces = {
      "toolbar": ".toolbar",
      "status bar": ".status-bar",
      "document area": ".document-area",
      "search field": ".search-input",
      "browse trigger": ".browse-trigger",
    };
    const out = {};
    for (const [name, selector] of Object.entries(surfaces)) {
      const el = document.querySelector(selector);
      if (!el) { out[name] = "not mounted"; continue; }
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      out[name] = event.defaultPrevented === true;
    }
    return out;
  `);
  check("AC-116: the library window prevents the browser menu at the toolbar, status bar, document area, search field and browse trigger",
    Object.values(librarySurfaces).every((v) => v === true), JSON.stringify(librarySurfaces));

  // The bulk bar exists only while a selection is active — the guard covers
  // it too.
  await selectFirstRows(2);
  const bulk = await execute(`
    const bar = document.querySelector('.bulk-bar');
    if (!bar) return "not mounted";
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    bar.dispatchEvent(event);
    return event.defaultPrevented === true;
  `);
  check("AC-116: the bulk bar is prevented as well", bulk === true, String(bulk));
  await clearSelection();

  // The app's own row menu survives the guard: a real right-click mounts it.
  await rightClick("[data-row-id]");
  const opened = await waitForEval(
    `return document.querySelector('.menu .menu-item') ? true : null;`,
    { timeout: 5000 },
  );
  check("AC-116: the app's own row context menu still opens — the guard respects already-prevented events",
    opened === true);
  await keys("Escape");
  await waitForEval(`return !document.querySelector('.menu .menu-item') ? true : null;`, { timeout: 5000 });
  // The reader-window half of the claim runs in the reader runtime, where the
  // reader windows are reachable: flowReaderContextMenu (READER_SEQUENCE).
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

  // AC-89 (UI-17 as modified, §3.13): the menu carries one theme action
  // item; its label and icon show the mode in effect, and each activation
  // advances the cycle Light → Dark → Auto → Light with the ramp switching
  // at the step (AC-28's measurement method, re-asserted through the steps).
  const itemLight = await readThemeItem();
  check("AC-89: the Settings menu carries one theme action item labeled with the mode in effect, with its icon",
    themeItemMatches(itemLight, "Light"), JSON.stringify(itemLight));
  await cycleThemeStep();
  const dark = await currentRamp();
  check("AC-28: choosing Dark switches it to the dark ramp",
    dark.attr === "dark" && dark.surface === ramps.dark && dark.scheme === "dark",
    `data-theme: ${dark.attr}, --surface-0: ${dark.surface}`);
  check("AC-43: the running app resolves --accent to the corrected dark value",
    dark.accent === ramps.accentDark, `app: ${dark.accent}, tokens: ${ramps.accentDark}`);
  const itemDark = await readThemeItem();
  check("AC-89: the item's icon and label track the current mode",
    themeItemMatches(itemDark, "Dark"), JSON.stringify(itemDark));
  await cycleThemeStep();
  const itemAuto = await readThemeItem();
  check("AC-89: the Auto step renders the half-filled auto glyph and the Auto name",
    themeItemMatches(itemAuto, "Auto"), JSON.stringify(itemAuto));
  const auto = await currentRamp();
  check("AC-89: the ramp switches at each cycle step — Auto resolves to the operating system's ramp",
    auto.attr === auto.os && (auto.os === "dark" ? auto.surface === ramps.dark : auto.surface === ramps.light),
    `data-theme: ${auto.attr}, --surface-0: ${auto.surface}, OS ramp: ${auto.os}`);
  await cycleThemeStep();
  const closedCycle = await currentRamp();
  check("AC-89: the cycle closes back to Light",
    closedCycle.attr === "light" && closedCycle.surface === ramps.light,
    `data-theme: ${closedCycle.attr}, --surface-0: ${closedCycle.surface}`);

  // AC-99 (UI-17 further MODIFIED, DR-230): an already-open reader window
  // re-applies the ramp live. The reader window is opened from the library
  // window's own grid by the real double-click on a core-tier card, and it
  // is read through its own CDP session (the functional instance carries the
  // lane's debug port, startDriver). The cycle is driven from this window's
  // Settings menu; the claim is the reader window's rendered ramp moving
  // with it — same window, no close, no reload — and a full cycle returning
  // it to the original.
  await keys("Escape");
  await menuClosed(".menu.settings-menu");
  const port99 = await functionalCdpPort();
  if (!port99) throw new Error("the functional instance's DevTools port was not discoverable");
  const doc99 = await waitForEval(`
    const c = document.querySelector('.card[aria-label="Fixture Doc doc00001"]');
    if (!c) return null;
    c.scrollIntoView({ block: 'center' });
    return c.getAttribute('data-row-id');
  `, { timeout: 15000 });
  if (!doc99) throw new Error("the AC-99 flow needs the doc00001 card (core tier)");
  await doubleClickStable(`() => document.querySelector('[data-row-id="${doc99}"]')`);
  let opened99 = await cWaitReaderId(Number(doc99), true, { timeout: 15000, port: port99 });
  if (!opened99) {
    // The flowOpen precedent: msedgedriver's action chain sometimes produces
    // no native dblclick — the synthetic event reaches the same handler.
    await execute(`
      document.querySelector('[data-row-id="' + arguments[0] + '"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    `, [doc99]);
    opened99 = await cWaitReaderId(Number(doc99), true, { timeout: 15000, port: port99 });
  }
  if (!opened99) throw new Error("no reader window appeared for the AC-99 document");
  const reader99 = await cReaderConnected(Number(doc99), { port: port99 });
  await reader99.waitFor(FIRST_PAGE_READY, { timeout: 12000 });

  // The reader window's own ramp read: same probe as `currentRamp`, run in
  // that window's document. `rampReached` polls until the window carries the
  // wanted state — the settings write is debounced 300 ms, so the event
  // arrives shortly after the activation, not on the click.
  const readerRamp = `
    const root = document.documentElement;
    const probe = document.createElement('div');
    probe.style.color = 'var(--surface-0)';
    document.body.appendChild(probe);
    const surface = getComputedStyle(probe).color;
    probe.remove();
    return {
      attr: root.dataset.theme ?? null,
      surface,
      os: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    };
  `;
  const rampReached = async (want) => {
    const deadline = Date.now() + 10000;
    for (;;) {
      let got = null;
      try { got = await reader99.evaluate(readerRamp); } catch { /* context swap (DR-156) */ }
      if (got && got.attr === want.attr && got.surface === want.surface) return got;
      if (Date.now() > deadline) return got;
      await sleep(150);
    }
  };

  const started99 = await rampReached({ attr: "light", surface: ramps.light });
  check("AC-99: the reader window stands on the ramp that was in effect when it opened",
    started99.attr === "light" && started99.surface === ramps.light, JSON.stringify(started99));

  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await cycleThemeStep(); // Light → Dark
  const dark99 = await rampReached({ attr: "dark", surface: ramps.dark });
  check("AC-99: a theme cycle from the library window changes the already-open reader window's rendered ramp, without closing or reloading it",
    dark99.attr === "dark" && dark99.surface === ramps.dark, JSON.stringify(dark99));
  const item99 = await readThemeItem();
  check("AC-99: the library window's own controls keep tracking the cycle (AC-89 unchanged)",
    themeItemMatches(item99, "Dark"), JSON.stringify(item99));

  await cycleThemeStep(); // Dark → Auto
  const auto99 = await rampReached({
    attr: started99.os,
    surface: started99.os === "dark" ? ramps.dark : ramps.light,
  });
  check("AC-99: the Auto step resolves in the reader window exactly as in the library window — the OS ramp",
    auto99.attr === auto99.os && (auto99.os === "dark" ? auto99.surface === ramps.dark : auto99.surface === ramps.light),
    JSON.stringify(auto99));

  await cycleThemeStep(); // Auto → Light: the full cycle
  const back99 = await rampReached({ attr: "light", surface: ramps.light });
  check("AC-99: a full cycle returns the already-open reader window to its original ramp",
    back99.attr === "light" && back99.surface === ramps.light, JSON.stringify(back99));
  await keys("Escape");
  await menuClosed(".menu.settings-menu");

  // The dialog half: the picker is the same choke point — its choice
  // propagates too, and re-picking Light restores both windows (the state
  // the persistence step below starts from).
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickMenuItem('.menu.settings-menu', "Settings");
  await waitForEval(`
    const dialog = document.querySelector('.modal');
    return dialog && dialog.textContent.includes('Appearance') ? true : null;
  `, { timeout: 8000 });
  await clickStable(`() => {
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'Theme');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).find((b) => b.textContent.trim() === 'Dark') ?? null;
  }`);
  await closeDialog("the settings dialog");
  const dialog99 = await rampReached({ attr: "dark", surface: ramps.dark });
  check("AC-99: a dialog picker choice propagates to the already-open reader window as the cycle does",
    dialog99.attr === "dark" && dialog99.surface === ramps.dark, JSON.stringify(dialog99));
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickMenuItem('.menu.settings-menu', "Settings");
  await waitForEval(`
    const dialog = document.querySelector('.modal');
    return dialog && dialog.textContent.includes('Appearance') ? true : null;
  `, { timeout: 8000 });
  await clickStable(`() => {
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'Theme');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).find((b) => b.textContent.trim() === 'Light') ?? null;
  }`);
  await closeDialog("the settings dialog");
  const restored99 = await rampReached({ attr: "light", surface: ramps.light });
  check("AC-99: re-picking Light restores the already-open reader window too",
    restored99.attr === "light" && restored99.surface === ramps.light, JSON.stringify(restored99));

  // Cleanup: close the reader window through the app's own Escape path
  // (flowReaderOpen's close gesture) so the rest of the flow — and the
  // restart below — runs against the library window only.
  await reader99.key("Escape", "Escape", 27);
  const closed99 = await cWaitReaderId(Number(doc99), false, { timeout: 8000, port: port99 });
  check("AC-99: the reader window closes cleanly (the flow's own setup)", !!closed99);

  // Persistence (AC-89, re-asserting AC-28's stored-setting claim): one
  // step to Dark, then a restart — the app applies the stored mode again.
  if (!(await readThemeItem())) throw new Error("the theme item is not readable before the persistence step");
  await cycleThemeStep(); // Light → Dark
  await restartApp();
  await instrumentBoundary();
  const afterRestart = await currentRamp();
  check("AC-28: the chosen ramp is applied again after a restart",
    afterRestart.attr === "dark" && afterRestart.surface === ramps.dark,
    `data-theme: ${afterRestart.attr}, --surface-0: ${afterRestart.surface}`);

  // AC-28's unchanged half: the Auto mode — the menu's name for the
  // follow-OS state, pickTheme's "System" — resolves to the OS ramp.
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
    return dialog && dialog.textContent.includes('Appearance') && dialog.textContent.includes('Data location') ? true : null;
  `, { timeout: 8000 });
  check("AC-90: Settings opens the dialog with its Appearance and Data location sections", !!opened);

  // AC-90: the Library section is gone — no heading, no counts, no name or
  // version rows anywhere in the dialog (the facts live in the status bar
  // and the About dialog now).
  const dialogFacts = await execute(`
    const dialog = document.querySelector('.modal');
    if (!dialog) return null;
    const titles = Array.from(dialog.querySelectorAll('.section-title')).map((h) => h.textContent.trim());
    const stray = ["Library", "Documents", "Favorites", "Missing documents", "Version", "Application"]
      .filter((needle) => Array.from(dialog.querySelectorAll('.section-title, dt, .setting-label'))
        .some((el) => el.textContent.trim() === needle));
    return { titles, stray, infoRows: dialog.querySelectorAll('.info-row').length };
  `);
  check("AC-90: the dialog renders no Library section and no counts, name or version rows",
    !!dialogFacts && dialogFacts.titles.join("|") === "Appearance|Data location" &&
      dialogFacts.stray.length === 0 && dialogFacts.infoRows === 0,
    JSON.stringify(dialogFacts));
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

  // AC-89 (dialog sync): the picker shows the value the menu cycle holds —
  // the same store, not a copy. The mode here is Auto (the System step above).
  const themeGroup = await execute(`
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'Theme');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).map((b) => ({
      label: b.textContent.trim(), checked: b.getAttribute('aria-checked') === 'true',
    }));
  `);
  check("AC-89: the dialog's theme picker shows the same value the menu cycle holds",
    !!themeGroup && themeGroup.some((r) => r.label === "Auto" && r.checked) &&
      themeGroup.filter((r) => r.checked).length === 1,
    JSON.stringify(themeGroup));

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

  // AC-90 on AC-41's method: the Data location row shows the directory the
  // app itself writes to — the value comes from the app's own
  // `app_data_dir` round-trip, the harness compares it with the directory it
  // drives the app with (the same APPDATA path, separators and trailing
  // slashes normalized away) and with what is on disk there: library.db and
  // covers/ live in it.
  const locationText = await execute(`
    return document.querySelector('.modal .location-row .location')?.textContent.trim() ?? null;
  `);
  const normPath = (p) => String(p ?? "").replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  const onDisk = existsSync(join(DATA_DIR, "library.db")) && existsSync(join(DATA_DIR, "covers"));
  check("AC-90: the Data location row shows the library location, asserted the AC-41 way",
    typeof locationText === "string" && locationText.length > 0 && normPath(locationText) === normPath(DATA_DIR) && onDisk,
    `dialog: ${JSON.stringify(locationText)} | harness data dir: ${DATA_DIR} | library.db + covers/ present: ${onDisk}`);
  const selectable = await execute(`
    const el = document.querySelector('.modal .location-row .location');
    return el ? getComputedStyle(el).userSelect : null;
  `);
  check("UI-21: the location value is selectable text", selectable === "all", `user-select: ${selectable}`);

  // AC-90 (the AC-33 control grammar + UI-37's tooltip method): the open
  // control is a 32×32 icon button whose tooltip is the app's own — text
  // equal to its accessible name, on the ramp's overlay ground, no native title.
  const openBox = await execute(`
    const el = document.querySelector('.modal .location-row .control.icon-button');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), title: el.getAttribute('title'), aria: el.getAttribute('aria-label') };
  `);
  const openTip = await tooltipOnHover('.modal .location-row .control.icon-button');
  check("AC-90: the open control is a 32×32 button carrying the app's own tooltip on the overlay ground",
    !!openBox && Math.abs(openBox.w - 32) <= 1 && Math.abs(openBox.h - 32) <= 1 &&
      openBox.title === null && openBox.aria === "Open location" &&
      openTip.tip === "Open location" && !!openTip.paint && openTip.paint.bg === openTip.paint.wantBg && openTip.paint.shadow !== "none",
    `box: ${JSON.stringify(openBox)} tip: ${JSON.stringify(openTip.tip ?? null)} paint: ${JSON.stringify(openTip.paint ?? null)}`);

  // AC-94 (UI-37 as modified by DR-212/DR-213/DR-216): the tooltip never
  // contributes to the scroll overflow of the surface it annotates. The Data
  // location row is the last control of the dialog's scrolling sections — the
  // shipped defect was a scrollbar summoned by its tooltip. With the tooltip
  // open (keyboard focus opens it exactly like hover, R4.4), the modal panel's
  // scroll extent must equal its visible height, and the kit's positioned
  // wrapper must be fixed against the viewport — not captured by the dialog
  // (the kit's `contain: layout style` on the content made the modal the
  // wrapper's containing block; `base.css` overrides it, DR-216).
  const overflow = await execute(`
    const modal = document.querySelector('.modal');
    if (!modal) return null;
    const before = { sh: modal.scrollHeight, ch: modal.clientHeight };
    const el = modal.querySelector('.location-row .control.icon-button');
    if (!el) return null;
    const rectBefore = el.getBoundingClientRect();
    el.focus();
    return new Promise((resolve) => setTimeout(() => {
      const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
      const rectAfter = el.getBoundingClientRect();
      const wrapper = tip ? tip.parentElement : null;
      resolve({
        before,
        after: { sh: modal.scrollHeight, ch: modal.clientHeight },
        tipOpen: !!tip,
        // The kit positions a wrapper div around the content — that wrapper
        // is the positioned node; the content itself stays static inside it.
        wrapperPos: wrapper ? getComputedStyle(wrapper).position : null,
        tipBox: tip ? (() => { const r = tip.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; })() : null,
        modalTop: Math.round(modal.getBoundingClientRect().top),
        modalBottom: Math.round(modal.getBoundingClientRect().bottom),
        controlGrew: Math.round(rectAfter.height - rectBefore.height),
      });
    }, 600));
  `);
  check("AC-94: with the open-control tooltip shown the settings dialog panel does not scroll (no overflow contribution, the kit's positioned wrapper is fixed)",
    !!overflow && overflow.tipOpen === true && overflow.wrapperPos === "fixed" &&
      overflow.after.sh === overflow.after.ch && overflow.after.sh === overflow.before.sh &&
      overflow.controlGrew === 0,
    JSON.stringify(overflow));
  await execute(`document.activeElement?.blur(); return true;`);

  // AC-90 (AC-68's command-boundary method): the activation reaches
  // app_open_data_dir exactly once and surfaces no failure.
  await resetOpenCounter();
  await clickStable(`() => {
    const el = document.querySelector('.modal .location-row .control.icon-button');
    return el && !el.disabled ? el : null;
  }`);
  const openedOnce = await waitForEval(`
    const c = window.__TAURI_INTERNALS__.__openDataDirCalls ?? 0;
    return c >= 1 ? c : null;
  `, { timeout: 8000 });
  const boundaryFacts = await execute(`
    return {
      calls: window.__TAURI_INTERNALS__.__openDataDirCalls ?? 0,
      seen: (window.__TAURI_INTERNALS__.__smokeSeen ?? []).filter((n) => n === 'app_open_data_dir' || n.startsWith('unhandled') || n.startsWith('page-error')),
      toasts: document.querySelectorAll('.toast-stack .toast').length,
    };
  `);
  check("AC-90: the open control calls app_open_data_dir exactly once with no failure surfaced",
    !!openedOnce && boundaryFacts.calls === 1 && boundaryFacts.seen.length === 1 && boundaryFacts.toasts === 0,
    JSON.stringify(boundaryFacts));

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
  // AC-89's live half: the same for the theme — a change made in the dialog
  // is live in the menu item, no reload, no second store.
  await clickStable(`() => {
    const group = Array.from(document.querySelectorAll('.modal [role="radiogroup"]')).find((g) => g.getAttribute('aria-label') === 'Theme');
    if (!group) return null;
    return Array.from(group.querySelectorAll('[role="radio"]')).find((b) => b.textContent.trim() === 'Light') ?? null;
  }`);
  await closeDialog("the settings dialog");
  const itemLive = await readThemeItem();
  await keys("Escape");
  await menuClosed(".menu.settings-menu");
  check("AC-89: a theme change made in the dialog is live in the menu item without a reload",
    themeItemMatches(itemLive, "Light"), JSON.stringify(itemLive));
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

  // AC-90's last clause: the facts that left the dialog are unchanged where
  // they live — the status bar's counts and the About dialog's name/version.
  const barCount = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] ?? null;`);
  check("AC-90: the status bar's counts are unchanged",
    barCount === browse["All documents"], `status bar: ${JSON.stringify(barCount)}, browse: ${JSON.stringify(browse["All documents"])}`);
  await openMenuSure(".settings-trigger", ".menu.settings-menu");
  await clickMenuItem('.menu.settings-menu', "About PDF Keeper");
  const aboutShown = await waitForEval(`
    const dialog = document.querySelector('.modal');
    return dialog && dialog.textContent.includes('About PDF Keeper') ? true : null;
  `, { timeout: 8000 });
  const aboutText = await execute(`return document.querySelector('.modal')?.textContent ?? null;`);
  check("AC-90: the About dialog is unchanged — it still shows the name and version the app reports",
    !!aboutShown && !!about && !!aboutText && aboutText.includes(about.name) && aboutText.includes(about.version),
    `about: ${JSON.stringify(about)}`);
  await keys("Escape");
  await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });
}

// AC-30 (UI-18): the two modes and the selection semantics of each, in list and
// in grid. The mode itself is session state: it is off after a restart.
async function flowSelectMode() {
  // Self-sufficient as a named set (DR-157): the activation counts below are
  // boundary records, and the rows are the flow's own — the setup waits for
  // them instead of assuming an earlier flow finished importing.
  await instrumentBoundary();
  await setupListView(3);

  const off = await execute(`return document.querySelector('.select-toggle')?.getAttribute('aria-pressed') ?? null;`);
  check("AC-30: Select mode is off at startup", off === "false", `aria-pressed: ${off}`);

  const ids = await execute(`
    return Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 3).map((el) => el.getAttribute('data-row-id'));
  `);

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

  // Off: activation is the v0.0.6 path — a real double click reaches the
  // reader command and never the OS path (UI-31, AC-64/AC-68).
  await resetOpenCounter();
  await doubleClickStable(`() => document.querySelector('[data-row-id="${ids[0]}"]')`);
  const opened = await waitForEval(`
    const internals = window.__TAURI_INTERNALS__;
    if ((internals.__readerOpenCalls ?? 0) < 1) return null;
    return { reader: internals.__readerOpenCalls, open: internals.__openCalls };
  `, { timeout: 8000 });
  check("AC-30 (off): double-click activates through the reader command, not the OS path",
    !!opened && opened.reader === 1 && opened.open === 0, JSON.stringify(opened));
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
export const timings = [];
export async function runFlow(name, fn) {
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
// AC-86 (UI-19 as modified, §3.10): the vertical inset geometry, measured the
// AC-39 way — against the chrome edges. The wait conditions double as settle
// conditions: an out-of-range reading (a stale window) retries until the
// windowing has repainted for the requested scroll position.
async function verticalInsetPositions(nodeSel) {
  const atTop = await waitForEval(`
    const s = document.querySelector('.scroller');
    s.scrollTop = 0;
    if (s.scrollTop !== 0) return null;
    const first = document.querySelector(${JSON.stringify(nodeSel)});
    if (!first) return null;
    const tb = document.querySelector('.toolbar').getBoundingClientRect();
    const gap = first.getBoundingClientRect().top - tb.bottom;
    return gap > 4 && gap < 40 ? { gap } : null;
  `, { timeout: 10000 });
  const mid = await waitForEval(`
    const s = document.querySelector('.scroller');
    s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(nodeSel)}));
    if (nodes.length < 2) return null;
    const sRect = s.getBoundingClientRect();
    let top = Infinity;
    for (const n of nodes) top = Math.min(top, n.getBoundingClientRect().top);
    // No gap band: the mounted content covers the viewport top.
    return top <= sRect.top + 1 ? { topEdge: top - sRect.top } : null;
  `, { timeout: 10000 });
  const atEnd = await waitForEval(`
    const s = document.querySelector('.scroller');
    s.scrollTop = s.scrollHeight;
    if (s.scrollTop + s.clientHeight < s.scrollHeight - 1) return null; // not at max yet
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(nodeSel)}));
    if (nodes.length < 2) return null;
    const sb = document.querySelector('.status-bar').getBoundingClientRect().top;
    let bottom = -Infinity;
    for (const n of nodes) bottom = Math.max(bottom, n.getBoundingClientRect().bottom);
    const gap = sb - bottom;
    // Settle window: the mounted content must reach the viewport bottom
    // (a stale window reads far above it). The AC value itself is asserted
    // by the check, not by this gate.
    return gap > -40 && gap < 40 ? { gap } : null;
  `, { timeout: 10000 });
  await execute(`document.querySelector('.scroller').scrollTop = 0; return true;`);
  return { atTop, mid, atEnd };
}

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

  // AC-86 (grid half): the vertical inset at the three scroll positions.
  const gv = await verticalInsetPositions(".block .card[data-row-id]");
  check("AC-86 (grid): at the top of the scroll the first card's top edge measures 12 px below the toolbar's bottom edge",
    !!gv.atTop && Math.abs(gv.atTop.gap - 12) <= 1, JSON.stringify(gv.atTop));
  check("AC-86 (grid): at a mid-scroll position cards render continuously with no gap band at the viewport top",
    !!gv.mid && gv.mid.topEdge <= 1, JSON.stringify(gv.mid));
  check("AC-86 (grid): at the end of the scroll the last card's bottom edge measures 12 px above the status bar's top edge",
    !!gv.atEnd && Math.abs(gv.atEnd.gap - 12) <= 1, JSON.stringify(gv.atEnd));

  await setViewMode("list");
  await waitForEval(`return document.querySelectorAll('[data-row-id]').length > 0 ? true : null;`, { timeout: 15000 });

  // AC-86 (list half): the same three positions, same numbers.
  const lv = await verticalInsetPositions(".row[data-row-id]");
  check("AC-86 (list): at the top of the scroll the first row's top edge measures 12 px below the toolbar's bottom edge",
    !!lv.atTop && Math.abs(lv.atTop.gap - 12) <= 1, JSON.stringify(lv.atTop));
  check("AC-86 (list): at a mid-scroll position rows render continuously with no gap band at the viewport top",
    !!lv.mid && lv.mid.topEdge <= 1, JSON.stringify(lv.mid));
  check("AC-86 (list): at the end of the scroll the last row's bottom edge measures 12 px above the status bar's top edge",
    !!lv.atEnd && Math.abs(lv.atEnd.gap - 12) <= 1, JSON.stringify(lv.atEnd));
}

// AC-35 (D6) + AC-39 (UI-19), the real-app halves at the window widths the ACs
// name that no other flow measures: 900 and 1900 px (1280 px is measured by
// flowViewColumns and flowContentGutter). In grid at Auto and at every manual
// count 2–10 — including the counts a narrow window clamps — the cards are the
// derived layout, the cover sits inside the card on all four sides, the border
// is drawn once, the gutter holds and nothing scrolls sideways; in list the
// rows carry the same gutter. Mounted nodes stay bounded at 10 000 documents.
// Scale flow (exported for scripts/ui-10k.mjs — DR-161): it runs against the
// corpus that suite's measured import loads.
export async function flowWidthMatrix() {
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
  const beforeText = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] ?? null;`);
  const before = Number(String(beforeText).replace(/,/g, ""));
  if (!Number.isFinite(before) || before === 0) throw new Error(`the meta-column flow needs a populated library, count: ${beforeText}`);

  // The flow's own boundary instrumentation: the import is awaited at the
  // boundary (D16) and the sort state below is verified at the same one.
  await instrumentBoundary();
  await execute(
    `return window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] });`,
    [[join(FIXTURE_SPECIAL, "info-title.pdf")]],
  );
  const imported = await waitForEval(`
    const t = document.querySelector('.status-bar .doc-count');
    return t?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;
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

  // AC-85 (UI-36, §3.9 as revised by DR-208): every rendered size cell is
  // the unit-by-magnitude rendering of the byte size the manifest records —
  // bytes below 1 000, kilobytes up to the 1 000 kB rounding point,
  // megabytes from there — the reference-formatter pattern format.test.ts
  // uses, applied to the values the app actually paints. The fixture corpus
  // is sub-5 kB, so these rows exercise the kilobyte band.
  const sizeCells = await waitForEval(`
    const rows = Array.from(document.querySelectorAll('[data-row-id]')).slice(0, 12);
    if (rows.length < 5) return null;
    return rows.map((row) => ({
      name: row.querySelector('.filename')?.textContent.trim() ?? null,
      size: row.querySelector('.meta .size')?.textContent.trim() ?? null,
    }));
  `, { timeout: 15000 });
  const unitRef = (unit, maxDigits) =>
    new Intl.NumberFormat(undefined, {
      style: "unit",
      unit,
      unitDisplay: "short",
      ...(maxDigits === undefined
        ? {}
        : { minimumFractionDigits: 0, maximumFractionDigits: maxDigits }),
    });
  const expectedSize = (n) => {
    if (n < 1_000) return unitRef("byte").format(n); // "512 B", "0 B"
    if (n < 999_950) return unitRef("kilobyte", 1).format(n / 1_000); // "2 kB", "12.5 kB"
    const mb = n / 1_000_000;
    return unitRef("megabyte", mb < 100 ? 1 : 0).format(mb); // "1 MB", "2.4 MB", "125 MB"
  };
  const manifestByName = new Map(coreManifest().docs.map((d) => [d.name, d]));
  const importedSize = statSync(join(FIXTURE_SPECIAL, "info-title.pdf")).size;
  const mismatches = [];
  let asserted = 0;
  for (const cell of sizeCells ?? []) {
    const doc = manifestByName.get(cell.name);
    const expected = doc
      ? expectedSize(doc.size)
      : cell.name === "info-title.pdf"
        ? expectedSize(importedSize)
        : null;
    if (expected === null) continue;
    asserted += 1;
    if (cell.size !== expected) mismatches.push({ name: cell.name, rendered: cell.size, expected });
  }
  check(
    "AC-85: every rendered size cell equals the unit-by-magnitude rendering of the byte size the manifest records (DR-208)",
    asserted >= 5 && mismatches.length === 0,
    JSON.stringify({ asserted, mismatches }),
  );

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
    return t?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;
  `, { timeout: 15000, args: [group(before)] });
  check("meta-column flow: the imported document is gone again", !!removed);
  await clearSearch();
  await chooseSort({ primary: "Title", dir: "Ascending" });
  await capturedSearch(`(s) => s.args.sort === 'title' && s.args.dir === 'asc'`);
}

// AC-46 (UI-24): the tag row's live count renders as quiet tabular text
// — no ground, no border, no pill. (The dead-code half of the AC — no `.chip`
// anywhere — is asserted in `ui/src/lib/chip-cutover.test.ts`.)
async function flowQuietCounts() {
  // Self-sufficient (D14): the claim is about the manager's tag rows,
  // so the flow builds some tags instead of inheriting them.
  await ensureTags(3);
  await openTagsManager();
  const counts = await waitForEval(`
    const rows = document.querySelectorAll('.tag-row');
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
  check("AC-46: a tag row's count computes transparent ground, no border, tabular figures",
    !!counts && counts.length > 0 &&
      counts.every((c) => c.ground === "rgba(0, 0, 0, 0)" && c.border === "0px none" && c.fvn.includes("tabular-nums")),
    JSON.stringify(counts));
  await closeDialog("the tags manager");
}

// AC-48 (UI-26): every item of the Browse menu carries exactly one 16 px
// leading glyph in the column the menu reserves — including Manage tags,
// which takes the same `tag` path the Tags submenu trigger carries.
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
// app's own bulk path, observe the empty state's two import action buttons with
// their keycaps and the toast rhythm, then let a real query on the now-empty
// result set mount the first-paint skeleton — caught by a page-side observer at
// the moment it mounts, because the query answer arrives quickly.
// Scale flow (exported for scripts/ui-10k.mjs — DR-161, DR-136): its bulk
// "Select all N matching" claim exists only above a 500-document library.
export async function flowEmptyAndSkeleton() {
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  await clearSelectionIfAny();

  // The exact total is whatever the preceding flows left behind — read it,
  // group it the way the status bar groups it, and drive every later
  // expectation from that number.
  const countText = await execute(`return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] ?? null;`);
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
    return !t || t.textContent?.match(/^[0-9,.]+/)?.[0] === '0' ? true : null;
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

  // AC-51 (UI-29) / AC-115 as modified (DR-272, composition by DR-274): the
  // empty library offers BOTH import actions as equal neutral buttons, each
  // keycap combination rendered below its own button — the labels are the
  // shipped catalog strings, the keycaps the released mechanism.
  const empty = await waitForEval(`
    const box = document.querySelector('.empty-state');
    const actions = box ? Array.from(box.querySelectorAll('.action')) : [];
    const buttons = actions.map((a) => a.querySelector('button'));
    const kbds = actions.map((a) => Array.from(a.querySelectorAll('kbd')));
    if (!box || actions.length === 0 || buttons.some((b) => !b) || kbds.some((k) => k.length === 0)) return null;
    const bcs = getComputedStyle(box);
    const acts = box.querySelector('.actions');
    const acs = acts ? getComputedStyle(acts) : null;
    const colGaps = actions.map((a) => getComputedStyle(a).rowGap);
    const kcs = kbds.map((row) => getComputedStyle(row[0]));
    const below = actions.map((a) => {
      const b = a.querySelector('button').getBoundingClientRect();
      const c = a.querySelector('.combo').getBoundingClientRect();
      // The whole combination sits below its own button and shares its center
      // (both are centered in the column; tolerance for sub-pixel rounding).
      return c.top >= b.bottom - 1 && Math.abs((c.left + c.right) / 2 - (b.left + b.right) / 2) < 8;
    });
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
      actionsGap: acs ? acs.columnGap : null,
      colGaps,
      labels: buttons.map((b) => b.textContent.trim()),
      primary: buttons.map((b) => b.classList.contains('control-primary')),
      keys: kbds.map((row) => row.map((k) => k.textContent)),
      below,
      font: kcs.map((c) => c.fontFamily), ground: kcs.map((c) => c.backgroundColor),
      radius: kcs.map((c) => c.borderRadius),
      border: kcs.map((c) => c.borderTopWidth + ' ' + c.borderTopStyle),
      surface2, mono,
    };
  `, { timeout: 15000 });
  check("AC-115 (DR-272/DR-274): both import actions render as equal neutral buttons — labels as shipped, no primary variant, each keycap combination below its own button",
    !!empty && empty.labels.length === 2 &&
      empty.primary.every((p) => p === false) &&
      empty.labels[0] === "Import PDFs" &&
      JSON.stringify(empty.keys[0]) === JSON.stringify(["Ctrl", "I"]) &&
      empty.labels[1] === "Import folder" &&
      JSON.stringify(empty.keys[1]) === JSON.stringify(["Ctrl", "O"]) &&
      empty.below.every((b) => b === true),
    JSON.stringify(empty && { labels: empty.labels, keys: empty.keys, primary: empty.primary, below: empty.below }));
  check("AC-51 / AC-115: every keycap is monospace, on a surface-2 ground, with a hairline border and 6 px radius",
    !!empty && empty.font.every((f) => f === empty.mono) && empty.ground.every((g) => g === empty.surface2) &&
      // The declared 1 px hairline snaps to whole device px; at 175 % scaling it
      // computes back as 0.5714 CSS px. The claim is a hairline SOLID border,
      // not a specific sub-pixel number.
      empty.border.every((b) => /solid/.test(b) && Number.parseFloat(b) > 0) &&
      empty.radius.every((r) => Number.parseFloat(r) === 6),
    JSON.stringify(empty && { font: empty.font, ground: empty.ground, border: empty.border, radius: empty.radius }));
  check("AC-49: the empty state's vertical rhythm, the action row gap and the per-action column gaps are multiples of 4 px",
    !!empty && onScalePx(empty.gap) && onScalePx(empty.actionsGap) && empty.colGaps.every((g) => onScalePx(g)),
    `row-gap: ${empty && empty.gap}, actions: ${empty && empty.actionsGap}, columns: ${empty && JSON.stringify(empty.colGaps)}`);

  // AC-115 (UI-29 as modified): the two shortcuts open the two pickers from
  // the library window. What the harness observes is the request the app
  // posts at its own command boundary (the picker itself belongs to the OS,
  // and the dismissal follows the released picker pattern). The observer is
  // this flow's own (D14/DR-157).
  await instrumentBoundary();
  const captureAndDismiss = async () => {
    const request = await waitForEval(`
      const d = window.__TAURI_INTERNALS__.__smokeDialog;
      return d ? { args: d.args } : null;
    `, { timeout: 8000 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await keys("Escape");
      await waitForEval(`return document.querySelector('.menu') ? null : true;`, { timeout: 3000 });
    }
    const alive = await waitForEval(EVAL.appReady, { timeout: 30000 });
    if (!alive) throw new Error(`the app stopped answering after a picker was opened — ${await notReadyDiagnosis()}`);
    return request;
  };
  const pressAndCapture = async (keyActions) => {
    await execute(`window.__TAURI_INTERNALS__.__smokeDialog = null; return true;`);
    await keys(...keyActions);
    return captureAndDismiss();
  };
  // AC-115 (DR-272): pressing the *Import folder* button requests the folder
  // picker at the command boundary — the same code path the shortcut opens.
  await execute(`window.__TAURI_INTERNALS__.__smokeDialog = null; return true;`);
  await clickStable(`() => Array.from(document.querySelectorAll('.empty-state button')).find((b) => b.textContent.includes('Import folder')) ?? null`);
  const folderClickReq = await captureAndDismiss();
  check(
    "AC-115 (DR-272): pressing the *Import folder* button opens the folder picker — the app requests it as a directory",
    folderClickReq?.args?.options?.directory === true,
    JSON.stringify(folderClickReq),
  );
  const filesReq = await pressAndCapture(["^Control", "^i", "~i", "~Control"]);
  check(
    "AC-115: Ctrl+I opens the file picker — the app requests it with the PDF filter",
    filesReq?.args?.options?.multiple === true &&
      filesReq?.args?.options?.filters?.[0]?.name === "PDF" &&
      JSON.stringify(filesReq?.args?.options?.filters?.[0]?.extensions) === JSON.stringify(["pdf"]),
    JSON.stringify(filesReq),
  );
  const folderReq = await pressAndCapture(["^Control", "^o", "~o", "~Control"]);
  check(
    "AC-115: Ctrl+O opens the folder picker — the app requests it as a directory",
    folderReq?.args?.options?.directory === true,
    JSON.stringify(folderReq),
  );
  // DR-276 (the user's Phase-B defect): Ctrl+Shift+I opens nothing. It
  // arrives as "I" and used to fall through to the file-picker binding —
  // the import bindings now ignore Shift.
  const shiftedReq = await pressAndCapture(["^Control", "^Shift", "^i", "~i", "~Shift", "~Control"]);
  check(
    "AC-115 (DR-276): Ctrl+Shift+I opens neither picker — the plain import bindings ignore Shift",
    shiftedReq === null,
    JSON.stringify(shiftedReq),
  );
  // Typing must not lose the combination: with a text field focused the
  // global map's guard skips, so neither shortcut posts a picker request.
  await execute(`document.querySelector('.search-input')?.focus(); return true;`);
  await execute(`window.__TAURI_INTERNALS__.__smokeDialog = null; return true;`);
  await keys("^Control", "^i", "~i", "~Control");
  await keys("^Control", "^o", "~o", "~Control");
  const silent = await waitForEval(
    `return window.__TAURI_INTERNALS__.__smokeDialog === null ? true : null;`,
    { timeout: 2000 },
  );
  check("AC-115: neither shortcut fires while a text field owns focus", silent === true);
  await execute(`document.activeElement?.blur(); return true;`);

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
  check("AC-50: the skeleton row is the real row block (122 px) with the real cover placeholder (75×106)",
    !!sk && Math.abs(sk.rowH - 122) <= 1 && Math.abs(sk.coverW - 75) <= 1 && Math.abs(sk.coverH - 106) <= 1,
    JSON.stringify(sk));
  check("AC-50: the meta placeholder reserves the fixed 96 px column at the row's inset",
    !!sk && Math.abs(sk.metaW - 96) <= 1 && Math.abs(sk.rowRight - sk.metaRight - 12) <= 1,
    JSON.stringify(sk));
  await clearSearch();
}

// AC-34 (D5): with a 30-tag library the Tags submenu panel lies
// wholly inside the viewport and scrolls, every tag is reachable by
// pointer and by keyboard, and the View menu and a row context menu stay
// inside the window. The tags are created through the app's own manager
// (the store path) and left in place: the library is rebuilt per run
// (prepareEnvironment) and the only flow that follows never reads tags.
async function flowMenuBounds() {
  await clearTagFilter();
  await browseSelect("All documents");
  await clearSearch();
  await setViewMode("list");
  await parkPointer();
  await ensureTags(30);
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

  // Browse ▸ Tags submenu, opened by pointer.
  await openMenu('.browse-trigger', '.menu.browse-menu');
  const subTrigger = await waitForEval(`
    const item = Array.from(document.querySelectorAll('.menu.browse-menu .menu-item')).find((i) => i.textContent.includes('Tags'));
    if (!item) return null;
    const r = item.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `, { timeout: 5000 });
  if (!subTrigger) throw new Error("the Browse menu shows no Tags submenu trigger");
  await hoverPoint(subTrigger.x, subTrigger.y);
  const subUp = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!subUp) throw new Error("the Tags submenu did not open on hover");

  const subBox = await panelBox('.menu.browse-sub');
  check("AC-34: the Tags submenu panel lies wholly inside the viewport", contained(subBox), JSON.stringify(subBox));
  check("AC-34: with 30 tags the submenu scrolls (scrollHeight > clientHeight)",
    !!subBox && subBox.items >= 30 && subBox.scrollHeight > subBox.clientHeight, JSON.stringify(subBox));

  // Every tag reachable by pointer: scroll the panel and collect the
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
  check("AC-34: every tag in the submenu is reachable by pointer (fully visible at some scroll position)",
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
  check("AC-34: the last tag item highlights on pointer hover at the bottom of the scroll",
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
      return hi && hi.textContent.includes('Tags') ? true : null;
    `, { timeout: 1000 }));
  }
  if (!onTrigger) throw new Error("keyboard navigation never reached the Tags submenu trigger");
  await keys("ArrowRight");
  const subOpen = await waitForEval(`return document.querySelector('.menu.browse-sub .menu-item') ? true : null;`, { timeout: 5000 });
  if (!subOpen) throw new Error("ArrowRight did not open the Tags submenu");
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
  check("AC-34: ArrowDown from the first item reaches every tag in the submenu",
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
// are each mandated by a design section of an in-development release —
// --content-gutter by UI-19, --menu-edge by UI-25, --warning-hover/
// --danger-hover by D11's corrected ramp (DR-120), --row-cover-gap by §3.12's
// row cover (DR-189), --selection-tint by §3.17's selection emphasis
// (UI-38/DR-220) — and nothing else may be new relative to the released
// baseline (HEAD carries the last released code).
function checkTokenSource() {
  const current = readFileSync(join(root, "ui", "src", "lib", "design-tokens.css"), "utf8");
  const released = spawnSync("git", ["show", "HEAD:ui/src/lib/design-tokens.css"], { cwd: root, encoding: "utf8" }).stdout;
  if (!released) {
    skip("AC-49 (source): token comparison against HEAD", "git show returned nothing");
    return;
  }
  const names = (text) => new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const added = [...names(current)].filter((n) => !names(released).has(n));
  const allowed = new Set(["--content-gutter", "--menu-edge", "--warning-hover", "--danger-hover", "--row-cover-gap", "--selection-tint", "--card-content-pad"]);
  check("AC-49 (source): no token added beyond the names this release's designs mandate",
    added.every((n) => allowed.has(n)), `added: ${JSON.stringify(added)}`);
}

// AC-57 (real-app half) is measured in scripts/ui-10k.mjs (DR-159, DR-161):
// the import loop's own status-bar samples are the throughput window,
// recorded in that run's log.

// ============================================================ v0.0.6 flows ===
// AC-64 … AC-72 (SPEC-v0.0.6.md §4). The reader flows run on the CDP runtime
// (DR-147) against the multi fixture tier; the dark-ramp flow is a library-
// window flow and runs on the WebDriver runtime like the released ones.

const FIXTURE_MULTI = join(root, "fixtures", "multi");
const multiManifest = () => JSON.parse(readFileSync(join(FIXTURE_MULTI, "manifest.json"), "utf8"));
const multiDoc = (name) => {
  const doc = multiManifest().docs.find((d) => d.name === name);
  if (!doc) throw new Error(`multi fixture ${name} is missing from the manifest`);
  return doc;
};

// The reader runtime's prefix (the AC-60 rule for this runtime): the tier the
// reader flows read, loaded through the app's own import command.
async function importMultiTier() {
  const paths = tierPdfPaths(FIXTURE_MULTI);
  // Delta-based (the reader suite may share the library with a WD runtime
  // that already imported another tier). The baseline is read through the
  // command boundary, not the status bar: a freshly launched instance has
  // not published its count yet, and a status-bar read there is 0 (DR-159
  // full-run finding — the old read happened to be right only because the
  // scale section emptied the library before this point).
  const ids = await cInvoke("library_ids", {
    query: "", tagIds: [], favoritesOnly: false, missingOnly: false, readingOnly: false,
    sort: "title", dir: "asc", sortSecondary: "none",
  });
  if (!Array.isArray(ids)) throw new Error(`library_ids returned ${JSON.stringify(ids)}`);
  const before = ids.length;
  const result = await cInvoke("library_import_paths", { paths, tagIds: [] });
  const expected = (before + (result?.imported ?? 0)).toLocaleString("en-US");
  const done = await cMainWait(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === ${JSON.stringify(expected)} ? true : null;`,
    { timeout: 60000 },
  );
  if (!done) throw new Error(`the multi-tier import did not complete (count: ${await cMainEval(EVAL.docTotal)}, expected: ${expected})`);
  importedTiers.push("multi");
  importedTitles = importedTitles.concat(multiManifest().docs.map((d) => d.title));
}

// Poll the reader target list until `id` is present/absent.
async function cWaitReaderId(id, present, { timeout = 8000, port = CDP_PORT } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const has = (await cdpReaderTargetIds(port)).includes(id);
    if (has === present) return true;
    if (Date.now() > deadline) return false;
    await sleep(250);
  }
}

// A control in the reader strip, clicked as a user clicks it: the rect is read
// inside the window, the pointer events come through CDP.
async function clickReaderControl(session, findSource) {
  // DR-239: park first. A previous click left the pointer on its control —
  // with a tooltip open there (the ToC toolbar's, DR-232), an un-parked
  // move/click aimed at another element lands on that tooltip instead, and
  // a move to the same point fires no pointerenter at all (the DR-157
  // lesson). Every control these flows click is always visible, so parking
  // at the window's neutral point cannot hide a target.
  await session.hoverAt(1, 1);
  const at = await session.evaluate(`
    const el = (${findSource})();
    if (!el || el.disabled) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
  if (!at) return false;
  await session.clickAt(at.x, at.y);
  return true;
}

const pageLabel = (page, count) => `Page ${page} of ${count}`;
const FIRST_PAGE_READY = `
  const img = document.querySelector('.page img[alt="Page 1"]');
  if (!(img && img.complete && img.naturalWidth > 0)) return null;
  return document.querySelector('.reader-controls input[aria-label]')?.getAttribute('aria-label') ?? null;
`;

// The label the page field currently carries — a self-contained expression:
// callers embed it inside their own `return …` / object literals.
// Parenthesized on purpose: `??` binds looser than `===`, so an unparenthesized
// interpolation of this expression into `… === "literal" ? …` silently compares
// `null === "literal"` and any truthy label passes the check vacuously.
const fieldLabel = `(document.querySelector('.reader-controls input[aria-label]')?.getAttribute('aria-label') ?? null)`;

async function flowReaderOpen() {
  // AC-64: the activation gestures reach the reader window, one window per
  // document, the library window interactive throughout. AC-72's activation
  // row is measured here (double-click → first page painted).
  const doc192 = multiDoc("multi-192.pdf");
  const doc096 = multiDoc("multi-096.pdf");

  const opened = await cOpenReader("multi-192");
  const firstLabel = await opened.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const activationMs = Date.now() - opened.openedAt;
  timingRow("activation → first page (192-page core fixture)", activationMs, 800, "real double-click → first page painted");
  check(
    "AC-64: a double-click opens a reader window on page 1 with the true page count",
    firstLabel === pageLabel(1, doc192.pages),
    `label: ${JSON.stringify(firstLabel)}, expected: ${JSON.stringify(pageLabel(1, doc192.pages))}`,
  );

  // Enter on a focused row activates the same way (AC-64 names both).
  await opened.session.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);
  const row = await cRow("multi-192");
  await cMainEval(`document.querySelector('[data-row-id="${row.id}"]').focus(); return true;`);
  await cdpMain.key("Enter", "Enter", 13);
  const viaEnter = await cWaitReaderId(opened.id, true, { timeout: 10000 });
  check("AC-64: Enter opens a reader window for the focused row", viaEnter);
  const entered = await cReaderConnected(opened.id);
  const enterLabel = await entered.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  check("AC-64: the Enter-opened window shows page 1", enterLabel === pageLabel(1, doc192.pages), `label: ${JSON.stringify(enterLabel)}`);

  // AC-76 (UI-30 as modified by §3.3): the strip's place — the window's
  // bottom edge, below the page stack; the chrome strip stays at the top.
  // The released behaviors are the rest of this flow and its siblings, with
  // their gestures unchanged (AC-76's own wording).
  const placement = await entered.evaluate(`
    return (() => {
      const strip = document.querySelector('.reader-controls');
      const chrome = document.querySelector('.chrome');
      const stack = document.querySelector('.reader-scroll');
      if (!strip || !chrome || !stack) return null;
      const s = strip.getBoundingClientRect();
      const c = chrome.getBoundingClientRect();
      const k = stack.getBoundingClientRect();
      return {
        stripAtBottom: Math.abs(s.bottom - window.innerHeight) <= 2,
        stripBelowStack: s.top >= k.bottom - 2,
        chromeAtTop: c.top <= 2,
      };
    })();
  `);
  check("AC-76: the control strip renders at the window's bottom edge below the page stack, the chrome strip at the top edge",
    !!placement && placement.stripAtBottom && placement.stripBelowStack && placement.chromeAtTop,
    JSON.stringify(placement));

  // AC-87 (UI-37, §3.11): the reader chrome's document name is the app's own
  // tooltip on the ramp's overlay ground — the reader-window surface class,
  // measured here because the reader windows live on this runtime (DR-201).
  const namePos = await entered.evaluate(`
    return (() => {
      const el = document.querySelector('.chrome .name');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: el.textContent };
    })();
  `);
  if (!namePos) throw new Error("the reader chrome name is not rendered for the tooltip check");
  await entered.hoverAt(namePos.x, namePos.y);
  const nameTip = await entered.waitFor(`
    return (() => {
      const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
      if (!tip) return null;
      const cs = getComputedStyle(tip);
      const raw = String(getComputedStyle(document.documentElement).getPropertyValue('--surface-1')).trim();
      const hex = raw.match(/^#([0-9a-f]{6})$/i);
      const n = hex ? parseInt(hex[1], 16) : null;
      const want = hex ? \`rgb(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255})\` : raw;
      return { text: tip.textContent.trim(), bg: cs.backgroundColor, want, shadow: cs.boxShadow };
    })();
  `);
  await entered.hoverAt(1, 1); // off the name: the tooltip dismisses again
  check(
    "AC-87: the reader chrome name shows the app's own tooltip on the ramp's --surface-1 ground with its shadow",
    !!nameTip && nameTip.text === namePos.text && nameTip.bg === nameTip.want && nameTip.shadow !== "none",
    JSON.stringify(nameTip),
  );

  // AC-93 (UI-30 as modified by DR-206): the full name displays while the
  // strip has room and shrinks with an ellipsis only on real overflow; the
  // DOM text stays the full name in both cases. The subject is the
  // 72-character special-corpus fixture (make-fixtures): its natural width
  // exceeds the space the strip leaves for a name at the window's minimum
  // size, while the default 1000 px window fits it in full. The flow
  // imports it, opens it, asserts it, and deletes it again — the library
  // ends as it started.
  const longName = "ac93-reader-chrome-name-ellipsis-fixture-document-for-narrow-windows.pdf";
  await cInvoke("library_import_paths", { paths: [join(FIXTURE_SPECIAL, longName)], tagIds: [] });
  await cSearch("ac93-reader-chrome");
  const longAppeared = await cMainWait(`
    return Array.from(document.querySelectorAll('[data-row-id]')).some((r) =>
      (r.querySelector('.title-line')?.textContent ?? '').includes("ac93-reader-chrome")) ? true : null;
  `, { timeout: 15000 });
  if (!longAppeared) throw new Error("the long-name fixture did not appear in the library");
  const longDoc = await cOpenReader("ac93-reader-chrome");
  await longDoc.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const nameMetrics = () => longDoc.session.evaluate(`
    const el = document.querySelector('.chrome .name');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const strip = el.closest('.chrome')?.getBoundingClientRect();
    return {
      text: el.textContent,
      truncated: el.scrollWidth > Math.ceil(el.clientWidth) + 1,
      ellipsis: getComputedStyle(el).textOverflow,
      width: Math.round(r.width),
      strip: strip ? Math.round(strip.width) : null,
    };
  `);
  // The default window: the full name renders, no ellipsis.
  const wideName = await nameMetrics();
  // Below the name's width (the 72-character name is ~480 px at the strip
  // fonts; the strip's control group has a fixed minimum, so the viewport
  // must go under the name width itself — the CDP metrics override AC-66
  // uses; the real window keeps its size).
  await longDoc.session.setMetrics(420, 480);
  await sleep(250);
  const narrowName = await nameMetrics();
  // Hovering the ellipsized line opens the app tooltip carrying the full
  // name (AC-87's method) — asserted while the line is still ellipsized.
  let truncatedTip = null;
  if (narrowName?.truncated) {
    const nameBox = await longDoc.session.evaluate(`
      const r = document.querySelector('.chrome .name')?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    `);
    if (nameBox) {
      await longDoc.session.hoverAt(nameBox.x, nameBox.y);
      truncatedTip = await longDoc.session.waitFor(`
        const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
        return tip && tip.textContent.trim() ? { text: tip.textContent.trim() } : null;
      `, { timeout: 4000 });
      await longDoc.session.hoverAt(1, 1);
    }
  }
  await longDoc.session.clearMetrics();
  await sleep(250);
  const restoredName = await nameMetrics();
  // The window title property stays the full filename in both cases
  // (the released DR-140 rule, carried by DR-206): it is the NATIVE window
  // title. The CDP target title is the document title, never the window
  // title (measured at build), so the check reads the window titles the OS
  // sees for this suite's own app instance.
  const windowTitles = nativeWindowTitles(cdpApp.pid);
  check("AC-93: the reader window title property stays the full filename",
    windowTitles.includes(longName), JSON.stringify(windowTitles));
  check("AC-93: hovering the ellipsized name opens the app tooltip carrying the full name",
    !!truncatedTip && truncatedTip.text === longName, JSON.stringify(truncatedTip));
  check("AC-93: the chrome name shows in full while the strip has room and truncates with an ellipsis only on real overflow",
    !!wideName && !wideName.truncated && wideName.text === longName &&
      !!narrowName && narrowName.truncated && narrowName.text === longName && narrowName.ellipsis === "ellipsis" &&
      !!restoredName && !restoredName.truncated,
    `wide: ${JSON.stringify(wideName)}, narrow: ${JSON.stringify(narrowName)}, restored: ${JSON.stringify(restoredName)}`);
  // Cleanup: close the window, delete the document, restore the library's
  // starting state and the view the rest of this flow builds on.
  await longDoc.session.key("Escape", "Escape", 27);
  await cWaitReaderId(longDoc.id, false);
  await cInvoke("library_delete_document", { ids: [longDoc.id] });
  await cMainWait(`return !document.querySelector('[data-row-id="${longDoc.id}"]') ? true : null;`, { timeout: 8000 });
  await cSearch("multi-192");

  // Re-activating the same document focuses the existing window (the create-
  // or-focus rule): the command runs again, no second window appears.
  const row2 = await cRow("multi-192");
  await cResetOpenCounter();
  await cdpMain.doubleClickAt(row2.x, row2.y);
  const calledAgain = await cMainWait(`return (window.__TAURI_INTERNALS__.__readerOpenCalls ?? 0) >= 1 ? true : null;`, { timeout: 5000 });
  const ids = await cdpReaderTargetIds();
  const windowsForDoc = ids.filter((x) => x === opened.id).length;
  check(
    "AC-64: re-activating the same document opens no second window",
    !!calledAgain && windowsForDoc === 1,
    `reader windows for ${opened.id}: ${windowsForDoc}`,
  );

  // A second document opens its own window, and the library window answered
  // every step: a search typed now reaches the rendered rows.
  const second = await cOpenReader("multi-096");
  const ids2 = await cdpReaderTargetIds();
  check(
    "AC-64: a second document opens its own reader window",
    ids2.includes(opened.id) && ids2.includes(second.id) && opened.id !== second.id,
    `ids: ${JSON.stringify(ids2)}`,
  );
  await cSearch("multi-0");
  const answered = await cMainWait(`return document.querySelectorAll('[data-row-id]').length >= 2 ? true : null;`, { timeout: 10000 });
  check("AC-64: the library window stayed interactive throughout", !!answered);
  await cClearSearch();

  // Close both windows: the next flow builds its own state (D14).
  const sA = await cReaderConnected(opened.id);
  await sA.key("Escape", "Escape", 27);
  const sB = await cReaderConnected(second.id);
  await sB.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);
  await cWaitReaderId(second.id, false);
}

async function flowReaderNavigation() {
  // AC-65: every navigation path reaches every page — page-field jump,
  // prev/next, PgUp/PgDn, Home/End — including page 1 000 of the scale
  // fixture, and only viewport-near pages are ever mounted. AC-72's page-jump
  // row is measured on the field jump.
  const count192 = multiDoc("multi-192.pdf").pages;
  const count1000 = multiDoc("multi-1000.pdf").pages;
  const opened = await cOpenReader("multi-192");
  const s = opened.session;
  await s.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  await s.evaluate(`const f = document.querySelector('.reader-controls input[aria-label]'); f.focus(); f.select(); return true;`);
  await s.insertText("96");
  const jumpedAt = Date.now();
  await s.key("Enter", "Enter", 13);
  const jumpedLabel = await s.waitFor(`
    const img = document.querySelector('.page img[alt="Page 96"]');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    return ${fieldLabel};
  `, { timeout: 8000 });
  timingRow("page jump → new image visible (192 pages)", Date.now() - jumpedAt, 300, "page field 1 → 96");
  check("AC-65: the page field jumps to any page", jumpedLabel === pageLabel(96, count192), `label: ${JSON.stringify(jumpedLabel)}`);

  const clickedNext = await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Next page"]'));
  const nextLabel = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(97, count192))} ? true : null;`, { timeout: 5000 });
  check("AC-65: next reaches the following page", clickedNext && !!nextLabel);
  const clickedPrev = await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Previous page"]'));
  const prevLabel = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(96, count192))} ? true : null;`, { timeout: 5000 });
  check("AC-65: previous returns to the prior page", clickedPrev && !!prevLabel);

  // PgDn scrolls a viewport and crosses into the next page; PgUp reverses
  // (UI-30's inverse motion). The reversal presses exactly as many times
  // as PgDn was pressed and is then checked on the settled view: label
  // reads lag the scroll while images arrive, so sampling mid-flight would
  // test the harness's timing, not the app's behavior.
  const before = await readerState(s);
  let scrolled = false;
  let crossed = false;
  let dnPresses = 0;
  for (let i = 0; i < 6 && !crossed; i += 1) {
    await s.key("PageDown", "PageDown", 34);
    dnPresses += 1;
    await sleep(150);
    const st = await readerState(s);
    if (st.scrollTop > before.scrollTop) scrolled = true;
    if (st.label !== before.label) crossed = true;
  }
  check("AC-65: PgDn scrolls the viewport and reaches the next page", scrolled && crossed, `from scrollTop ${before.scrollTop}`);
  for (let i = 0; i < dnPresses; i += 1) {
    await s.key("PageUp", "PageUp", 33);
    await sleep(150);
  }
  const back = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(before.label)} ? true : null;`, { timeout: 5000 });
  check("AC-65: PgUp returns to the page it left", !!back);

  // Label and mount must come from one atomic read: a reader window's
  // document can be replaced early in its life by the WebView2 plumbing
  // (DR-156), and two separate round-trips can then straddle the frozen
  // old context and the live new one. waitReaderAt returns exactly what
  // the poll observed.
  await s.key("End", "End", 35);
  const endState = await waitReaderAt(s, pageLabel(count192, count192), { timeout: 10000 });
  check("AC-65: End reaches the last page", !!endState && endState.label === pageLabel(count192, count192), `label: ${JSON.stringify(endState?.label ?? null)}`);
  const nearCurrent = (state, page) =>
    state.mounted > 0
      && state.mounted < 40
      && state.pages.every((p) => {
        const n = Number((p.alt ?? "").replace(/^Page /, ""));
        return Number.isFinite(n) && Math.abs(n - page) <= 8;
      });
  check(
    "AC-65: only viewport-near pages are mounted (192-page document)",
    !!endState && nearCurrent(endState, count192),
    endState ? `mounted: ${endState.mounted}, alts: ${JSON.stringify(endState.pages.map((p) => p.alt))}` : "no reader state",
  );
  await s.key("Home", "Home", 36);
  const atHome = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(1, count192))} ? true : null;`, { timeout: 10000 });
  check("AC-65: Home reaches the first page", !!atHome);
  await s.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);

  // The scale document: page 1 000 is reachable and the mount bound holds.
  const scale = await cOpenReader("multi-1000");
  await scale.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  await scale.session.key("End", "End", 35);
  const scaleState = await waitReaderAt(scale.session, pageLabel(count1000, count1000), { timeout: 15000 });
  check("AC-65: navigation reaches page 1 000 of the scale fixture", !!scaleState && scaleState.label === pageLabel(count1000, count1000), `label: ${JSON.stringify(scaleState?.label ?? null)}`);
  check(
    "AC-65: the mounted-page bound holds at 1 000 pages",
    !!scaleState && nearCurrent(scaleState, count1000),
    scaleState ? `mounted: ${scaleState.mounted}, alts near: ${JSON.stringify(scaleState.pages.map((p) => p.alt).slice(0, 4))}, label: ${JSON.stringify(scaleState.label)}, scrollTop: ${scaleState.scrollTop}` : "no reader state",
  );
  await scale.session.key("Escape", "Escape", 27);
  await cWaitReaderId(scale.id, false);
}

async function flowReaderZoom() {
  // AC-96 (UI-30 as re-anchored by DR-221): Fit width is the default and its
  // name is the readout; the fixed ladder measures actual × percent (the
  // letter fixture's page is 612 pt — 816 CSS px at actual size); Fit page
  // renders the whole current page inside the viewport; Actual Size renders
  // the true dimensions; the zoom select offers exactly those items and the
  // ladder; Ctrl keys reach them and the walk from a fit mode snaps to the
  // nearest step. Fit-width still re-derives on resize. AC-72's zoom-change
  // row is measured on the first step.
  const opened = await cOpenReader("multi-192");
  const s = opened.session;
  await s.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const st0 = await readerState(s);
  const fitWidth = st0.clientWidth - 24; // the two content gutters (UI-19)
  const actual = 816; // 612 pt × 4/3 — the fixture's true page width
  check(
    "AC-96: fit-width is the default — the page fills the content width and the readout names the mode",
    st0.zoom === "Fit width" && st0.pages.some((p) => p.alt === "Page 1" && Math.abs(p.width - fitWidth) <= 2),
    `readout: ${st0.zoom}, client ${st0.clientWidth}, page width ${JSON.stringify(st0.pages.map((p) => p.width))}, expected ${fitWidth}`,
  );

  const readout = () => `document.querySelector('.zoom-value')?.textContent?.trim() ?? null`;
  // The width the page actually renders at, measured once the page-1 image
  // is mounted and complete at the new zoom (the re-serve is in flight when
  // the readout label first flips — a single-shot read would race it).
  const zoomWidth = async () =>
    s.waitFor(`
      const img = document.querySelector('.page img[alt="Page 1"]');
      if (!(img && img.complete && img.naturalWidth > 0)) return null;
      const w = img.getBoundingClientRect().width;
      return w > 0 ? Math.round(w) : null;
    `, { timeout: 8000 });
  const waitReadout = (label) => s.waitFor(`return ${readout()} === ${JSON.stringify(label)} ? true : null;`, { timeout: 8000 });
  const readoutValue = () => s.evaluate(`return ${readout()};`);

  // From fit width the walk continues from the mode's effective percent
  // (AC-96): the fit-width page here is 967 CSS px on an 816 px actual page
  // — effective 118.5 % — so the first step down lands on 100 %, the
  // nearest ladder step below it. The expected landing is computed from the
  // measured fit width, never hard-coded. The walk then descends to the
  // clamped low end and climbs to the clamped high end, each fixed step
  // measured as actual × percent. AC-72's zoom-change row is measured on
  // the first step.
  const ladder = [50, 75, 100, 125, 150, 200, 300];
  const effective = (fitWidth / actual) * 100;
  const firstDown = [...ladder].reverse().find((v) => v < effective - 0.01) ?? 50;
  const zoomOutControl = () => document.querySelector('.reader-controls [aria-label="Zoom out"]');
  const zoomInControl = () => document.querySelector('.reader-controls [aria-label="Zoom in"]');

  const zoomOutAt = Date.now();
  await clickReaderControl(s, zoomOutControl);
  await waitReadout(`${firstDown}%`);
  const wFirst = await zoomWidth();
  timingRow("zoom change → new image visible", Date.now() - zoomOutAt, 300, `Fit width → ${firstDown} %`);
  check(
    `AC-96: from fit width the button walk continues from the mode's effective percent (${effective.toFixed(1)} %) — the step lands on ${firstDown} % at actual × ${firstDown} / 100`,
    wFirst !== null && Math.abs(wFirst - (actual * firstDown) / 100) <= 2,
    `width: ${wFirst}, expected ${(actual * firstDown) / 100}`,
  );

  // Descend to the clamped low end (walking down from wherever the first
  // step landed), measuring the anchor at 75 % and 50 %.
  const walkDown = async (label) => {
    for (let guard = 0; guard < 6; guard += 1) {
      await clickReaderControl(s, zoomOutControl);
      if (await s.waitFor(`return ${readout()} === ${JSON.stringify(label)} ? true : null;`, { timeout: 4000 })) return true;
    }
    return false;
  };
  for (const step of [75, 50]) {
    const reached = await walkDown(`${step}%`);
    const w = await zoomWidth();
    check(`AC-96: ${step} % displays ${step / 100} × the page's actual size`,
      reached && w !== null && Math.abs(w - (actual * step) / 100) <= 2, `width: ${w}, expected: ${(actual * step) / 100}`);
  }
  await clickReaderControl(s, zoomOutControl);
  const clampedLow = await readoutValue();
  check("AC-96: the walk clamps at 50 % — another step down does not leave the ladder",
    clampedLow === "50%", `readout: ${JSON.stringify(clampedLow)}`);

  // Climb: 50 → 125 is exactly three steps; 125 measures 1.25 × actual.
  for (let i = 0; i < 3; i += 1) await clickReaderControl(s, zoomInControl);
  await waitReadout("125%");
  const w125 = await zoomWidth();
  check("AC-96: 125 % displays 1.25 × the actual size", w125 !== null && Math.abs(w125 - actual * 1.25) <= 2, `width: ${w125}`);

  // 125 → 300 is three steps (150, 200, 300); a further step stays at 300.
  for (let i = 0; i < 3; i += 1) await clickReaderControl(s, zoomInControl);
  await waitReadout("300%");
  const w300 = await zoomWidth();
  check("AC-96: 300 % displays 3 × the actual size", w300 !== null && Math.abs(w300 - actual * 3) <= 2, `width: ${w300}`);
  await clickReaderControl(s, zoomInControl);
  const clampedHigh = await readoutValue();
  check("AC-96: the walk clamps at 300 % — another step up does not leave the ladder",
    clampedHigh === "300%", `readout: ${JSON.stringify(clampedHigh)}`);

  // The zoom select (AC-96): the trigger carries the readout, the menu offers
  // exactly the fit modes and the fixed ladder — asserted as an exact set.
  // bits-ui unmounts the content after a selection's close animation, and a
  // trigger click landing mid-animation toggles it shut — so every open
  // starts from a confirmed closed state and every selection waits for the
  // content to leave.
  const menuPresent = () => s.evaluate(`return document.querySelector('.menu.zoom-menu') ? true : false;`);
  const waitMenuGone = () =>
    s.waitFor(`return document.querySelector('.menu.zoom-menu') ? null : true;`, { timeout: 4000 });
  const openZoomMenu = async () => {
    if (await menuPresent()) await waitMenuGone();
    await clickReaderControl(s, () => document.querySelector('.zoom-select'));
    const items = await s.waitFor(`
      const c = document.querySelector('.menu.zoom-menu');
      if (!c) return null;
      return Array.from(c.querySelectorAll('.menu-item')).map((i) => i.textContent.trim());
    `, { timeout: 5000 });
    return items ?? [];
  };
  const zoomMenuItems = await openZoomMenu();
  check(
    "AC-96: the zoom select offers exactly the fit modes and the fixed ladder",
    JSON.stringify(zoomMenuItems) === JSON.stringify(["Fit width", "Fit page", "Actual size", "50%", "75%", "100%", "125%", "150%", "200%", "300%"]),
    JSON.stringify(zoomMenuItems),
  );

  const clickZoomMenuItem = async (label) => {
    const clicked = await clickReaderControl(
      s,
      `() => Array.from(document.querySelectorAll('.menu.zoom-menu .menu-item')).find((i) => i.textContent.trim() === ${JSON.stringify(label)})`,
    );
    if (!clicked) throw new Error(`the zoom select has no item "${label}"`);
    await waitReadout(label);
    await waitMenuGone();
  };
  await clickZoomMenuItem("Fit width");
  const wFit = await zoomWidth();
  check("AC-96: the select's Fit width item returns to the fit-width width", wFit !== null && Math.abs(wFit - fitWidth) <= 2, `width: ${wFit}`);

  await openZoomMenu();
  await clickZoomMenuItem("Actual size");
  const wActual = await zoomWidth();
  check("AC-96: Actual Size renders the page's true dimensions", wActual !== null && Math.abs(wActual - actual) <= 2, `width: ${wActual}, expected: ${actual}`);

  await openZoomMenu();
  await clickZoomMenuItem("150%");
  const w150 = await zoomWidth();
  check("AC-96: the select's 150 % item displays 1.5 × the actual size", w150 !== null && Math.abs(w150 - actual * 1.5) <= 2, `width: ${w150}`);

  // Fit page: the whole current page inside the viewport, its own aspect
  // kept, the height bounded by the viewport (AC-96).
  const fitPageGeometry = async () =>
    s.waitFor(`
      const sc = document.querySelector('.reader-scroll');
      const page = document.querySelector('.page');
      const img = page ? page.querySelector('img[alt="Page 1"]') : null;
      if (!(sc && page && img && img.complete && img.naturalWidth > 0)) return null;
      const box = page.getBoundingClientRect();
      if (Math.abs(box.width / box.height - 612 / 792) > 0.01) return null;
      if (box.height > sc.clientHeight + 2) return null;
      return { width: Math.round(box.width), height: Math.round(box.height), viewportHeight: sc.clientHeight };
    `, { timeout: 8000 });
  await openZoomMenu();
  await clickZoomMenuItem("Fit page");
  const fitPage = await fitPageGeometry();
  check("AC-96: Fit page renders the whole current page inside the viewport", !!fitPage, JSON.stringify(fitPage));

  // The keyboard keys (AC-96): Ctrl 0 / 1 / 2 pick the fit modes, Ctrl = /
  // Ctrl − walk the ladder — from a fit mode the walk continues from the
  // mode's effective percentage (Actual Size is 100 %, so Ctrl = lands on
  // 125 %, the nearest step up).
  await s.key("0", "Digit0", 48, 2);
  await waitReadout("Fit width");
  const wKeyFit = await zoomWidth();
  check("AC-96: Ctrl 0 selects Fit width", wKeyFit !== null && Math.abs(wKeyFit - fitWidth) <= 2, `width: ${wKeyFit}`);

  await s.key("1", "Digit1", 49, 2);
  await waitReadout("Fit page");
  const fitPageKey = await fitPageGeometry();
  check("AC-96: Ctrl 1 selects Fit page", !!fitPageKey, JSON.stringify(fitPageKey));

  await s.key("2", "Digit2", 50, 2);
  await waitReadout("Actual size");
  const wKeyActual = await zoomWidth();
  check("AC-96: Ctrl 2 selects Actual Size", wKeyActual !== null && Math.abs(wKeyActual - actual) <= 2, `width: ${wKeyActual}`);

  await s.key("=", "Equal", 187, 2);
  await waitReadout("125%");
  const wKeyIn = await zoomWidth();
  check("AC-96: Ctrl = walks to the nearest step above the mode's effective percent", wKeyIn !== null && Math.abs(wKeyIn - actual * 1.25) <= 2, `width: ${wKeyIn}`);

  await s.key("-", "Minus", 189, 2);
  await waitReadout("100%");
  const wKeyOut = await zoomWidth();
  check("AC-96: Ctrl − walks one step down", wKeyOut !== null && Math.abs(wKeyOut - actual) <= 2, `width: ${wKeyOut}`);

  await s.key("0", "Digit0", 48, 2);
  await waitReadout("Fit width");

  // The resize half: layout metrics change inside the window (no OS window
  // resize is reachable driverless) — the view's ResizeObserver is what the
  // claim under test.
  await s.setMetrics(900, 620);
  const resized = await s.waitFor(`
    const sc = document.querySelector('.reader-scroll');
    const img = document.querySelector('.page img[alt="Page 1"]');
    if (!(sc && img && img.complete && img.naturalWidth > 0)) return null;
    const w = Math.round(img.getBoundingClientRect().width);
    if (Math.abs(w - (sc.clientWidth - 24)) > 2) return null;
    return { client: sc.clientWidth, width: w };
  `, { timeout: 8000 });
  check("AC-96: fit-width re-derives when the window is resized", !!resized, JSON.stringify(resized));
  await s.clearMetrics();
  const restored = await s.waitFor(`
    const sc = document.querySelector('.reader-scroll');
    const img = document.querySelector('.page img[alt="Page 1"]');
    if (!(sc && img && img.complete && img.naturalWidth > 0)) return null;
    const w = Math.round(img.getBoundingClientRect().width);
    if (Math.abs(w - (sc.clientWidth - 24)) > 2 || Math.abs(w - ${fitWidth}) > 2) return null;
    return { client: sc.clientWidth, width: w };
  `, { timeout: 8000 });
  check("AC-96: fit-width re-derives back when the size is restored", !!restored, JSON.stringify(restored));

  // D23 / AC-119 (the v0.0.7 known issue): at the LAST page, fit → zoom out
  // → fit must leave the page anchored to the viewport's top edge. The
  // sequence is the AC's, on the default continuous layout: End → Fit page
  // (Ctrl 1) → one step down (Ctrl −) → Fit page again. The claim is
  // measured as the last page's top edge against the scroller's top edge.
  await s.key("End", "End", 35);
  const atLast = await s.waitFor(`
    const field = document.querySelector('.page-field');
    return field && field.value === "192" ? true : null;
  `, { timeout: 8000 });
  if (!atLast) throw new Error("the AC-119 sequence cannot start: the reader did not reach page 192");
  const lastPageTop = () =>
    s.waitFor(`
      const sc = document.querySelector('.reader-scroll');
      const img = document.querySelector('.page img[alt="Page 192"]');
      if (!(sc && img && img.complete && img.naturalWidth > 0)) return null;
      const page = img.getBoundingClientRect();
      const box = sc.getBoundingClientRect();
      return {
        delta: Math.round(page.top - box.top),
        pageH: Math.round(page.height),
        viewH: sc.clientHeight,
      };
    `, { timeout: 15000 });
  const ac119Diagnosis = () =>
    s.evaluate(`
      const sc = document.querySelector('.reader-scroll');
      const field = document.querySelector('.page-field');
      return {
        field: field ? field.value : null,
        scrollTop: sc ? Math.round(sc.scrollTop) : null,
        scrollHeight: sc ? Math.round(sc.scrollHeight) : null,
        viewH: sc ? sc.clientHeight : null,
        mounted: Array.from(document.querySelectorAll('.page img')).map((i) => i.alt).slice(0, 8),
      };
    `);
  await s.key("1", "Digit1", 49, 2);
  await waitReadout("Fit page");
  const fitLast = await lastPageTop();
  check("AC-119: at the last page, Fit page renders the page top-aligned",
    !!fitLast && Math.abs(fitLast.delta) <= 2, JSON.stringify(fitLast));
  await s.key("-", "Minus", 189, 2);
  const stepped = await readoutValue();
  const smaller = await s.waitFor(`
    const img = document.querySelector('.page img[alt="Page 192"]');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    const sc = document.querySelector('.reader-scroll');
    return img.getBoundingClientRect().height < sc.clientHeight ? { readout: ${JSON.stringify(stepped)}, pageH: Math.round(img.getBoundingClientRect().height), viewH: sc.clientHeight } : null;
  `, { timeout: 15000 });
  if (!smaller) throw new Error(`the AC-119 sequence cannot continue: the zoom-out step (${JSON.stringify(stepped)}) did not make the page shorter than the viewport`);
  const refit = await (async () => {
    await s.key("1", "Digit1", 49, 2);
    await waitReadout("Fit page");
    return lastPageTop();
  })();
  check("AC-119: fit → zoom out → fit leaves the last page anchored to the top edge (D23)",
    !!refit && Math.abs(refit.delta) <= 2,
    `zoom-out step: ${JSON.stringify(smaller)}, final: ${JSON.stringify(refit ?? (await ac119Diagnosis()))}`);

  await s.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);
}

async function flowReaderClose() {
  // AC-67: Esc and the window's own Close control close a reader window; the
  // cache directory goes with it; other documents' windows are untouched; the
  // library is unchanged and interactive; deleting a document closes its
  // reader window with the row.
  // AC-67's claim is an invariant: opening and closing reader windows changes
  // nothing in the library. Read the count before the windows exist, compare
  // after they are gone — independent of which tier the run imported before.
  const totalBefore = await cMainEval(EVAL.docTotal);
  const readerDir = join(DATA_DIR, "reader");
  const a = await cOpenReader("multi-048");
  await a.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const b = await cOpenReader("multi-024");
  await b.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });

  const cacheA = join(readerDir, String(a.id));
  const cached = existsSync(cacheA) && readdirSync(cacheA).some((n) => n.endsWith(".png"));
  check("AC-67: the reader page cache exists while the window is open", cached, cacheA);

  await a.session.key("Escape", "Escape", 27);
  const closedA = await cWaitReaderId(a.id, false);
  let goneA = false;
  for (let i = 0; i < 20 && !goneA; i += 1) {
    goneA = !existsSync(cacheA);
    if (!goneA) await sleep(250);
  }
  const stillOpenB = (await cdpReaderTargetIds()).includes(b.id);
  check("AC-67: Esc closes the reader window", closedA);
  check("AC-67: the reader cache directory is gone after close", goneA, cacheA);
  check("AC-67: closing one reader window leaves another document's window open", stillOpenB);

  const closedByControl = await clickReaderControl(b.session, () => document.querySelector('.window-close'));
  const closedB = closedByControl && (await cWaitReaderId(b.id, false));
  check("AC-67: the window's Close control closes the reader window", closedB);
  check("AC-67: the Close control removes that cache too", !existsSync(join(readerDir, String(b.id))));

  const total = await cMainEval(EVAL.docTotal);
  check("AC-67: the library is unchanged while reader windows open and close", total === totalBefore, `count: ${total}, before: ${totalBefore}`);
  await cSearch("multi-192");
  const rows = await cMainEval(`return document.querySelectorAll('[data-row-id]').length;`);
  check("AC-67: the library window is interactive throughout", rows >= 1);
  await cClearSearch();

  // Deleting the document closes its reader window with the row — the app's
  // own delete command, library-only (the file stays).
  const c = await cOpenReader("multi-012");
  await c.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  // The app's own delete path (DR-149): context menu → Delete → library-only
  // (the file stays). The store removes the row; the Rust side closes the
  // reader window that belongs to the deleted document.
  const row = await cRow("multi-012");
  if (!row) throw new Error("the row disappeared before the delete");
  await cDeleteViaUi(row.x, row.y);
  const closedC = await cWaitReaderId(c.id, false, { timeout: 10000 });
  const rowGone = await cMainWait(`return !document.querySelector('[data-row-id="${c.id}"]') ? true : null;`, { timeout: 10000 });
  const goneC = !existsSync(join(readerDir, String(c.id)));
  check(
    "AC-67: deleting the document closes its reader window with the row",
    closedC && !!rowGone && goneC,
    `window closed: ${closedC}, row gone: ${!!rowGone}, cache gone: ${goneC}`,
  );
}

async function flowReaderErrors() {
  // AC-69: the error paths. A missing document yields the toast with Relink
  // and no window (MissingFile is checked before any window exists); an
  // unrenderable file yields the reader window's error state with an Open in
  // external viewer action that performs the external open exactly once.
  const movedFrom = join(FIXTURE_MULTI, "multi-048.pdf");
  const movedTo = `${movedFrom}.moved`;
  renameSync(movedFrom, movedTo);
  try {
    // Missing detection is rescan-based (FR-12): run the app's own detection
    // command so the flag reflects the rename before activation (DR-149).
    const marked = await cInvoke("library_rescan", {});
    if (!marked || marked.missing_found < 1) {
      throw new Error(`the rescan did not mark the renamed file missing: ${JSON.stringify(marked)}`);
    }
    await cSearch("multi-048");
    const row = await cRow("multi-048");
    await cResetOpenCounter();
    await cdpMain.doubleClickAt(row.x, row.y);
    const toast = await cMainWait(`return Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes('file is missing')) ? true : null;`, { timeout: 10000 });
    const relink = await cMainWait(`return Array.from(document.querySelectorAll('.toast .control')).some((c) => c.textContent.trim() === 'Relink') ? true : null;`, { timeout: 5000 });
    const noWindow = !(await cWaitReaderId(row.id, true, { timeout: 1500 }));
    const calls = await cReaderOpenCalls();
    check(
      "AC-69: a missing document yields a toast with Relink and no window",
      !!toast && !!relink && noWindow,
      `reader open calls: ${calls}, window for ${row.id}: ${!noWindow}`,
    );
    await cClearSearch();
  } finally {
    renameSync(movedTo, movedFrom);
    // Restore the flag through the same detection path for later flows (DR-149).
    await cInvoke("library_rescan", {});
  }

  const beforeTotal = Number(String(await cMainEval(EVAL.docTotal)).replace(/[^0-9]/g, ""));
  await cInvoke("library_import_paths", { paths: [join(FIXTURE_SPECIAL, "malformed.pdf")], tagIds: [] });
  // The status bar groups thousands (format.ts); the expectation must carry
  // the same grouping or the comparison never matches above 999 documents.
  const expectedTotal = String(beforeTotal + 1).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const imported = await cMainWait(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === ${JSON.stringify(expectedTotal)} ? true : null;`,
    { timeout: 60000 },
  );
  if (!imported) throw new Error("the unrenderable fixture did not reach the library");

  const broken = await cOpenReader("malformed");
  // The external-open action runs in the reader window's own context — the
  // boundary observer belongs to that window too (it is the same transport).
  await broken.session.evaluate(BOUNDARY_SCRIPT);
  const errorState = await broken.session.waitFor(`
    const e = document.querySelector('.error-state');
    if (!e) return null;
    const action = Array.from(e.querySelectorAll('button')).find((b) => b.textContent.includes('Open in external viewer'));
    return { text: (e.textContent ?? '').slice(0, 120), hasAction: !!action };
  `, { timeout: 10000 });
  check(
    "AC-69: an unrenderable file shows the reader error state with the external action",
    !!errorState?.hasAction,
    JSON.stringify(errorState),
  );
  const noStrip = await broken.session.evaluate(`return document.querySelector('.reader-controls') ? null : true;`);
  check("AC-76: the error state renders no control strip", noStrip === true);
  const clicked = await clickReaderControl(broken.session, () => Array.from(document.querySelectorAll('.error-state button')).find((b) => b.textContent.includes('Open in external viewer')));
  const openedOnce = await broken.session.waitFor(`return (window.__TAURI_INTERNALS__.__openCalls ?? 0) === 1 ? true : null;`, { timeout: 8000 });
  check("AC-69: the action performs the external open exactly once at the command boundary", !!clicked && !!openedOnce);
  await broken.session.key("Escape", "Escape", 27);
  await cWaitReaderId(broken.id, false);
}

// AC-78 (UI-33 as revised by DR-218, SPEC-v0.0.7 §3.17): the ToC control,
// the collapsible tree (default collapsed to the first level, the
// expand-all / collapse-all toolbar, the per-parent chevron that toggles
// without jumping), the jump and the Esc priority on the outlined fixture.
// The tree the panel must render is the multi manifest's own outline — the
// expected values come from the manifest, never from a copy written here
// (AC-77's discipline, carried into the UI).
async function flowReaderToc() {
  const doc192 = multiDoc("multi-192.pdf");
  const opened = await cOpenReader("multi-192");
  const s = opened.session;
  await s.waitFor(FIRST_PAGE_READY, { timeout: 8000 });

  const tocControl = await s.evaluate(`
    return (() => {
      const strip = document.querySelector('.reader-controls');
      if (!strip) return null;
      const buttons = Array.from(strip.querySelectorAll('button'));
      const btn = buttons.find((b) => b.getAttribute('aria-label') === 'Table of contents');
      if (!btn) return null;
      const sr = strip.getBoundingClientRect();
      return {
        first: btn === buttons[0],
        bottomStrip: sr.bottom >= window.innerHeight - 2,
      };
    })();
  `);
  check("AC-78: with an outlined document open the ToC control renders first in the bottom strip, before the page-navigation group (DR-207)",
    !!tocControl && tocControl.first && tocControl.bottomStrip, JSON.stringify(tocControl));

  const clicked = await clickReaderControl(s, () =>
    document.querySelector('.reader-controls button[aria-label="Table of contents"]'));

  // The manifest's own tree facts (AC-77's discipline): the top level, and
  // the parent test — an entry is a parent exactly when the next entry is
  // deeper (the same rule the store implements).
  const want = doc192.outline;
  const isParent = (i) => i + 1 < want.length && want[i + 1].depth > want[i].depth;
  const topLevel = want.filter((e) => e.depth === 1);

  const probeTree = (count) => s.waitFor(`
    const panel = document.querySelector('.menu.toc-panel');
    if (!panel) return null;
    const entries = Array.from(panel.querySelectorAll('.toc-entry'));
    if (entries.length !== ${count}) return null;
    const toolbar = Array.from(panel.querySelectorAll('.menu-item'))
      .filter((i) => !i.classList.contains('toc-entry'))
      .map((i) => {
        // The control's accessible name (DR-244: the control is icon-only;
        // the mode-following text is its aria-label). The row text would
        // also include an open tooltip's text (the kit nests the content
        // inside the trigger), so it is never read.
        const control = i.querySelector('.control');
        if (control) return (control.getAttribute('aria-label') ?? '').trim();
        const clone = i.cloneNode(true);
        clone.querySelectorAll('.tooltip').forEach((t) => t.remove());
        return clone.textContent.trim();
      });
    return {
      toolbar,
      field: ${fieldLabel},
      entries: entries.map((e) => {
        const title = e.querySelector('.toc-title');
        const indent = e.querySelector('.toc-indent');
        const page = e.querySelector('.toc-page');
        const er = e.getBoundingClientRect();
        const pr = page.getBoundingClientRect();
        return {
          title: title.textContent.trim(),
          indent: parseFloat(indent.style.width),
          page: Number(page.textContent),
          hasToggle: !!e.querySelector('.toc-toggle'),
          trailing: Math.abs(pr.right - (er.right - parseFloat(getComputedStyle(e).paddingRight))) <= 3,
        };
      }),
    };
  `, { timeout: 8000 });

  const matchesManifest = (tree, expected) =>
    tree.entries.length === expected.length &&
    tree.entries.every((e, i) =>
      e.title === expected[i].title &&
      e.page === expected[i].page &&
      e.indent === (expected[i].depth - 1) * 12 &&
      e.trailing &&
      e.hasToggle === isParent(want.indexOf(expected[i])));

  const closed = await probeTree(topLevel.length);
  check(
    "AC-78: the panel opens collapsed to the first level — top-level entries only, titles, right-aligned page numbers; the toolbar is one row carrying the single expand/collapse toggle in its initial expand-all state (DR-218, DR-223)",
    clicked &&
      matchesManifest(closed, topLevel) &&
      JSON.stringify(closed.toolbar) === JSON.stringify(["Expand all"]),
    `panel: ${JSON.stringify(closed)} | manifest top level: ${JSON.stringify(topLevel)}`,
  );

  // AC-78 (toolbar look, DR-226): the toolbar row is chrome, not a menu
  // row — its ground equals the reader strip's (distinct from the panel's
  // own ground), it carries a 1 px bottom hairline, and the toggle is a
  // compact control: content-width (well under the row's width) and
  // left-aligned in the row.
  const toolbarLook = await s.evaluate(`
    const panel = document.querySelector('.menu.toc-panel');
    const row = panel?.querySelector('.menu-item.toc-toolbar');
    const control = row?.querySelector('.control');
    const strip = document.querySelector('.reader-controls');
    if (!panel || !row || !control || !strip) return null;
    const rowCs = getComputedStyle(row);
    const rr = row.getBoundingClientRect();
    const cr = control.getBoundingClientRect();
    return {
      rowBg: rowCs.backgroundColor,
      panelBg: getComputedStyle(panel).backgroundColor,
      stripBg: getComputedStyle(strip).backgroundColor,
      hairlineW: parseFloat(rowCs.borderBottomWidth),
      hairlineStyle: rowCs.borderBottomStyle,
      rowW: Math.round(rr.width),
      controlW: Math.round(cr.width),
      controlH: Math.round(cr.height),
      tokenH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--control-height')),
      inset: Math.round(cr.left - rr.left),
    };
  `);
  check(
    "AC-78: the toolbar row renders as chrome — the strip ground distinct from the panel ground with a bottom hairline — and the toggle is a compact, left-aligned, icon-only control in the strip's square icon grammar (DR-226 as amended by DR-244)",
    !!toolbarLook &&
      toolbarLook.rowBg === toolbarLook.stripBg &&
      toolbarLook.rowBg !== toolbarLook.panelBg &&
      toolbarLook.hairlineStyle === "solid" && toolbarLook.hairlineW >= 0.5 && toolbarLook.hairlineW <= 1.05 &&
      toolbarLook.controlW < toolbarLook.rowW - 40 &&
      // DR-244: icon-only — the control is the strip's 32 px square box,
      // the `--control-height` token the `.icon-button` grammar sizes to.
      Math.abs(toolbarLook.controlW - toolbarLook.tokenH) <= 2 &&
      Math.abs(toolbarLook.controlH - toolbarLook.tokenH) <= 2 &&
      toolbarLook.inset >= 10 && toolbarLook.inset <= 14,
    `toolbar: ${JSON.stringify(toolbarLook)}`,
  );

  // AC-78 (panel position, DR-207): the panel stays fully inside the reader
  // view — its top edge below the top chrome strip. Its cap is the reader
  // geometry (viewport − 2×chrome − 2×menu-edge), not the shared viewport
  // cap; the assertion compares the used max-height with that computation.
  const panelBounds = await s.evaluate(`
    return (() => {
      const panel = document.querySelector('.menu.toc-panel');
      const chrome = document.querySelector('.chrome');
      if (!panel || !chrome) return null;
      const pr = panel.getBoundingClientRect();
      const cr = chrome.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      const tb = parseFloat(root.getPropertyValue('--toolbar-height'));
      const me = parseFloat(root.getPropertyValue('--menu-edge'));
      return {
        panelTop: pr.top,
        chromeBottom: cr.bottom,
        belowChrome: pr.top >= cr.bottom - 1,
        insideViewport: pr.top >= 0 && pr.bottom <= window.innerHeight + 1 &&
          pr.left >= 0 && pr.right <= window.innerWidth + 1,
        maxHeight: parseFloat(getComputedStyle(panel).maxHeight),
        wantMax: window.innerHeight - 2 * tb - 2 * me,
      };
    })();
  `);
  check("AC-78: the panel is bounded inside the reader view — top edge below the chrome, reader-geometry max-height (DR-207)",
    !!panelBounds && panelBounds.belowChrome === true && panelBounds.insideViewport === true &&
      Math.abs(panelBounds.maxHeight - panelBounds.wantMax) <= 1,
    JSON.stringify(panelBounds));

  // The toolbar (DR-218, one row with one flip-flop control per DR-223):
  // the toggle's activation shows the whole tree with the panel staying
  // open and its label flips to the action it is about to perform; the
  // second activation collapses back and flips back.
  const clickToolbarItem = (label) => clickReaderControl(
    s,
    `() => {
      const c = document.querySelector('.menu.toc-panel .toc-toolbar .control');
      return c && (c.getAttribute('aria-label') ?? '').trim() === ${JSON.stringify(label)} ? c : null;
    }`,
  );
  await clickToolbarItem("Expand all");
  const expanded = await probeTree(want.length);
  check("AC-78: the toggle's first activation shows the whole tree with each entry's depth indent, the panel staying open, and its label flips to the collapse action (DR-223)",
    matchesManifest(expanded, want) && JSON.stringify(expanded.toolbar) === JSON.stringify(["Collapse all"]),
    `panel: ${JSON.stringify(expanded)}`);

  // AC-78 (panel structure, DR-232): the fixed toolbar and the tree-scoped
  // scroll. The four-entry fixture outline cannot overflow the released cap at
  // any reader-window size (no set_size permission, minimum 640×480 — the cap
  // stays above ~350 px while the full tree is ~190), so the flow forces the
  // overflow with a temporary cap on the panel and removes it before the next
  // check runs (DR-236). The cap VALUE is not re-asserted here — the DR-207
  // check above owns it; these checks own what DR-232 changed.
  await s.evaluate(`
    const st = document.createElement('style');
    st.id = 'smoke-toc-cap';
    st.textContent = '.menu.toc-panel { max-height: 140px !important; }';
    document.head.appendChild(st);
    return true;
  `);
  const structure = await s.evaluate(`
    return (() => {
      const panel = document.querySelector('.menu.toc-panel');
      const toolbar = panel?.querySelector('.menu-item.toc-toolbar');
      const tree = panel?.querySelector('.toc-tree');
      if (!panel || !toolbar || !tree) return null;
      const before = toolbar.getBoundingClientRect();
      if (tree.scrollHeight <= tree.clientHeight)
        return { scrollable: false, treeClient: tree.clientHeight, treeContent: tree.scrollHeight };
      tree.scrollTop = tree.scrollHeight;
      const after = toolbar.getBoundingClientRect();
      const tr = tree.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      return {
        scrollable: true,
        scrolled: tree.scrollTop > 0,
        toolbarVisible: toolbar.offsetParent !== null && after.width > 0 && after.height > 0,
        toolbarHeld: Math.abs(after.top - before.top) <= 1 && Math.abs(after.left - before.left) <= 1,
        toolbarInPanel: after.top >= pr.top - 1 && after.bottom <= pr.bottom + 1,
        treeBelowToolbar: tr.top >= after.bottom - 2,
        treeVerticalScrollbar: tree.offsetWidth - tree.clientWidth >= 4,
        treeHorizontalScrollbar: tree.scrollWidth > tree.clientWidth + 1,
        // DR-239: a 1 px border on each side inflates offsetWidth/Height
        // over clientWidth/Height without any scrollbar — subtract the
        // computed borders and apply the same ≥4 px scrollbar threshold the
        // tree check uses.
        panelHasScrollbar: (() => {
          const pcs = getComputedStyle(panel);
          const bw = (parseFloat(pcs.borderLeftWidth) || 0) + (parseFloat(pcs.borderRightWidth) || 0);
          const bh = (parseFloat(pcs.borderTopWidth) || 0) + (parseFloat(pcs.borderBottomWidth) || 0);
          return panel.offsetWidth - panel.clientWidth - bw >= 4 || panel.offsetHeight - panel.clientHeight - bh >= 4;
        })(),
        panelScrolled: panel.scrollTop !== 0 || panel.scrollLeft !== 0,
        treeTop: Math.round(tr.top), toolbarBottom: Math.round(after.bottom),
        scrollbarWidth: tree.offsetWidth - tree.clientWidth,
      };
    })();
  `);
  check(
    "AC-78: with the tree overflowingly tall the toolbar row stays visible at the panel's top edge while the tree region scrolls to its bottom (DR-232)",
    !!structure && structure.scrollable && structure.scrolled && structure.toolbarVisible
      && structure.toolbarHeld && structure.toolbarInPanel,
    JSON.stringify(structure),
  );
  check(
    "AC-78: the tree's scrollbar lies wholly inside the tree region below the toolbar row's bottom edge, and the panel box itself carries no scrollbar (DR-232)",
    !!structure && structure.scrollable && structure.treeVerticalScrollbar
      && !structure.treeHorizontalScrollbar && !structure.panelHasScrollbar && !structure.panelScrolled
      && structure.treeBelowToolbar,
    JSON.stringify(structure),
  );
  await s.evaluate(`
    document.getElementById('smoke-toc-cap')?.remove();
    const tree = document.querySelector('.menu.toc-panel .toc-tree');
    if (tree) tree.scrollTop = 0;
    return true;
  `);

  // AC-78 (DR-232, UI-37): the toolbar control carries the app's own tooltip —
  // the pointer hovers it and the opened tooltip node is read (the released
  // AC-33 mechanism, through the reader window's CDP runtime like AC-87/AC-93).
  // Its text must name the action the control carries (the mode-following
  // label). Park before measuring (DR-239): the preceding toolbar click left
  // the pointer on this very control with its tooltip open — a move to the
  // same point fires no pointerenter, and the kit would never re-open.
  await s.hoverAt(1, 1);
  const controlPos = await s.evaluate(`
    const c = document.querySelector('.menu.toc-panel .toc-toolbar .control');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
  if (controlPos) await s.hoverAt(controlPos.x, controlPos.y);
  const tocTip = await s.waitFor(`
    return (() => {
      const tip = document.querySelector('.tooltip[data-state="instant-open"], .tooltip[data-state="delayed-open"]');
      return tip ? { text: tip.textContent.trim() } : null;
    })();
  `, { timeout: 4000 });
  const tocLabel = await s.evaluate(`
    return document.querySelector('.menu.toc-panel .toc-toolbar .control')?.getAttribute('aria-label')?.trim() ?? null;
  `);
  check(
    "AC-78: pointing at the toolbar control opens the app's tooltip naming the action the control carries (DR-232, UI-37)",
    !!tocTip && !!tocLabel && tocTip.text === tocLabel && (tocLabel === "Collapse all" || tocLabel === "Expand all"),
    `tooltip: ${JSON.stringify(tocTip)}, control label: ${JSON.stringify(tocLabel)}`,
  );
  // The tooltip must be gone before the next click: parked off the control,
  // wait for the app's own dismiss (the measurement precondition, DR-239).
  await s.hoverAt(1, 1);
  const dismissed = await s.waitFor(`return document.querySelectorAll('.tooltip').length === 0 ? true : null;`, { timeout: 3000 });
  if (!dismissed) throw new Error("the control tooltip did not dismiss on pointer leave — the next click would hit the tooltip");

  await clickToolbarItem("Collapse all");
  const collapsedAgain = await probeTree(topLevel.length);
  check("AC-78: the toggle's second activation returns the panel to the first level and its label flips back (DR-223)",
    matchesManifest(collapsedAgain, topLevel) && JSON.stringify(collapsedAgain.toolbar) === JSON.stringify(["Expand all"]),
    `panel: ${JSON.stringify(collapsedAgain)}`);

  // DR-242: the row outside the control is inert. Click the row's far edge
  // — right of the control — and nothing may change: the panel stays open,
  // the tree stays at the first level, the toggle still names expand.
  // The panel's floating anchor recomputes asynchronously after the tree
  // height changes — measuring mid-move aims the click at stale geometry
  // (that is how batch-13 landed 5 px above the panel and closed it like
  // any outside click legitimately would). Wait for the row's rect to
  // repeat unchanged, then measure and verify the point hits the row.
  const settled = await s.waitFor(`
    const row = document.querySelector('.menu.toc-panel .toc-toolbar');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    const sig = Math.round(r.top) + ':' + Math.round(r.right);
    const prev = window.__tocRowSig ?? null;
    window.__tocRowSig = sig;
    return prev === sig ? true : null;
  `, { timeout: 5000 });
  if (!settled) throw new Error("the toolbar row's position did not settle after the collapse");
  const rowSpot = await s.evaluate(`
    return (() => {
      const row = document.querySelector('.menu.toc-panel .toc-toolbar');
      const c = row?.querySelector('.control');
      if (!row || !c) return null;
      const rr = row.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const x = Math.round(rr.right - 8);
      const y = Math.round(rr.top + rr.height / 2);
      if (x <= cr.right + 4) return null;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !hit.closest('.toc-toolbar') || hit.closest('.control')) return null;
      return { x, y };
    })();
  `);
  if (!rowSpot) throw new Error("no point on the toolbar row outside the control to click");
  await s.hoverAt(1, 1);
  await s.clickAt(rowSpot.x, rowSpot.y);
  const expandedByRow = await s.waitFor(
    `return document.querySelectorAll('.menu.toc-panel .toc-entry').length !== ${topLevel.length} ? true : null;`,
    { timeout: 1500 },
  );
  const afterRowClick = await s.evaluate(`
    return (() => {
      const panel = document.querySelector('.menu.toc-panel');
      if (!panel) return { panel: false };
      return {
        panel: true,
        entries: panel.querySelectorAll('.toc-entry').length,
        label: panel.querySelector('.toc-toolbar .control')?.getAttribute('aria-label')?.trim() ?? null,
      };
    })();
  `);
  check("AC-78: a click on the toolbar row outside the control does nothing — the panel stays open, the tree stays at the first level, the toggle mode untouched (DR-242)",
    !expandedByRow && afterRowClick?.panel === true && afterRowClick.entries === topLevel.length && afterRowClick.label === "Expand all",
    JSON.stringify({ clickedOutsideControl: rowSpot, expandedByRow: !!expandedByRow, afterRowClick }));

  // Keyboard parity (DR-242): Enter on the highlighted toolbar row runs the
  // same whole-tree action the control's click runs, panel staying open.
  // The row click above leaves the DOM focus on the menu item the pointer
  // hit — the same focus the menu's own keyboard navigation produces; if it
  // did not, the row is focused directly (the identical DOM state). The two
  // activations then return the tree to the collapsed first level the
  // checks below continue from.
  const rowFocus = await s.evaluate(`
    const row = document.querySelector('.menu.toc-panel .menu-item.toc-toolbar');
    if (!row) return null;
    if (document.activeElement === row || row.contains(document.activeElement)) return "after row click";
    row.focus();
    return document.activeElement === row || row.contains(document.activeElement) ? "row focused directly" : null;
  `);
  await s.key("Enter", "Enter", 13);
  const expandedByEnter = await probeTree(want.length);
  await s.key("Enter", "Enter", 13);
  const collapsedByEnter = await probeTree(topLevel.length);
  check("AC-78: Enter on the highlighted toolbar row runs the control's whole-tree action — expand all, then collapse all — with the panel staying open and the control's accessible name following each flip (DR-242, DR-244)",
    rowFocus !== null &&
      matchesManifest(expandedByEnter, want) && JSON.stringify(expandedByEnter.toolbar) === JSON.stringify(["Collapse all"]) &&
      matchesManifest(collapsedByEnter, topLevel) && JSON.stringify(collapsedByEnter.toolbar) === JSON.stringify(["Expand all"]),
    `focus: ${JSON.stringify(rowFocus)} | enter: ${JSON.stringify({ expandedByEnter, collapsedByEnter })}`);

  // The parent chevron (DR-218): it toggles the subtree without jumping —
  // the panel stays open and the page field stands.
  const toggled = await clickReaderControl(
    s,
    `() => Array.from(document.querySelectorAll('.menu.toc-panel .toc-entry'))
      .find((e) => e.querySelector('.toc-title')?.textContent.trim() === 'Section Two')?.querySelector('.toc-toggle')`,
  );
  const openSubtree = await probeTree(want.length);
  check("AC-78: the chevron expands its parent's subtree with no jump — panel open, page field unchanged",
    toggled && matchesManifest(openSubtree, want) && openSubtree.field === pageLabel(1, doc192.pages),
    `panel: ${JSON.stringify(openSubtree)}`);

  // The flip-flop mode is untouched by per-entry toggles (DR-223): after
  // the chevron opened a subtree the control still names expand-all, and
  // its activation still applies to the whole tree.
  check("AC-78: a per-entry expansion does not change the toggle's mode — it still names the expand action (DR-223)",
    JSON.stringify(openSubtree.toolbar) === JSON.stringify(["Expand all"]),
    `toolbar: ${JSON.stringify(openSubtree.toolbar)}`);

  // The overlay guard (AC-98/DR-228): with the panel open the arrow keys
  // belong to it. The chevron click above left focus inside the "Section
  // Two" item; ArrowRight there runs the panel's own entry key (UI-33) —
  // collapse, then expand again — and the reader key map must not move the
  // page. The tree is restored to the expanded state the checks below
  // expect.
  const guardField = openSubtree.field;
  const focusedEntry = await s.evaluate(`
    const item = document.activeElement?.closest?.('.toc-entry');
    return item ? item.textContent.trim().slice(0, 40) : (document.activeElement?.tagName ?? null);
  `);
  await s.key("ArrowRight", "ArrowRight", 39);
  const collapsedByArrow = await s.evaluate(`
    const panel = document.querySelector('.menu.toc-panel');
    if (!panel) return null;
    return {
      hasNested: Array.from(panel.querySelectorAll('.toc-entry')).some((e) =>
        (e.querySelector('.toc-title')?.textContent ?? '').trim().startsWith("Section Two A")),
      field: ${fieldLabel},
    };
  `);
  await s.key("ArrowRight", "ArrowRight", 39);
  const expandedByArrow = await s.evaluate(`
    const panel = document.querySelector('.menu.toc-panel');
    if (!panel) return null;
    return {
      hasNested: Array.from(panel.querySelectorAll('.toc-entry')).some((e) =>
        (e.querySelector('.toc-title')?.textContent ?? '').trim().startsWith("Section Two A")),
      field: ${fieldLabel},
    };
  `);
  check("AC-78: with the panel open ArrowRight on the focused parent runs the panel's own entry key (collapse, then expand) while the page field stands — the arrows belong to the overlay (AC-98/DR-228)",
    focusedEntry.includes("Section Two") &&
      collapsedByArrow?.hasNested === false && collapsedByArrow.field === guardField &&
      expandedByArrow?.hasNested === true && expandedByArrow.field === guardField,
    `focus: ${JSON.stringify(focusedEntry)} | after keys: ${JSON.stringify({ collapsedByArrow, expandedByArrow })}`);
  await clickToolbarItem("Expand all");
  const expandedAfterManual = await probeTree(want.length);
  check("AC-78: after manual partial state the toggle applies its whole-tree action and flips its label (DR-223)",
    matchesManifest(expandedAfterManual, want) && JSON.stringify(expandedAfterManual.toolbar) === JSON.stringify(["Collapse all"]),
    `panel: ${JSON.stringify(expandedAfterManual)}`);

  // Activating "Section Two A" jumps through the store's own goToPage — the
  // page field's path (UI-33) — and closes the panel.
  const target = want.find((e) => e.title === "Section Two A");
  const activated = await clickReaderControl(s, () =>
    Array.from(document.querySelectorAll('.menu.toc-panel .toc-entry'))
      .find((e) => e.querySelector('.toc-title')?.textContent.trim() === "Section Two A"));
  const jumped = await s.waitFor(`
    const img = document.querySelector('.page img[alt="Page ${target.page}"]');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    if (document.querySelector('.menu.toc-panel')) return null;
    return ${fieldLabel};
  `, { timeout: 10000 });
  // On failure, the state that explains the null: did the panel close, did
  // the page mount, what does the field say — the three things the wait
  // requires, each read once.
  const jumpDiag = jumped ? null : await s.evaluate(`
    return (() => {
      const img = document.querySelector('.page img[alt="Page ${target.page}"]');
      const ph = Array.from(document.querySelectorAll('.page-placeholder')).find((p) =>
        p.getAttribute('aria-label') === 'Page ${target.page}');
      return {
        panel: !!document.querySelector('.menu.toc-panel'),
        imgMounted: !!img, imgComplete: !!(img && img.complete && img.naturalWidth > 0),
        placeholder: !!ph, mountedPages: document.querySelectorAll('.page').length,
        field: ${fieldLabel},
      };
    })();
  `);
  check("AC-78: activating an entry jumps to its page (page field shows 61) and closes the panel",
    activated && jumped === pageLabel(target.page, doc192.pages),
    `label: ${JSON.stringify(jumped)}${jumpDiag ? ` | state: ${JSON.stringify(jumpDiag)}` : ""}`);

  // The view lands on the page: goToPage positions the target's top edge at
  // the viewport top — the scroll offset matches the page's computed offset
  // within 2 px (the store's snap allowance, DR-148).
  const alignment = await s.evaluate(`
    return (() => {
      const sc = document.querySelector('.reader-scroll');
      const page = Array.from(document.querySelectorAll('.page')).find((p) =>
        (p.querySelector('img')?.getAttribute('alt') ?? p.querySelector('.page-placeholder')?.getAttribute('aria-label')) === 'Page ${target.page}');
      if (!sc || !page) return null;
      return Math.abs(page.getBoundingClientRect().top - sc.getBoundingClientRect().top);
    })();
  `);
  check("AC-78: the jump lands on the page — scroll offset within 2 px of the page's computed offset",
    typeof alignment === "number" && alignment <= 2, `offset: ${JSON.stringify(alignment)}`);

  // Re-opening keeps the expansion state (AC-78, session scope): the panel
  // returns with "Section Two" still expanded. Then Esc: the panel's
  // OverlayAnchor registers the open overlay, so Esc closes the panel before
  // it would close the window (the released overlay-priority guard, §5.2).
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Table of contents"]'));
  const reopened = await probeTree(want.length);
  check("AC-78: re-opening keeps the expansion state — the panel returns with the expanded subtree (session scope, DR-218) — and the toggle's mode with it (DR-223)",
    matchesManifest(reopened, want) && JSON.stringify(reopened.toolbar) === JSON.stringify(["Collapse all"]),
    `panel: ${JSON.stringify(reopened)}`);
  await clickToolbarItem("Collapse all");
  const collapsedAfterReopen = await probeTree(topLevel.length);
  check("AC-78: the toggle's next activation still collapses all after the manual per-entry expansion, and flips back (DR-223)",
    matchesManifest(collapsedAfterReopen, topLevel) && JSON.stringify(collapsedAfterReopen.toolbar) === JSON.stringify(["Expand all"]),
    `panel: ${JSON.stringify(collapsedAfterReopen)}`);
  await s.key("Escape", "Escape", 27);
  const closedPanel = await s.waitFor(`return document.querySelector('.menu.toc-panel') ? null : true;`, { timeout: 5000 });
  const windowStill = (await cdpReaderTargetIds()).includes(opened.id);
  check("AC-78: Esc closes the panel with the window still open",
    !!closedPanel && windowStill);

  await s.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);

  // A document without an outline offers no control (UI-33's negative case).
  const plain = await cOpenReader("multi-1000");
  await plain.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const none = await plain.session.evaluate(`
    return document.querySelector('.reader-controls button[aria-label="Table of contents"]') ? null : true;
  `);
  check("AC-78: with multi-1000 open no ToC control is rendered", none === true);
  await plain.session.key("Escape", "Escape", 27);
  await cWaitReaderId(plain.id, false);
}

// AC-79 + AC-80 (UI-34 as revised by DR-204/DR-205/DR-219, SPEC-v0.0.7
// §3.6): the mode control and the three layouts, driven only through the
// shipped UI. Modes are changed by clicking the real control; navigation
// uses the same gestures every released reader flow uses. "The fixture's
// page geometry" is the Letter MediaBox every fixture carries (612 × 792 pt
// → height/width = 792/612). AC-79's prefetch half (DR-219) is audited at
// the reader window's own request boundary (the boundary observer, installed
// into this window like the serving flows do).
const FIXTURE_RATIO = 792 / 612;

async function modeButtons(session) {
  return session.evaluate(`
    return Array.from(document.querySelectorAll('.reader-controls button[aria-pressed]')).map((b) => ({
      label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed') === 'true',
    }));
  `);
}
async function clickMode(session, label) {
  // The find expression is evaluated inside the reader window (the
  // clickReaderControl contract), so the label is embedded as a literal.
  return clickReaderControl(session,
    `() => Array.from(document.querySelectorAll('.reader-controls button[aria-pressed]')).find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)})`);
}
// The released page-field gesture (focus, select, type, Enter) toward an
// expected field label — in facing mode the expected label is the row's
// first page, which is why the expectation is a parameter (DR-180).
async function fieldJumpTo(session, text, expectedLabel, { timeout = 10000 } = {}) {
  await session.evaluate(`const f = document.querySelector('.reader-controls input[aria-label]'); f.focus(); f.select(); return true;`);
  await session.insertText(text);
  await session.key("Enter", "Enter", 13);
  return waitReaderAt(session, expectedLabel, { timeout });
}
// AC-92 (DR-205): the mounted unit's horizontal margins inside the
// container's layout area — its content box as the browser lays children
// out (padding subtracted, classic scrollbar excluded: clientWidth/clientLeft
// are the layout metrics). Below fit width the margins must be equal within
// 2 px and non-negative — the unit centers; at fit width the unit spans the
// area (the no-op case).
async function centeringProbe(session, containerSel, unitSel) {
  return session.evaluate(`
    return (() => {
      const box = document.querySelector(${JSON.stringify(containerSel)});
      const unit = box?.querySelector(${JSON.stringify(unitSel)});
      if (!unit) return null;
      const br = box.getBoundingClientRect();
      const ur = unit.getBoundingClientRect();
      const cs = getComputedStyle(box);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const availLeft = br.left + box.clientLeft + padL;
      const availWidth = box.clientWidth - padL - padR;
      return {
        leftGap: Math.round(ur.left - availLeft),
        rightGap: Math.round(availLeft + availWidth - ur.right),
        unitWidth: Math.round(ur.width),
        contentWidth: Math.round(availWidth),
      };
    })();
  `);
}
const zoomOutControl = () => document.querySelector('.reader-controls button[aria-label="Zoom out"]');
// One zoom step below fit, then back to fit — the probe runs between.
async function centeringBelowFit(session, containerSel, unitSel) {
  const fit = await centeringProbe(session, containerSel, unitSel);
  await clickReaderControl(session, zoomOutControl);
  await session.waitFor(
    `return document.querySelector(${JSON.stringify(`${containerSel} ${unitSel} img`)})?.complete ? true : null;`,
    { timeout: 10000 },
  );
  const below = await centeringProbe(session, containerSel, unitSel);
  // Return to fit width through the released keyboard binding (AC-96). There
  // is no dedicated Fit-width button: the zoom select's trigger carries the
  // current mode's name, so a text search for a "Fit width" button would
  // only find it while fit width is already active.
  await session.key("0", "Digit0", 48, 2);
  await session.waitFor(
    `return document.querySelector('.zoom-value')?.textContent?.trim() === "Fit width" ? true : null;`,
    { timeout: 8000 },
  );
  return { fit, below };
}
const centeringOk = (fit, below) =>
  !!fit && fit.unitWidth >= fit.contentWidth - 2 &&
  !!below && below.unitWidth < below.contentWidth - 2 &&
  Math.abs(below.leftGap - below.rightGap) <= 2 && below.leftGap >= 0;

async function flowReaderViewModes() {
  const count = multiDoc("multi-192.pdf").pages;
  const opened = await cOpenReader("multi-192");
  const s = opened.session;
  await s.waitFor(FIRST_PAGE_READY, { timeout: 8000 });

  // AC-79: three choices, continuous active by default (the released default
  // mode, UI-34's own words; DR-181 keeps it per-window).
  const modes0 = await modeButtons(s);
  check("AC-79: the mode control renders three choices with continuous active by default",
    modes0.length === 3 && modes0[0].label === "Single page" && !modes0[0].pressed &&
      modes0[1].label === "Continuous" && modes0[1].pressed &&
      modes0[2].label === "Facing pages" && !modes0[2].pressed,
    JSON.stringify(modes0));

  // "Switching mode from continuous at page 57 shows page 57 in the new
  // mode" (AC-79): reach 57 through the released field, then switch.
  const at57 = await fieldJumpTo(s, "57", pageLabel(57, count));
  check("AC-79: the page field reaches page 57 in continuous (the mode-switch starting point)",
    !!at57 && at57.label === pageLabel(57, count));
  const switched = await clickMode(s, "Single page");
  const single = await s.waitFor(`
    const box = document.querySelector('.reader-single');
    if (!box) return null;
    const pages = Array.from(box.querySelectorAll('.page'));
    if (pages.length !== 1) return null;
    const img = pages[0].querySelector('img');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    const br = box.getBoundingClientRect();
    const pr = pages[0].getBoundingClientRect();
    const fits = pr.height <= br.height + 1 && pr.width <= br.width + 1;
    return {
      mounted: pages.length,
      alt: img.getAttribute('alt'),
      label: ${fieldLabel},
      dx: Math.abs((pr.left + pr.width / 2) - (br.left + box.clientLeft + box.clientWidth / 2)),
      centeredY: Math.abs((pr.top + pr.height / 2) - (br.top + br.height / 2)),
      topAligned: Math.abs(pr.top - br.top),
      fits,
      ratio: pr.height / pr.width,
    };
  `, { timeout: 10000 });
  // DR-204: the mounted page is centered when it fits the viewport and
  // top-aligned when taller — the top edge is never beyond reach.
  check("AC-79: switching to single page mounts exactly one page, centered on the current page, at the fixture geometry",
    switched && !!single && single.mounted === 1 && single.alt === "Page 57" && single.label === pageLabel(57, count) &&
      single.dx <= 2 && (single.fits ? single.centeredY <= 2 : single.topAligned <= 2) &&
      Math.abs(single.ratio - FIXTURE_RATIO) <= 0.01,
    JSON.stringify(single));

  // AC-79 (DR-204, edge rule re-derived by DR-227): a fit-width page
  // taller than the viewport — the container scrolls and the page's bottom
  // edge becomes reachable; the first wheel event at a reached edge
  // navigates exactly one page, and no event ever moves more than one.
  const geo = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return {
      maxScroll: box.scrollHeight - box.clientHeight,
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    };
  `);
  if (!geo || geo.maxScroll <= 0) throw new Error(`the single-page container is not scrollable: ${JSON.stringify(geo)}`);
  const wheel = async (step, total) => {
    // `step` signs the direction, `total` is the magnitude to send.
    const dir = Math.sign(step);
    let sent = 0;
    while (sent < total) {
      const d = Math.min(Math.abs(step), total - sent);
      await s.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: geo.x, y: geo.y, deltaX: 0, deltaY: dir * d,
      });
      sent += d;
      await sleep(80);
    }
  };
  // Scroll within the page to its bottom edge: every event produces motion
  // until the edge is actually reached, so the edge rule stays silent
  // throughout this batch.
  await wheel(400, geo.maxScroll);
  const bottomEdge = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    const page = box.querySelector('.page');
    const br = box.getBoundingClientRect();
    const pr = page.getBoundingClientRect();
    return {
      scrollTop: Math.round(box.scrollTop),
      maxScroll: box.scrollHeight - box.clientHeight,
      bottomReachable: pr.bottom <= br.bottom + 2,
      label: ${fieldLabel},
    };
  `);
  check("AC-79: the container scrolls a fit-width page taller than the viewport to its bottom edge (DR-204)",
    Math.abs(bottomEdge.scrollTop - bottomEdge.maxScroll) <= 2 && bottomEdge.bottomReachable &&
      bottomEdge.label === pageLabel(57, count),
    JSON.stringify(bottomEdge));

  // The edge rule (DR-227): the first wheel event at the reached bottom
  // edge advances exactly one page — no accumulation, no threshold. The
  // step lands the new page at the container's top edge (the released
  // landing rule, unchanged from DR-204).
  await wheel(100, 100);
  const edgeAt58 = await s.waitFor(`
    const img = document.querySelector('.reader-single .page img');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    return ${fieldLabel} === ${JSON.stringify(pageLabel(58, count))} && img.getAttribute('alt') === 'Page 58' ? true : null;
  `, { timeout: 10000 });
  check("AC-79: the first wheel event at the bottom edge advances exactly one page — no accumulation (DR-227)", !!edgeAt58);
  const topEdge = await s.waitFor(`
    const box = document.querySelector('.reader-single');
    const img = box?.querySelector('.page img');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    return box.scrollTop <= 2 && ${fieldLabel} === ${JSON.stringify(pageLabel(58, count))}
      ? { scrollTop: Math.round(box.scrollTop), label: ${fieldLabel} }
      : null;
  `, { timeout: 10000 });
  if (!topEdge) throw new Error(`edge-navigation setup broken: the advanced page did not start at the top edge: ${JSON.stringify(topEdge)}`);

  // One event never advances more than one page (DR-227): at the top edge
  // of the new page a forward wheel produces motion instead — the
  // container scrolls within the page and the page field stands.
  await wheel(100, 300);
  const stayed58 = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    return { scrollTop: Math.round(box.scrollTop), label: ${fieldLabel} };
  `);
  check("AC-79: one wheel event never advances more than one page — further forward events scroll within the new page (DR-227)",
    stayed58.label === pageLabel(58, count) && stayed58.scrollTop >= 290, JSON.stringify(stayed58));

  // The same semantics at the top edge. Back to the top edge of page 58 by
  // in-page scrolling (negative deltas before the edge is reached produce
  // motion, not a step), then one event at the edge.
  const scrolledDown = await s.evaluate(`return document.querySelector('.reader-single').scrollTop;`);
  await wheel(-100, Math.round(scrolledDown));
  const atTopEdge = await s.waitFor(
    `return document.querySelector('.reader-single').scrollTop <= 2 ? true : null;`,
    { timeout: 5000 },
  );
  if (!atTopEdge) throw new Error("edge-navigation setup broken: the container did not reach the top edge");
  await wheel(-100, 100);
  const at57back = await s.waitFor(
    `return ${fieldLabel} === ${JSON.stringify(pageLabel(57, count))} ? true : null;`,
    { timeout: 10000 },
  );
  const landedBottom = await s.waitFor(`
    const box = document.querySelector('.reader-single');
    if (!box) return null;
    const maxScroll = box.scrollHeight - box.clientHeight;
    return maxScroll > 0 && box.scrollTop >= maxScroll - 2
      ? { scrollTop: Math.round(box.scrollTop), maxScroll }
      : null;
  `, { timeout: 8000 });
  check("AC-79: the first wheel event at the top edge steps back exactly one page, landing at the previous page's bottom edge (DR-227)",
    !!at57back && !!landedBottom, JSON.stringify(landedBottom));

  // Every navigation path reaches exact pages in single mode (AC-79).
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Next page"]'));
  const at58 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(58, count))} ? true : null;`, { timeout: 5000 });
  check("AC-79: next reaches the following page in single mode", !!at58);
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Previous page"]'));
  const back57 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(57, count))} ? true : null;`, { timeout: 5000 });
  check("AC-79: previous returns to the exact page in single mode", !!back57);
  const at60 = await fieldJumpTo(s, "60", pageLabel(60, count));
  const mounted60 = await s.waitFor(`
    const img = document.querySelector('.reader-single .page img');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    return img.getAttribute('alt');
  `, { timeout: 8000 });
  check("AC-79: the page field jumps to an exact page in single mode", !!at60 && mounted60 === "Page 60",
    `mounted: ${JSON.stringify(mounted60)}`);

  // The key map is guarded while the field is focused — typing in the page
  // field owns the keys there (the released UI-30 guard, ReaderApp's own
  // comment). Pinning it first: the mode flows below rely on the field NOT
  // having focus when they press the keys.
  await s.key("PageDown", "PageDown", 34);
  await s.key("ArrowRight", "ArrowRight", 39);
  await sleep(250);
  const whileTyping = await s.evaluate(`
    const img = document.querySelector('.reader-single .page img');
    return {
      label: ${fieldLabel},
      alt: img?.getAttribute('alt') ?? null,
      focused: document.activeElement?.tagName ?? null,
    };
  `);
  check("AC-79: while the page field is focused the navigation keys belong to it — the arrow keys included (the key-map guard, AC-98/DR-228)",
    whileTyping.focused === "INPUT" && whileTyping.label === pageLabel(60, count) && whileTyping.alt === "Page 60",
    JSON.stringify(whileTyping));

  // The real gesture for window-level navigation: focus outside the field.
  // A click on the page image (no handler there) drops focus back to the
  // document, exactly as it does for a user. The point must lie inside the
  // visible part of the page: after the edge tests the container is
  // scrolled and the rect's center can sit above the viewport — measured at
  // build, such a click lands on the chrome strip (its drag region keeps
  // focus), the field keeps its focus, and the navigation keys stay the
  // field's (the guard), which is what the failures below were.
  const pageAt = await s.evaluate(`
    const r = document.querySelector('.reader-single .page').getBoundingClientRect();
    const top = Math.max(r.top, 60) + 20;
    const bottom = Math.min(r.bottom, window.innerHeight - 70) - 20;
    const left = Math.max(r.left, 30);
    const right = Math.min(r.right, window.innerWidth - 30);
    return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
  `);
  await s.clickAt(pageAt.x, pageAt.y);
  await s.key("PageDown", "PageDown", 34);
  const at61 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(61, count))} ? true : null;`, { timeout: 5000 });
  check("AC-79: PgDn moves one page in single mode", !!at61);
  await s.key("PageUp", "PageUp", 33);
  const at60again = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(60, count))} ? true : null;`, { timeout: 5000 });
  check("AC-79: PgUp moves back one page in single mode", !!at60again);

  // The arrow keys (AC-98, DR-227/DR-228): ArrowRight/ArrowLeft are the
  // strip's prev/next (the `stepPage` path), ArrowDown/ArrowUp the wheel's
  // keyboard counterpart (the same edge rule, one notch = 100 px). Focus
  // is on the document (the page click above), the field is not focused.
  // Setup: the single-mode container keeps its scroll across index
  // changes, so the block positions it explicitly — page 60 at the
  // container's top edge.
  await s.evaluate(`document.querySelector('.reader-single').scrollTop = 0;`);
  await sleep(150);
  await s.key("ArrowRight", "ArrowRight", 39);
  const arrowTo61 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(61, count))} ? true : null;`, { timeout: 5000 });
  check("AC-98: ArrowRight advances exactly one page in single mode, landing the same as the controls", !!arrowTo61);

  // Page 61 mounted, container still at the top edge: ArrowDown there
  // produces in-page motion — the container scrolls by exactly one notch,
  // the page stands.
  const beforeNotch = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    return { scrollTop: Math.round(box.scrollTop), label: ${fieldLabel} };
  `);
  await s.key("ArrowDown", "ArrowDown", 40);
  await sleep(250);
  const afterNotch = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    return { scrollTop: Math.round(box.scrollTop), label: ${fieldLabel} };
  `);
  check("AC-98: ArrowDown inside a taller page scrolls the container by the notch, the page unchanged",
    beforeNotch.scrollTop <= 2 && afterNotch.label === pageLabel(61, count) &&
      Math.abs(afterNotch.scrollTop - (beforeNotch.scrollTop + 100)) <= 2,
    JSON.stringify({ beforeNotch, afterNotch }));

  // Walk down to the bottom edge with the same key (each press moves 100
  // px; the last one clamps at the edge, no press arrives at a reached
  // edge during the walk), then one more press: at the edge it is the
  // wheel's counterpart — exactly one page (DR-227).
  const remainingToBottom = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    return box.scrollHeight - box.clientHeight - box.scrollTop;
  `);
  const walkPresses = Math.max(0, Math.ceil((remainingToBottom - 2) / 100));
  for (let i = 0; i < walkPresses; i += 1) {
    await s.key("ArrowDown", "ArrowDown", 40);
    await sleep(120);
  }
  const atBottomEdge = await s.evaluate(`
    const box = document.querySelector('.reader-single');
    return box.scrollTop >= box.scrollHeight - box.clientHeight - 2;
  `);
  if (!atBottomEdge) throw new Error("the arrow walk did not reach the container's bottom edge");
  await s.key("ArrowDown", "ArrowDown", 40);
  const arrowStep62 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(62, count))} ? true : null;`, { timeout: 10000 });
  check("AC-98: ArrowDown at a reached bottom edge advances exactly one page — the keyboard counterpart of the wheel (DR-227)", !!arrowStep62);

  // The edge step lands page 62 at the container's top edge (the wheel's
  // landing rule) — that settled state is the setup for ArrowUp at the
  // top edge: a step back exactly one page, landing at page 61's bottom
  // edge.
  const landedTop62 = await s.waitFor(`
    const box = document.querySelector('.reader-single');
    return box && ${fieldLabel} === ${JSON.stringify(pageLabel(62, count))} && box.scrollTop <= 2 ? true : null;
  `, { timeout: 8000 });
  if (!landedTop62) throw new Error("the ArrowDown edge step did not land at the top edge");
  await s.key("ArrowUp", "ArrowUp", 38);
  const arrowBack61 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(61, count))} ? true : null;`, { timeout: 10000 });
  const arrowLanded = await s.waitFor(`
    const box = document.querySelector('.reader-single');
    if (!box) return null;
    const maxScroll = box.scrollHeight - box.clientHeight;
    return maxScroll > 0 && box.scrollTop >= maxScroll - 2
      ? { scrollTop: Math.round(box.scrollTop), maxScroll }
      : null;
  `, { timeout: 8000 });
  check("AC-98: ArrowUp at a reached top edge steps back exactly one page, landing at the previous page's bottom edge",
    !!arrowBack61 && !!arrowLanded, JSON.stringify(arrowLanded));

  // ArrowLeft: the backward counterpart of ArrowRight — the strip's
  // Previous path, independent of the scroll position.
  await s.key("ArrowLeft", "ArrowLeft", 37);
  const arrowBack60 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(60, count))} ? true : null;`, { timeout: 10000 });
  check("AC-98: ArrowLeft steps back exactly one page in single mode", !!arrowBack60);

  await s.key("End", "End", 35);
  const atEnd = await waitReaderAt(s, pageLabel(count, count), { timeout: 10000 });
  check("AC-79: End reaches the last page in single mode", !!atEnd && atEnd.label === pageLabel(count, count));

  // AC-79 (DR-219, window extended to ±6 by DR-224): the pages around the
  // current one are served ahead of the navigation, audited at the request
  // boundary inside the reader window (the same observer the serving flows
  // use). Setup: jump to an interior page whose window was never served —
  // 150 is outside the continuous window that surrounded 57 and outside the
  // single-mode window that surrounded the last page. The audit: the mount
  // requests 150, the prefetch then issues the ±6 window (144…156) at the
  // current display width, movement-direction-first — this jump came from
  // the last page (192), so the backward side leads: 149 must be the first
  // neighbour requested — and no page beyond the window is ever requested.
  // "At the current width" is the released two-stage pipeline (DR-151/
  // DR-153): the preview at the clamped CSS width, the full target at
  // CSS × devicePixelRatio (ratio capped at 2, width at 4 000) — at dpr 1
  // the two stages coincide. Two timing facts the audit must handle: the
  // previous window's pages can still chain their full stages behind their
  // previews (they would leak into the audit set — drain to a quiet set
  // first, with room for a full sliding window of them), and a window
  // page's full stage is issued only after its preview resolves — the audit
  // waits for both stages of both window ends, then asserts the recorded
  // set is exactly the window at exactly those stage widths.
  await s.evaluate(BOUNDARY_SCRIPT);
  const drainRequests = async () => {
    let last = null;
    let stable = 0;
    for (let guard = 0; guard < 160 && stable < 4; guard += 1) {
      const cur = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []).sort().join("|");`);
      if (cur === last) stable += 1;
      else { stable = 0; last = cur; }
      await sleep(150);
    }
    await s.evaluate(`window.__TAURI_INTERNALS__.__pageRequested = new Set(); return true;`);
  };
  await drainRequests();
  const at150 = await fieldJumpTo(s, "150", pageLabel(150, count));
  const requested = await s.waitFor(`
    const box = document.querySelector('.reader-single .page');
    if (!box) return null;
    const displayW = Math.round(box.getBoundingClientRect().width);
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const clamp = (w) => Math.min(4000, Math.max(100, Math.round(w)));
    const previewW = Math.min(clamp(displayW), 1400);
    const targetW = clamp(displayW * ratio);
    const stages = previewW === targetW ? [previewW] : [previewW, targetW];
    const req = Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);
    const served = (p) => stages.every((w) => req.includes(p + "-" + w));
    if (!(served(144) && served(156))) return null;
    return { req, stages };
  `, { timeout: 30000 });
  const pageOf = (key) => Number(key.split("-")[0]);
  const pageSet = (keys) => new Set(keys.map(pageOf));
  const widthSet = (keys) => new Set(keys.map((k) => k.split("-").slice(1).join("-")));
  const windowPages = [];
  for (let p = 144; p <= 156; p += 1) windowPages.push(p);
  check(
    "AC-79: with page 150 mounted and served, requests for every page of 144…156 are issued at the current width, and no page beyond the window is requested (DR-224)",
    !!at150 &&
      !!requested &&
      windowPages.every((p) => pageSet(requested.req).has(p)) &&
      [...pageSet(requested.req)].every((p) => p >= 144 && p <= 156) &&
      JSON.stringify([...widthSet(requested.req)].map(Number).sort((a, b) => a - b)) ===
        JSON.stringify([...requested.stages].sort((a, b) => a - b)),
    `requests: ${JSON.stringify(requested?.req ?? null)}, stages: ${JSON.stringify(requested?.stages ?? null)}`,
  );
  check(
    "AC-79: the window is queued movement-direction-first — this jump came from 192, so the backward side leads: 149 is the first neighbour requested (DR-224)",
    !!requested && pageOf(requested.req.find((k) => pageOf(k) !== 150) ?? "") === 149,
    `request order: ${JSON.stringify(requested?.req ?? null)}`,
  );

  // The served-window payoff: a prev/next step from a served page presents
  // the new page's image with no serving gap — the mount adds no new
  // app_pdf_page request for it (the window page is already fetched at this
  // width; requestPage no-ops).
  const beforePrev = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);`);
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Previous page"]'));
  const landed149 = await s.waitFor(`
    const img = document.querySelector('.reader-single .page img');
    if (!(img && img.complete && img.naturalWidth > 0 && img.getAttribute('alt') === 'Page 149')) return null;
    return ${fieldLabel};
  `, { timeout: 3000 });
  const afterPrev = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);`);
  const newAfterPrev = afterPrev.filter((k) => !beforePrev.includes(k));
  check(
    "AC-79: a prev step from a served page presents the new page's image with no serving gap — no new request for 149 (DR-224)",
    landed149 === pageLabel(149, count) && !newAfterPrev.some((k) => k.split("-")[0] === "149"),
    `new requests: ${JSON.stringify(newAfterPrev)}`,
  );
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Next page"]'));
  const landed150 = await s.waitFor(`
    const img = document.querySelector('.reader-single .page img');
    if (!(img && img.complete && img.naturalWidth > 0 && img.getAttribute('alt') === 'Page 150')) return null;
    return ${fieldLabel};
  `, { timeout: 3000 });
  const afterNext = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);`);
  const newAfterNext = afterNext.filter((k) => !afterPrev.includes(k));
  check(
    "AC-79: the next step back presents page 150's image with no serving gap — no new request for 150 (DR-224)",
    landed150 === pageLabel(150, count) && !newAfterNext.some((k) => k.split("-")[0] === "150"),
    `new requests: ${JSON.stringify(newAfterNext)}`,
  );

  // The window follows the reader: a six-step forward walk inside it stays
  // gap-free — every landed page was already served when its step ran. The
  // window slides with each step, so new requests may appear for pages the
  // walk has not reached yet; none of them may name the landed page.
  let walkClean = true;
  const walkDetail = [];
  for (let step = 1; step <= 6; step += 1) {
    const walkPage = 150 + step;
    const beforeStep = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);`);
    await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Next page"]'));
    const landed = await s.waitFor(`
      const img = document.querySelector('.reader-single .page img');
      if (!(img && img.complete && img.naturalWidth > 0 && img.getAttribute('alt') === 'Page ${walkPage}')) return null;
      return ${fieldLabel};
    `, { timeout: 3000 });
    const afterStep = await s.evaluate(`return Array.from(window.__TAURI_INTERNALS__.__pageRequested ?? []);`);
    const newForLanded = afterStep.filter((k) => !beforeStep.includes(k) && Number(k.split("-")[0]) === walkPage);
    if (landed !== pageLabel(walkPage, count) || newForLanded.length > 0) {
      walkClean = false;
      walkDetail.push({ page: walkPage, landed, newForLanded });
    }
  }
  check("AC-79: a six-step forward walk inside the window stays gap-free — no new request names a landed page (DR-224)",
    walkClean, `walk: ${JSON.stringify(walkDetail)}`);

  // The flow's remaining half runs at the document's end, as before:
  // re-establish the last page before the centering test (the existing
  // mode-switch-back check names the last page).
  const atEndBeforeCenter = await fieldJumpTo(s, String(count), pageLabel(count, count));
  if (!atEndBeforeCenter) throw new Error("the re-jump to the last page before the centering test failed");

  // AC-92 (DR-205), single mode: at fit width the page spans the content
  // box; one zoom step below fit width it centers with equal margins.
  const singleCenter = await centeringBelowFit(s, ".reader-single", ".page");
  check("AC-92: single mode centers the page below fit width and spans the content box at fit width",
    centeringOk(singleCenter.fit, singleCenter.below), JSON.stringify(singleCenter));

  // Switching back to continuous restores the released stack at the current
  // page (AC-79) — the mount and scroll state are the AC-65 shape.
  const backCont = await clickMode(s, "Continuous");
  const cont = await waitReaderAt(s, pageLabel(count, count), { timeout: 10000 });
  check("AC-79: switching back to continuous restores the released stack at the current page",
    backCont && !!cont && cont.label === pageLabel(count, count) && cont.scrollTop > 0 && cont.mounted >= 1,
    cont ? `label: ${JSON.stringify(cont.label)}, scrollTop: ${cont.scrollTop}, mounted: ${cont.mounted}` : "no state");

  // The arrow keys in continuous (AC-98): ArrowRight/ArrowLeft jump
  // through the store's goToPage, ArrowDown scrolls the stack by the
  // notch. Setup: an interior page (the last page has no next), focus
  // dropped to the document by a click on a visible page area — the same
  // gesture as above.
  const at100 = await fieldJumpTo(s, "100", pageLabel(100, count));
  if (!at100) throw new Error("the continuous arrow setup failed: the jump to page 100 failed");
  const contPageAt = await s.evaluate(`
    const page = document.querySelector('.reader-scroll .page');
    const r = page.getBoundingClientRect();
    const top = Math.max(r.top, 60) + 20;
    const bottom = Math.min(r.bottom, window.innerHeight - 70) - 20;
    return { x: Math.round(r.left + r.width / 2), y: Math.round((top + bottom) / 2) };
  `);
  await s.clickAt(contPageAt.x, contPageAt.y);
  const contBefore = await s.evaluate(`
    const sc = document.querySelector('.reader-scroll');
    return { scrollTop: Math.round(sc.scrollTop), label: ${fieldLabel} };
  `);
  await s.key("ArrowDown", "ArrowDown", 40);
  await sleep(250);
  const contAfterDown = await s.evaluate(`
    const sc = document.querySelector('.reader-scroll');
    return { scrollTop: Math.round(sc.scrollTop), label: ${fieldLabel} };
  `);
  check("AC-98: ArrowDown in continuous scrolls the stack by the notch, the current page unchanged",
    contAfterDown.label === pageLabel(100, count) &&
      Math.abs(contAfterDown.scrollTop - (contBefore.scrollTop + 100)) <= 2,
    JSON.stringify({ contBefore, contAfterDown }));
  await s.key("ArrowRight", "ArrowRight", 39);
  const contRight = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(101, count))} ? true : null;`, { timeout: 5000 });
  check("AC-98: ArrowRight in continuous jumps to the next page", !!contRight);
  await s.key("ArrowLeft", "ArrowLeft", 37);
  const contLeft = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(100, count))} ? true : null;`, { timeout: 5000 });
  check("AC-98: ArrowLeft in continuous jumps back to the previous page", !!contLeft);
  // Restore the state the checks below expect: the reader at the last
  // page at the document's bottom edge.
  const atEndRestored = await fieldJumpTo(s, String(count), pageLabel(count, count));
  if (!atEndRestored) throw new Error("the re-jump to the last page after the continuous arrow checks failed");

  // AC-92 (DR-205), continuous mode: each page centers in the stack below
  // fit width; at fit width the pages span the content box.
  const contCenter = await centeringBelowFit(s, ".reader-scroll", ".page");
  check("AC-92: continuous centers each page below fit width and spans the content box at fit width",
    centeringOk(contCenter.fit, contCenter.below), JSON.stringify(contCenter));

  // The zoom cycle above ran at the document's bottom edge: shrinking the
  // pages clamps the scroll (measured: 192 → 144), and the facing entry
  // would then test the wrong state — its bottom-clamped outcome happens
  // to look like the expected one. Re-establish the state the requirement
  // names: the reader at the last page.
  const atEndAgain = await fieldJumpTo(s, String(count), pageLabel(count, count));
  if (!atEndAgain) throw new Error("the re-jump to the last page before the facing test failed");

  // AC-80 (DR-180), facing mode: entering it while the store is at page 192
  // lands on the pair containing it; the field names that row's first page
  // (191), the row semantics DR-180 chose.
  const toFacing = await clickMode(s, "Facing pages");
  const pairOfEnd = await waitReaderAt(s, pageLabel(count - 1, count), { timeout: 10000 });
  check("AC-80: entering facing mode lands on the pair containing the current page and names its first page",
    toFacing && !!pairOfEnd && pairOfEnd.label === pageLabel(count - 1, count),
    `label: ${JSON.stringify(pairOfEnd?.label ?? null)}`);

  await s.key("Home", "Home", 36);
  // The probe waits for the state it asserts: the window at the top of the
  // document (the Home jump landed), its first row served — the mount
  // window spans several rows, so the first mounted row is only the
  // document's first row once the scroll has settled at the top.
  const rows = await s.waitFor(`
    const sc = document.querySelector('.reader-scroll');
    const rowEls = Array.from(sc.querySelectorAll('.row'));
    const first = rowEls.find((r) => r.querySelectorAll('.page').length > 0);
    if (!first) return null;
    const row = Array.from(first.querySelectorAll('.page')).map((p) => {
      const img = p.querySelector('img');
      const r = p.getBoundingClientRect();
      return {
        alt: img?.getAttribute('alt') ?? p.querySelector('.page-placeholder')?.getAttribute('aria-label') ?? null,
        x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
        loaded: !!(img && img.complete && img.naturalWidth > 0),
      };
    });
    if (row[0].alt !== "Page 1" || !row.every((p) => p.loaded)) return null;
    return { row, client: sc.clientWidth };
  `, { timeout: 10000 });
  const pairOk = !!rows && rows.row.length === 2 &&
    rows.row[0].alt === "Page 1" && rows.row[1].alt === "Page 2" &&
    rows.row[0].right <= rows.row[1].x &&
    rows.row.every((p) => p.loaded && Math.abs(p.w - rows.row[0].w) <= 1) &&
    rows.row.every((p) => Math.abs(p.h / p.w - FIXTURE_RATIO) <= 0.01);
  check("AC-80: facing lays consecutive pairs (1|2, 3|4, …) side by side at the fixture's page geometry",
    pairOk, JSON.stringify(rows));
  const pairGap = rows ? rows.row[1].x - rows.row[0].right : null;
  const fitCap = rows ? (rows.client - 12) / 2 : null;
  check("AC-80: fit-width fits the pair to the viewport (each page ≤ (viewport − 12 px) / 2) with the standard 12 px pair gap",
    pairOk && rows.row[0].w <= fitCap && Math.abs(pairGap - 12) <= 1,
    `page widths ${JSON.stringify(rows?.row.map((p) => p.w))}, cap ${fitCap}, gap ${pairGap}`);

  // AC-92 (DR-205), facing mode: the pair row centers below fit width; at
  // fit width the row spans the content box.
  const facingCenter = await centeringBelowFit(s, ".reader-scroll", ".row");
  check("AC-92: facing centers the pair row below fit width and spans the content box at fit width",
    centeringOk(facingCenter.fit, facingCenter.below), JSON.stringify(facingCenter));

  // Pair navigation: next and PgDn move one row (UI-34/DR-180).
  await clickReaderControl(s, () => document.querySelector('.reader-controls button[aria-label="Next page"]'));
  const at3 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(3, count))} ? true : null;`, { timeout: 5000 });
  check("AC-80: next moves one pair in facing mode", !!at3);
  await s.key("PageDown", "PageDown", 34);
  const at5 = await s.waitFor(`return ${fieldLabel} === ${JSON.stringify(pageLabel(5, count))} ? true : null;`, { timeout: 5000 });
  check("AC-80: PgDn moves one pair in facing mode", !!at5);

  // Entering page 60 opens the pair containing it; the field shows 59.
  const atPair60 = await fieldJumpTo(s, "60", pageLabel(59, count));
  const pairMounted = await s.evaluate(`
    return Array.from(document.querySelectorAll('.reader-scroll .row'))
      .map((r) => Array.from(r.querySelectorAll('.page')).map((p) =>
        p.querySelector('img')?.getAttribute('alt') ?? p.querySelector('.page-placeholder')?.getAttribute('aria-label') ?? null))
      .filter((alts) => alts.includes('Page 59') || alts.includes('Page 60'));
  `);
  check("AC-80: entering page 60 opens the pair containing it and the page field shows that pair's first page (59)",
    !!atPair60 && pairMounted.some((alts) => alts.includes("Page 59") && alts.includes("Page 60")),
    JSON.stringify(pairMounted));

  // A new reader window opens in continuous regardless of the previous
  // window's mode (DR-181: a mode is session state of its own window).
  const second = await cOpenReader("multi-012");
  await second.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  const modes2 = await modeButtons(second.session);
  check("AC-80: a new reader window opens in continuous regardless of the previous window's mode",
    modes2.length === 3 && modes2[1].pressed && !modes2[0].pressed && !modes2[2].pressed,
    JSON.stringify(modes2));
  await second.session.key("Escape", "Escape", 27);
  await cWaitReaderId(second.id, false);

  // The unpaired case (UI-34): the 1-page special fixture renders alone in
  // facing mode. Imported directly, the way flowReaderErrors imports
  // malformed.pdf; its title is the filename fallback, so the search finds
  // exactly this record.
  const specialFile = join(FIXTURE_SPECIAL, "info-none.pdf");
  const beforeTotal = Number(String(await cMainEval(EVAL.docTotal)).replace(/[^0-9]/g, ""));
  await cInvoke("library_import_paths", { paths: [specialFile], tagIds: [] });
  const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const imported = await cMainWait(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === ${JSON.stringify(grouped(beforeTotal + 1))} ? true : null;`,
    { timeout: 15000 },
  );
  if (!imported) throw new Error("the 1-page special fixture was not imported");
  try {
    const one = await cOpenReader("info-none");
    await one.session.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
    await clickMode(one.session, "Facing pages");
    const alone = await one.session.waitFor(`
      const rows = Array.from(document.querySelectorAll('.reader-scroll .row'));
      if (rows.length !== 1) return null;
      const pages = Array.from(rows[0].querySelectorAll('.page'));
      if (pages.length !== 1) return null;
      const img = pages[0].querySelector('img');
      if (!(img && img.complete && img.naturalWidth > 0)) return null;
      return {
        alt: img.getAttribute('alt'),
        label: ${fieldLabel},
      };
    `, { timeout: 8000 });
    check("AC-80: a 1-page document renders unpaired, alone, in facing mode",
      !!alone && alone.alt === "Page 1" && alone.label === pageLabel(1, 1), JSON.stringify(alone));
    await one.session.key("Escape", "Escape", 27);
    await cWaitReaderId(one.id, false);
  } finally {
    const row = await cRow("info-none");
    if (row) await cDeleteViaUi(row.x, row.y);
    await cMainWait(
      `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === ${JSON.stringify(grouped(beforeTotal))} ? true : null;`,
      { timeout: 15000 },
    );
    await cClearSearch();
  }

  await s.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);
}

// AC-73 + AC-75 (D19/NFR-09, SPEC-v0.0.7 §3.1/§3.4): the measured rows,
// with the baseline's method (DR-174): the asserted app-process CPU from
// Get-Process on the app process (the scope the baseline rows carry — see
// the note on appProcessCpuMs), the full process tree measured alongside
// and reported, served pages counted from the reader cache directory,
// renderer metrics read at result.metrics, dropped frames and long tasks
// from in-page samplers.
// AC-73/AC-75 measure the APP PROCESS: every product cost they guard
// (pdfium raster, PNG encode, cache write) runs inside pdfkeeper.exe, and
// the baseline rows they compare against (M1 ≈ 447 ms/page, M2 ≈ 0.03 s)
// carry the same scope — the baseline's own note separates the WebView2
// processes' ≈ 0.7–0.9 s of page-image decode from the app-process row.
// The full process tree (app + WebView2 browser/renderer/GPU) is measured
// alongside and reported in the detail, never asserted against.
function appProcessCpuMs() {
  const script =
    `$p = Get-Process -Id ${cdpApp.pid} -ErrorAction SilentlyContinue; if ($p) { [math]::Round($p.CPU * 1000) }`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  const v = Number(String(r.stdout).trim());
  return Number.isFinite(v) ? v : null;
}
function appTreeCpuMs() {
  const script =
    `$all = Get-CimInstance Win32_Process; $kids = @{}; foreach ($p in $all) { $k = [int]$p.ParentProcessId; if (-not $kids.ContainsKey($k)) { $kids[$k] = @() }; $kids[$k] += [int]$p.ProcessId }; ` +
    `$q = New-Object System.Collections.Generic.Queue[int]; $q.Enqueue(${cdpApp.pid}); $sum = 0.0; ` +
    `while ($q.Count -gt 0) { $id = $q.Dequeue(); $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc) { $sum += $proc.CPU }; if ($kids.ContainsKey($id)) { foreach ($c in $kids[$id]) { $q.Enqueue($c) } } }; ` +
    `[math]::Round($sum * 1000)`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  const v = Number(String(r.stdout).trim());
  return Number.isFinite(v) ? v : null;
}
// Served pages at the cache directory the serving writes through: the
// `<page>-<width>.png` keys, distinct page numbers (the two-stage pattern
// writes a preview and a full file per page — the baseline counts pages).
function readerCacheKeys(id) {
  const dir = join(DATA_DIR, "reader", String(id));
  if (!existsSync(dir)) return new Set();
  return new Set(readdirSync(dir).filter((n) => n.endsWith(".png")).map((n) => n.slice(0, -4)));
}
function readerServedPages(id) {
  return new Set([...readerCacheKeys(id)].map((k) => Number(k.split("-")[0])));
}
function readerRecentServing(id, quietMs) {
  const dir = join(DATA_DIR, "reader", String(id));
  if (!existsSync(dir)) return 0;
  const now = Date.now();
  return readdirSync(dir).filter((n) => n.endsWith(".png") && now - statSync(join(dir, n)).mtimeMs < quietMs).length;
}
async function cReaderServingQuiet(id, { quietMs = 1500, timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  let quietPolls = 0;
  while (quietPolls < 2) {
    quietPolls = readerRecentServing(id, quietMs) === 0 ? quietPolls + 1 : 0;
    if (Date.now() > deadline) return false;
    await sleep(250);
  }
  return true;
}
// Every page the boundary observer recorded as requested has its cache file.
async function cReaderServingSettled(session, id, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const requested = await session.evaluate(`return window.__TAURI_INTERNALS__.__pageRequested ? Array.from(window.__TAURI_INTERNALS__.__pageRequested) : [];`);
    const served = readerCacheKeys(id);
    if (requested.every((key) => served.has(key))) return true;
    if (Date.now() > deadline) return false;
    await sleep(250);
  }
}
async function resetServeCounters(session) {
  await session.evaluate(`
    window.__TAURI_INTERNALS__.__pageServeCalls = 0;
    window.__TAURI_INTERNALS__.__pageRequested = new Set();
    return true;
  `);
}
async function requestedPageCount(session) {
  const keys = await session.evaluate(`return window.__TAURI_INTERNALS__.__pageRequested ? Array.from(window.__TAURI_INTERNALS__.__pageRequested) : [];`);
  return new Set(keys.map((k) => Number(k.split("-")[0]))).size;
}
// The wheel gestures the baseline scenarios script: Input.dispatchMouseEvent
// over the stack's centre, the baseline cadence (120 ms between steps).
async function wheelSteps(session, { steps, deltas, interval = 120 }) {
  let at = null;
  try {
    at = await session.evaluate(`
    const r = document.querySelector('.reader-scroll').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  `);
  } catch { /* reported below with the target's real state */ }
  if (!at) {
    // The failure's evidence: which surface the window actually shows.
    const why = await session.evaluate(`return {
      title: document.title,
      url: location.href,
      hasSingle: !!document.querySelector('.reader-single'),
      hasControls: !!document.querySelector('.reader-controls'),
      hasError: !!document.querySelector('.error-state'),
      body: document.body.className,
      text: document.body.textContent.slice(0, 120),
    };`);
    throw new Error(`no reader scroller to wheel over: ${JSON.stringify(why)}`);
  }
  for (let i = 0; i < steps; i++) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY: deltas[i % deltas.length],
    });
    await sleep(interval);
  }
}
// CDP metrics read at result.metrics (DR-174's correction).
async function cdpPerfMetrics(session) {
  await session.send("Performance.enable");
  const reply = await session.send("Performance.getMetrics");
  const out = {};
  for (const metric of reply.result?.metrics ?? []) out[metric.name] = metric.value;
  return out;
}
// In-page samplers (the baseline's method): an rAF frame probe flagging
// intervals over the 25 ms jank threshold, and a longtask observer.
async function installInPageSamplers(session) {
  await session.evaluate(`
    window.__frameProbe = { total: 0, dropped: 0 };
    if (!window.__frameProbeRunning) {
      window.__frameProbeRunning = true;
      let last = 0;
      const tick = (t) => {
        const probe = window.__frameProbe;
        if (last) { probe.total++; if (t - last > 25) probe.dropped++; }
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    window.__longTasks = 0;
    try { new PerformanceObserver((l) => { window.__longTasks += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch {}
    return true;
  `);
}

async function flowReaderPerformance() {
  const count192 = multiDoc("multi-192.pdf").pages;

  // AC-73 / M1 — cold forward scroll on multi-192, from the top, the
  // baseline scenario (100 wheel steps × 400 px @ 120 ms). The NFR-08
  // page-jump row is measured in this flow too (AC-73's third clause).
  const opened = await cOpenReader("multi-192");
  const s = opened.session;
  await s.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  await s.evaluate(BOUNDARY_SCRIPT);

  await s.evaluate(`const f = document.querySelector('.reader-controls input[aria-label]'); f.focus(); f.select(); return true;`);
  await s.insertText("96");
  const jumpedAt = Date.now();
  await s.key("Enter", "Enter", 13);
  const jumpedLabel = await s.waitFor(`
    const img = document.querySelector('.page img[alt="Page 96"]');
    if (!(img && img.complete && img.naturalWidth > 0)) return null;
    return ${fieldLabel};
  `, { timeout: 8000 });
  timingRow("page jump → new image visible (192 pages)", Date.now() - jumpedAt, 300, "page field 1 → 96 (performance flow, AC-73)");
  check("AC-73: the page-jump row measured in the performance flow reaches page 96", jumpedLabel === pageLabel(96, count192),
    `label: ${JSON.stringify(jumpedLabel)}`);

  // Let every in-flight serving (initial mount window + jump window) land
  // before the measured run starts, so its files and its CPU stay out.
  const quietBefore = await cReaderServingQuiet(opened.id);
  await resetServeCounters(s);
  const pagesBefore = readerServedPages(opened.id);
  const cpuBefore = appProcessCpuMs();
  const cpuBeforeTree = appTreeCpuMs();

  // Back to the top (the released Home), then the scripted cold scroll.
  // The jump left focus in the page field, where the guard gives the keys
  // to the field; clicking the already-active mode button is a no-op for
  // the store (setViewMode ignores the same mode) and puts focus on a
  // non-text control, like a user tabbing out.
  await clickMode(s, "Continuous");
  await s.key("Home", "Home", 36);
  await waitReaderAt(s, pageLabel(1, count192), { timeout: 8000 });
  await wheelSteps(s, { steps: 100, deltas: [400] });
  // The serving the run triggered must finish before the CPU window closes,
  // so every served page's cost is inside the measured delta.
  const quietAfter = await cReaderServingQuiet(opened.id);
  const settled = await cReaderServingSettled(s, opened.id);
  const cpuAfter = appProcessCpuMs();
  const treeAfter = appTreeCpuMs();
  const requested = await requestedPageCount(s);
  const served = new Set([...readerServedPages(opened.id)].filter((p) => !pagesBefore.has(p))).size;
  const cpuMs = cpuBefore !== null && cpuAfter !== null ? cpuAfter - cpuBefore : null;
  const cpuPerPage = served > 0 && cpuMs !== null ? cpuMs / served : null;
  check("AC-73: cold-scroll page serving costs ≤ 350 ms of app-process CPU per served page (budget calibrated to the measured method, DR-202; baseline M1 ≈ 447 ms/page)",
    !!quietBefore && !!quietAfter && served > 0 && cpuPerPage !== null && cpuPerPage <= 350,
    `served ${served} pages, app-process CPU ${cpuMs} ms, per served page ${cpuPerPage === null ? "n/a" : cpuPerPage.toFixed(1)} ms — breakdown (DR-202): pipeline standalone ≈ 229–237 ms/page, remainder is the request plumbing (invoke dispatch + WebView2 asset streaming + queue handling); full process tree ${treeAfter - (cpuBeforeTree ?? 0)} ms for comparison`);
  check("AC-73: every page the mount window requested is served by the end of the run (served-page count = requested count)",
    !!settled && requested > 0 && served === requested,
    `requested ${requested}, served ${served}`);
  await s.key("Escape", "Escape", 27);
  await cWaitReaderId(opened.id, false);

  // AC-75 / M2 — warm back-and-forth scroll on multi-1000 over the
  // already-visited range (80 steps × 400 px @ 120 ms): the cache holds
  // everything the mount window asks for, and the run is clean.
  const scale = await cOpenReader("multi-1000");
  const k = scale.session;
  await k.waitFor(FIRST_PAGE_READY, { timeout: 8000 });
  await k.evaluate(BOUNDARY_SCRIPT);
  await installInPageSamplers(k);
  const quietWarm = await cReaderServingQuiet(scale.id);
  if (!quietWarm) throw new Error("the initial serving on multi-1000 never settled");
  await resetServeCounters(k);
  await k.evaluate(`window.__frameProbe = { total: 0, dropped: 0 }; window.__longTasks = 0; return true;`);
  const pages0 = readerServedPages(scale.id);
  const cpu0 = appProcessCpuMs();
  const tree0 = appTreeCpuMs();
  const metrics0 = await cdpPerfMetrics(k);
  await wheelSteps(k, { steps: 80, deltas: [400, -400] });
  const cpu1 = appProcessCpuMs();
  const metrics1 = await cdpPerfMetrics(k);
  const servedWarm = new Set([...readerServedPages(scale.id)].filter((p) => !pages0.has(p))).size;
  const requestsWarm = await requestedPageCount(k);
  const cpuWarm = cpu0 !== null && cpu1 !== null ? cpu1 - cpu0 : null;
  const treeWarm = appTreeCpuMs() - (tree0 ?? 0);
  const scriptMs = (metrics1.ScriptDuration - metrics0.ScriptDuration) * 1000;
  const frames = await k.evaluate(`return window.__frameProbe ?? null;`);
  const longTasks = await k.evaluate(`return window.__longTasks ?? 0;`);
  check("AC-75: warm back-and-forth scroll serves 0 pages (the cache holds everything the mount window asks for)",
    servedWarm === 0 && requestsWarm === 0, `served ${servedWarm}, requested ${requestsWarm}`);
  check("AC-75: warm-scroll cleanliness — app-process CPU ≤ 0.1 s, ScriptDuration ≤ 0.2 s, 0 dropped frames, 0 long tasks",
    cpuWarm !== null && cpuWarm <= 100 && scriptMs <= 200 &&
      !!frames && frames.dropped === 0 && longTasks === 0,
    `app CPU ${cpuWarm} ms (full process tree ${treeWarm} ms for comparison), ScriptDuration ${scriptMs.toFixed?.(1) ?? scriptMs} ms, dropped ${frames ? `${frames.dropped} / ${frames.total}` : "n/a"}, long tasks ${longTasks}`);
  await k.key("Escape", "Escape", 27);
  await cWaitReaderId(scale.id, false);

  // D24 (v0.0.8, the v0.0.6 known-issue measurement): the built-in reader's
  // first-open activation, 10 fresh-window runs on the core fixture. In the
  // lane run (a fresh instance, the flow's own multi-tier import just done,
  // the cover backfill still draining) the first of the ten is also the
  // process's first open — the exact state the known issue describes. Every
  // row is recorded; the claim is that each stays inside the activation
  // budget (NFR-08, the 800 ms row the activation measurement uses).
  const firstOpenRows = [];
  for (let run = 0; run < 10; run += 1) {
    const fresh = await cOpenReader("multi-192");
    const painted = await fresh.session.waitFor(FIRST_PAGE_READY, { timeout: 15000 });
    const ms = Date.now() - fresh.openedAt;
    firstOpenRows.push(ms);
    if (painted !== pageLabel(1, count192)) {
      await fresh.session.key("Escape", "Escape", 27);
      await cWaitReaderId(fresh.id, false);
      throw new Error(`D24 run ${run + 1} did not paint page 1 (readout: ${JSON.stringify(painted)})`);
    }
    await fresh.session.key("Escape", "Escape", 27);
    await cWaitReaderId(fresh.id, false);
  }
  const firstOpenMax = Math.max(...firstOpenRows);
  timingRow("first-open → first page, 10 fresh windows (D24 evidence — worst)", firstOpenMax, 800, "fresh windows; run 1 is the process-cold open in a lane run");
  check("D24 / NFR-08: first-open activation stays inside the 800 ms budget across 10 fresh windows",
    firstOpenMax <= 800, `rows (ms): ${JSON.stringify(firstOpenRows)}`);
}

async function flowDarkRamp() {
  // AC-81 source half (the AC-70 method, inverted by UI-35): the light block
  // declares the §3.7 Alucard mapping including the derived --selection-tint
  // row (the AC-81 amendment of DR-220), the dark block is byte-identical to
  // v0.0.6 as shipped except the one added --selection-tint declaration,
  // `color-scheme: light` stays, and the theme mechanism is untouched. The
  // Settings dialog and the theme menu are NOT part of this check: UI-17
  // (DR-190/DR-191) changes them in this release by design, and
  // flowThemeAndSettings asserts them (DR-198 item 2). The baseline is the
  // v0.0.6 Ship commit, found by its message (the repository carries no
  // tags). AC-82's numbers live in `design-tokens.test.ts`; this flow proves
  // the ramps are what the real app actually paints — including AC-97's
  // selection treatment (UI-38/DR-220): the selected row and card render the
  // ramp's --selection-tint ground and the inset accent ring in both ramps,
  // while the hover grounds and the menu-hover tint stay unchanged.
  const base = spawnSync("git", ["log", "--format=%H", "-1", "--grep=ship(v0.0.6)"], { cwd: root, encoding: "utf8" }).stdout.trim();
  if (!base) throw new Error("the v0.0.6 Ship commit was not found for the AC-81 baseline");
  const shown = spawnSync("git", ["show", `${base}:ui/src/lib/design-tokens.css`], { cwd: root, encoding: "utf8" });
  const current = readFileSync(join(root, "ui/src/lib/design-tokens.css"), "utf8");
  // Declarations are asserted as declarations (the shipped AC-70 mechanism):
  // comments may reword, the token lines are the contract.
  const decls = (text, selector) => {
    const at = text.indexOf(selector);
    if (at < 0) throw new Error(`token block "${selector}" not found`);
    const open = text.indexOf("{", at);
    const close = text.indexOf("}", open);
    const out = new Map();
    for (const match of text.slice(open, close).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out.set(match[1], match[2].trim());
    return out;
  };
  const LIGHT = {
    "surface-0": "#fffbeb", // §3.7 Background
    "surface-1": "#ece9df", // §3.7 BackgroundColorLighter
    "surface-2": "#dedccf", // §3.7 BackgroundColorLight
    "surface-3": "#ceccc0", // §3.7 BackgroundColorDark
    "border-hairline": "#e2deca", // §3.7 LineHighlightColor
    "border-strong": "#bcbab3", // §3.7 BackgroundColorDarker
    "text-primary": "#1f1f1f", // §3.7 Foreground
    "text-secondary": "#4e4a37", // §3.7 substitution: Comment darkened
    "text-tertiary": "#59543e", // §3.7 substitution: Comment darkened, lighter
    "accent": "#644ac9", // §3.7 Purple
    "accent-hover": "#4e399c", // §3.7 substitution: Purple darkened
    "accent-quiet": "rgba(100, 74, 201, 0.12)", // §3.7 selection / menu-hover tint
    "selection-tint": "rgba(100, 74, 201, 0.20)", // §3.17/DR-220 (UI-38's selection ground — the guard-confirmed value)
    "text-on-accent": "#fffbeb", // §3.7 Background
    "warning": "#a34d14", // §3.7 Orange
    "warning-hover": "#8a4111", // §3.7 substitution: Orange darkened
    "warning-quiet": "rgba(163, 77, 20, 0.12)", // §3.7 Orange at the shipped quiet alpha
    "danger": "#cb3a2a", // §3.7 Red (fill/border role)
    "danger-hover": "#a62f22", // §3.7 substitution: Red darkened (the rendered text value, DR-198)
    "danger-quiet": "rgba(203, 58, 42, 0.12)", // §3.7 Red at the shipped quiet alpha
    "success": "#14710a", // §3.7 Green
    "shadow-overlay": "0 8px 24px rgba(0, 0, 0, 0.18)", // unchanged (not a palette role)
    "scrollbar-thumb": "#bcbab3", // §3.7 BackgroundColorDarker (the UI-11 rule)
    "scrollbar-track": "transparent", // unchanged (not a palette role)
  };
  const colorNames = new Set(Object.keys(LIGHT));
  const curLight = decls(current, ":root {");
  const baseLight = shown.status === 0 ? decls(shown.stdout, ":root {") : new Map();
  const mappingMisses = Object.entries(LIGHT).filter(([name, value]) => curLight.get(name) !== value).map(([name]) => name);
  check(
    "AC-81: the light ramp declares the §3.7 mapping",
    shown.status === 0 && mappingMisses.length === 0,
    `baseline: ${base}${mappingMisses.length ? ` missing/different: ${mappingMisses.join(", ")}` : ""}`,
  );
  // v0.0.7 amends the row metrics by design (UI-03 as modified by DR-189) and
  // v0.0.8 re-derives them (UI-45/DR-278): the row token is 122 px — cover
  // 75×106 plus the 8 px insets — the row-cover-gap token stays, and the card
  // content inset (UI-03 as modified by DR-245) adds the card-content-pad
  // token. The audit pins exactly that amended set — every other non-color
  // declaration must stay byte-identical to v0.0.6.
  const v07Amended = new Map([["row-height", "122px"], ["row-cover-gap", "8px"], ["card-content-pad", "5px"]]);
  const extra = [...curLight.keys()].filter(
    (name) => !colorNames.has(name) && !baseLight.has(name) && !v07Amended.has(name),
  );
  const dropped = [...colorNames].filter((name) => !curLight.has(name));
  check(
    "AC-81: the light color-token set is exactly the mapped one",
    extra.length === 0 && dropped.length === 0,
    `extra: ${extra.join(", ") || "none"} dropped: ${dropped.join(", ") || "none"}`,
  );
  const changedOther = [...baseLight.keys()].filter(
    (name) => !colorNames.has(name) && curLight.get(name) !== (v07Amended.get(name) ?? baseLight.get(name)),
  );
  const missingAmended = [...v07Amended].filter(([name, value]) => curLight.get(name) !== value).map(([name]) => name);
  check("AC-81: the metrics, type and motion declarations are unchanged from v0.0.6 except the DR-189 row and DR-245 card-inset amendments",
    changedOther.length === 0 && missingAmended.length === 0,
    `${changedOther.join(", ")}${missingAmended.length ? ` amended-not-pinned: ${missingAmended.join(", ")}` : ""}`);
  const rootAt = current.indexOf(":root {");
  check("AC-81: color-scheme: light stays", /color-scheme:\s*light/.test(current.slice(rootAt, current.indexOf("}", rootAt))));
  const curDark = decls(current, ':root[data-theme="dark"] {');
  const baseDark = decls(shown.stdout, ':root[data-theme="dark"] {');
  // AC-81's amendment (DR-220): the one addition UI-38 names — the derived
  // --selection-tint declaration — is the only permitted difference; every
  // other dark declaration stays byte-identical to v0.0.6 as shipped.
  const darkAdded = [...curDark.keys()].filter((name) => !baseDark.has(name));
  const darkDropped = [...baseDark.keys()].filter((name) => !curDark.has(name));
  const darkChanged = [...baseDark].filter(([name, value]) => curDark.get(name) !== value).map(([name]) => name);
  check(
    "AC-81: the dark ramp is unchanged from v0.0.6 except the added --selection-tint declaration (the DR-220 amendment)",
    shown.status === 0 &&
      darkAdded.length === 1 && darkAdded[0] === "selection-tint" &&
      curDark.get("selection-tint") === "rgba(189, 147, 249, 0.20)" &&
      darkDropped.length === 0 && darkChanged.length === 0,
    `added: ${darkAdded.join(", ") || "none"} dropped: ${darkDropped.join(", ") || "none"} changed: ${darkChanged.join(", ") || "none"}`,
  );
  const changedFiles = spawnSync(
    "git",
    ["diff", "--name-only", base, "--", "ui/src/lib/theme.ts"],
    { cwd: root, encoding: "utf8" },
  ).stdout.trim();
  check("AC-81: the theme mechanism (theme.ts) is unchanged since v0.0.6", changedFiles === "", changedFiles);

  // The measured halves: the grounds the components actually render are the
  // ramp's grounds — the same values the contrast guard measures. Light
  // first (AC-82, the new mapping), then the dark half unchanged (AC-71).
  await setupListView(2);
  await pickTheme("Light");
  const lightRamp = await currentRamp();
  check("the app applies the light ramp", lightRamp.attr === "light", `ramp: ${JSON.stringify(lightRamp)}`);

  const lightLibraryBackground = await execute(`return getComputedStyle(document.querySelector('.app')).backgroundColor;`);
  check("AC-82: the library surface renders as Background #FFFBEB", lightLibraryBackground === "rgb(255, 251, 235)", lightLibraryBackground);

  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const lightMenuPaint = await execute(`
    const menu = document.querySelector('.menu.browse-menu');
    const item = menu?.querySelector('.menu-item:not([data-active])');
    const ir = item?.getBoundingClientRect();
    return {
      ground: menu ? getComputedStyle(menu).backgroundColor : null,
      text: item ? getComputedStyle(item).color : null,
      itemPos: ir ? { x: Math.round(ir.x + ir.width / 2), y: Math.round(ir.y + ir.height / 2) } : null,
    };
  `);
  // AC-97 (the treatment applies only to selection): menu hover keeps the
  // menu-hover tint --accent-quiet, untouched by UI-38.
  if (lightMenuPaint?.itemPos) await hoverPoint(lightMenuPaint.itemPos.x, lightMenuPaint.itemPos.y);
  const lightMenuHover = await execute(`
    const item = document.querySelector('.menu.browse-menu .menu-item:hover');
    return item
      ? { painted: getComputedStyle(item).backgroundColor, token: getComputedStyle(document.documentElement).getPropertyValue('--accent-quiet').trim() }
      : null;
  `);
  await parkPointer();
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  check(
    "AC-82: menus render on BackgroundColorLighter #ECE9DF with Foreground text",
    lightMenuPaint.ground === "rgb(236, 233, 223)" && lightMenuPaint.text === "rgb(31, 31, 31)",
    JSON.stringify(lightMenuPaint),
  );
  check(
    "AC-97: menu hover still renders the menu-hover tint --accent-quiet (12 % Purple) — the selection treatment is separate (light ramp)",
    !!lightMenuHover && sameCssColor(lightMenuHover.painted, "rgba(100, 74, 201, 0.12)") && sameCssColor(lightMenuHover.token, "rgba(100, 74, 201, 0.12)"),
    JSON.stringify(lightMenuHover),
  );

  const lightRowPos = await execute(`
    // The SECOND row: the DR-246 row treatment is asserted at both of the
    // selected row's boundaries, so the flow needs a row that has a row
    // before it.
    const row = document.querySelectorAll('[data-row-id]')[1];
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { id: row.getAttribute('data-row-id'), x: Math.round(r.x + r.width / 2), y: Math.round(r.height / 2 + r.y) };
  `);
  if (!lightRowPos) throw new Error("no row available for the ground measurements");
  await hoverPoint(lightRowPos.x, lightRowPos.y);
  const lightHoverGround = await execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    return row ? getComputedStyle(row).backgroundColor : null;
  `, [lightRowPos.id]);
  await parkPointer();
  check("AC-82: a hovered row renders on the mapped hover ground #ECE9DF", lightHoverGround === "rgb(236, 233, 223)", lightHoverGround);

  await clickModifier(lightRowPos.id, { ctrlKey: true });
  // AC-97 (UI-38/DR-220, the row half re-cut by DR-246): the selected row
  // renders the dedicated selection ground — the ramp's --selection-tint
  // composite (20 % Purple, not the 12 % menu-hover tint) — and its bottom
  // separator is the single accent boundary line: the selected row and the row
  // directly before it carry the accent border-bottom, and the row carries no
  // inset ring. The painted values are compared to the tokens as the page
  // resolves them and to the §3.17 values (the shipped AC-82 mechanism,
  // re-anchored).
  const lightSelectionPaint = await execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"][data-selected]');
    if (!row) return null;
    const cs = getComputedStyle(row);
    // The row before it in the rendered list (the rows are wrapped in their
    // context-menu triggers — DOM order of the row elements is the visual
    // order regardless).
    const all = [...document.querySelectorAll('.window [data-row-id]')];
    const prev = all.indexOf(row) > 0 ? all[all.indexOf(row) - 1] : null;
    return {
      painted: cs.backgroundColor,
      bottomBorder: cs.borderBottomColor,
      noRing: cs.boxShadow === "none",
      prevBorder: prev ? getComputedStyle(prev).borderBottomColor : null,
      prevMarked: prev ? prev.hasAttribute('data-boundary-selected') : false,
      token: getComputedStyle(document.documentElement).getPropertyValue('--selection-tint').trim(),
    };
  `, [lightRowPos.id]);
  await clearSelection();
  check(
    "AC-97: a selected row renders the selection ground — the 20 % Purple tint and the single accent separator line, the row before it included, no inset ring (light ramp, DR-246)",
    !!lightSelectionPaint &&
      sameCssColor(lightSelectionPaint.painted, "rgba(100, 74, 201, 0.2)") &&
      sameCssColor(lightSelectionPaint.token, "rgba(100, 74, 201, 0.20)") &&
      sameCssColor(lightSelectionPaint.bottomBorder, "#644ac9") &&
      lightSelectionPaint.prevMarked === true &&
      sameCssColor(lightSelectionPaint.prevBorder, "#644ac9") &&
      lightSelectionPaint.noRing === true,
    JSON.stringify(lightSelectionPaint),
  );

  // AC-97, the card half (light ramp): the same treatment on a selected
  // card — the accent border and the inset ring. Select mode on for the
  // click path, restored after; back to list for the flow's remaining half.
  await setViewMode("grid");
  await click('.select-toggle');
  await clickStable(`() => document.querySelector('.card[data-row-id]')`);
  const lightCardPaint = await execute(`
    const card = document.querySelector('.card[data-selected]');
    if (!card) return null;
    const cs = getComputedStyle(card);
    const shadow = cs.boxShadow;
    // AC-83 re-derived (DR-245): the selection frame band is the card's own
    // surface — a point 3 px inside the card's top edge (inside the 5 px
    // content inset) hit-tests to the card itself, not to the cover, and the
    // cover box starts at the border + inset distance from the card's edge.
    const r = card.getBoundingClientRect();
    const spot = document.elementFromPoint(r.left + r.width / 2, r.top + 3);
    const cover = card.querySelector('.cover');
    const coverRect = cover?.getBoundingClientRect() ?? null;
    return {
      painted: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      shadow,
      ringOk: shadow.includes("rgb(100, 74, 201)") && shadow.includes("0px 0px 0px 1px") && shadow.includes("inset"),
      band: spot && !spot.closest('.cover-wrap') && (spot === card || card.contains(spot)),
      coverInset: coverRect ? Math.round(coverRect.top - r.top) : null,
    };
  `);
  check(
    "AC-83: the selected card's frame band is the card's own ground — a point inside the 5 px content inset hit-tests to the card, not the cover (DR-245)",
    !!lightCardPaint && lightCardPaint.band === true &&
      lightCardPaint.coverInset >= 5 && lightCardPaint.coverInset <= 7,
    JSON.stringify({ band: lightCardPaint?.band, coverInset: lightCardPaint?.coverInset }),
  );
  await clearSelectionIfAny();
  await click('.select-toggle');
  await setViewMode("list");
  check(
    "AC-97: a selected card renders the selection ground — the 20 % Purple tint, the accent border and the inset ring (light ramp)",
    !!lightCardPaint &&
      lightCardPaint.painted === "rgba(100, 74, 201, 0.2)" &&
      lightCardPaint.borderColor === "rgb(100, 74, 201)" &&
      lightCardPaint.ringOk,
    JSON.stringify(lightCardPaint),
  );

  // The dark measured half (AC-71) — the shipped checks, unchanged.
  await pickTheme("Dark");
  const ramp = await currentRamp();
  check("the app applies the dark ramp", ramp.attr === "dark", `ramp: ${JSON.stringify(ramp)}`);

  const libraryBackground = await execute(`return getComputedStyle(document.querySelector('.app')).backgroundColor;`);
  check("AC-71: the library surface renders as Background #282A36", libraryBackground === "rgb(40, 42, 54)", libraryBackground);

  await openMenuSure(".browse-trigger", ".menu.browse-menu");
  const menuPaint = await execute(`
    const menu = document.querySelector('.menu.browse-menu');
    const item = menu?.querySelector('.menu-item:not([data-active])');
    const ir = item?.getBoundingClientRect();
    return {
      ground: menu ? getComputedStyle(menu).backgroundColor : null,
      text: item ? getComputedStyle(item).color : null,
      itemPos: ir ? { x: Math.round(ir.x + ir.width / 2), y: Math.round(ir.y + ir.height / 2) } : null,
    };
  `);
  // AC-97 (the treatment applies only to selection): menu hover keeps the
  // menu-hover tint --accent-quiet, untouched by UI-38 (dark half).
  if (menuPaint?.itemPos) await hoverPoint(menuPaint.itemPos.x, menuPaint.itemPos.y);
  const menuHover = await execute(`
    const item = document.querySelector('.menu.browse-menu .menu-item:hover');
    return item
      ? { painted: getComputedStyle(item).backgroundColor, token: getComputedStyle(document.documentElement).getPropertyValue('--accent-quiet').trim() }
      : null;
  `);
  await parkPointer();
  await keys("Escape");
  await menuClosed(".menu.browse-menu");
  check(
    "AC-71: menus render on Background Light #343746 with Foreground text",
    menuPaint.ground === "rgb(52, 55, 70)" && menuPaint.text === "rgb(248, 248, 242)",
    JSON.stringify(menuPaint),
  );
  check(
    "AC-97: menu hover still renders the menu-hover tint --accent-quiet (8 % Purple) — the selection treatment is separate (dark ramp)",
    !!menuHover && sameCssColor(menuHover.painted, "rgba(189, 147, 249, 0.08)") && sameCssColor(menuHover.token, "rgba(189, 147, 249, 0.08)"),
    JSON.stringify(menuHover),
  );

  const rowPos = await execute(`
    // The SECOND row (the DR-246 boundary-above assertion needs one).
    const row = document.querySelectorAll('[data-row-id]')[1];
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { id: row.getAttribute('data-row-id'), x: Math.round(r.x + r.width / 2), y: Math.round(r.height / 2 + r.y) };
  `);
  if (!rowPos) throw new Error("no row available for the ground measurements");
  await hoverPoint(rowPos.x, rowPos.y);
  const hoverGround = await execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"]');
    return row ? getComputedStyle(row).backgroundColor : null;
  `, [rowPos.id]);
  await parkPointer();
  check("AC-71: a hovered row renders on Background Light #343746", hoverGround === "rgb(52, 55, 70)", hoverGround);

  await clickModifier(rowPos.id, { ctrlKey: true });
  // AC-97 (UI-38/DR-220, the row half re-cut by DR-246), dark half: the
  // selection-tint composite (Purple at 20 %, the guard-confirmed value, not
  // the 8 % menu-hover tint) and the single accent separator line on the
  // selected row and the row before it — no inset ring on rows.
  const selectionPaint = await execute(`
    const row = document.querySelector('[data-row-id="' + arguments[0] + '"][data-selected]');
    if (!row) return null;
    const cs = getComputedStyle(row);
    const all = [...document.querySelectorAll('.window [data-row-id]')];
    const idx = all.indexOf(row);
    const prev = idx > 0 ? all[idx - 1] : null;
    return {
      painted: cs.backgroundColor,
      bottomBorder: cs.borderBottomColor,
      noRing: cs.boxShadow === "none",
      prevBorder: prev ? getComputedStyle(prev).borderBottomColor : null,
      prevMarked: prev ? prev.hasAttribute('data-boundary-selected') : false,
      token: getComputedStyle(document.documentElement).getPropertyValue('--selection-tint').trim(),
    };
  `, [rowPos.id]);
  await clearSelection();
  check(
    "AC-97: a selected row renders the selection ground — the 20 % Purple tint and the single accent separator line, the row before it included, no inset ring (dark ramp, DR-246)",
    !!selectionPaint &&
      sameCssColor(selectionPaint.painted, "rgba(189, 147, 249, 0.2)") &&
      sameCssColor(selectionPaint.token, "rgba(189, 147, 249, 0.20)") &&
      sameCssColor(selectionPaint.bottomBorder, "#bd93f9") &&
      selectionPaint.prevMarked === true &&
      sameCssColor(selectionPaint.prevBorder, "#bd93f9") &&
      selectionPaint.noRing === true,
    JSON.stringify(selectionPaint),
  );

  // AC-97, the card half (dark ramp).
  await setViewMode("grid");
  await click('.select-toggle');
  await clickStable(`() => document.querySelector('.card[data-row-id]')`);
  const cardPaint = await execute(`
    const card = document.querySelector('.card[data-selected]');
    if (!card) return null;
    const cs = getComputedStyle(card);
    const shadow = cs.boxShadow;
    return {
      painted: cs.backgroundColor,
      borderColor: cs.borderTopColor,
      shadow,
      ringOk: shadow.includes("rgb(189, 147, 249)") && shadow.includes("0px 0px 0px 1px") && shadow.includes("inset"),
    };
  `);
  await clearSelectionIfAny();
  await click('.select-toggle');
  await setViewMode("list");
  check(
    "AC-97: a selected card renders the selection ground — the 20 % Purple tint, the accent border and the inset ring (dark ramp)",
    !!cardPaint &&
      cardPaint.painted === "rgba(189, 147, 249, 0.2)" &&
      cardPaint.borderColor === "rgb(189, 147, 249)" &&
      cardPaint.ringOk,
    JSON.stringify(cardPaint),
  );

  await pickTheme("System"); // the default choice, as the run found it
  const restored = await currentRamp();
  check("the theme returns to the default (the mechanism is the released one)", restored.attr === restored.os, `ramp: ${JSON.stringify(restored)}`);
}

// AC-87 (UI-37, §3.11): the six main-window surface classes each show the
// app's own tooltip — the opened tooltip node carries the same text, painted
// on the ramp's --surface-1 ground with its shadow declaration — asserted in
// both ramps (AC-82's pickTheme mechanism). The reader chrome name class runs
// in flowReaderOpen (the runtime split the user decided, DR-201); the removal
// of the native titles themselves is the unit source assertion
// (native-title.test.ts). Every hover goes through tooltipOnHover, the
// released AC-33 mechanism, extended to sample the open node's paint.
async function flowTooltipSurfaces() {
  const author = "Ada Lovelace (Countess of Lovelace, 1815–1852)";
  const notes = ("A note long enough to be ellipsized inside a list row: " + "wrapped continuation text ".repeat(20)).trimEnd();
  const fileNote = "This also deletes the PDF files themselves."; // delete.fileNote

  // Setup, ramp-independent and self-sufficient (D14): a row carrying author
  // and notes (the metadata-display fixture), a missing-file probe (the
  // relink flow's private-copy pattern), and one tag for the manager
  // row's actions. The probe is imported and immediately moved away, so the
  // rescan flags it on first sight.
  await setupListView(1);
  await searchFor("doc00300");
  await openEditorForRow("div[data-row-id]");
  await setEditorField("Author", author);
  await setEditorField("Notes", notes);
  await saveEditor();

  const probeDir = join(root, "tmp", "tooltip-probe");
  const probeFile = join(probeDir, "tipprobe.pdf");
  const awayFile = join(root, "tmp", "tooltip-probe-away.pdf");
  rmSync(probeDir, { recursive: true, force: true });
  rmSync(awayFile, { force: true });
  mkdirSync(probeDir, { recursive: true });
  copyFileSync(join(tierDir("core"), "doc00500.pdf"), probeFile);
  const before = await docCount();
  await clearSearch();
  await browseSelect("All documents");
  await execute(
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
    [[probeFile]],
  );
  const imported = await waitForEval(
    `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
    { timeout: 30000, args: [(before + 1).toLocaleString("en-US")] },
  );
  if (!imported) throw new Error(`the tooltip probe was not imported (library: ${await execute(EVAL.docTotal)})`);
  renameSync(probeFile, awayFile);
  await runRescan();
  const reported = await toastContains("1 missing document found");
  if (!reported) throw new Error("the rescan did not report the moved-away probe");
  // The probe row is one of 101 in the unfiltered list and may be outside the
  // virtualization window — the relink flow's proven pattern: filter to it by
  // filename (its title is the fixture's own, so searchFor's title claim does
  // not apply here).
  await typeInto(".search-input", "tipprobe");
  const flagged = await waitForEval(`return document.querySelector('[data-row-id][data-missing]') ? true : null;`, { timeout: 10000 });
  if (!flagged) throw new Error("the moved-away probe was not flagged missing");
  await ensureTagNames(["Tooltip Probe"]);

  // One surface, both claims: the opened tooltip node carries the expected
  // text, and its computed paint is the ramp's overlay ground with the
  // shadow present. `want` is the exact text or, for controls, a predicate
  // over the opened text (the accessible name read from the DOM first).
  const expectSurface = async (ramp, name, selector, want, opts = {}) => {
    const { tip, paint } = await tooltipOnHover(selector, opts);
    const textOk = typeof want === "function" ? want(tip) : tip === want;
    const paintOk = !!paint && paint.bg === paint.wantBg && paint.shadow !== "none";
    check(
      `AC-87 (${ramp}): ${name} shows the app's own tooltip on the ramp's --surface-1 ground with its shadow`,
      textOk && paintOk,
      `text: ${JSON.stringify(tip ?? null)?.slice(0, 90)} paint: ${JSON.stringify(paint)}`,
    );
  };

  const surfacePass = async (ramp) => {
    // Row text lines (list).
    await setupListView(1);
    await searchFor("doc00300");
    const rowReady = await waitForEval(
      `return document.querySelector('[data-row-id] .notes-line') ? true : null;`,
      { timeout: 10000 },
    );
    if (!rowReady) throw new Error("the author/notes row is not rendered for the tooltip pass");
    await expectSurface(ramp, "a clipped row's title line", "[data-row-id] .title-line", "Fixture Doc doc00300");
    await expectSurface(ramp, "a row's author line", "[data-row-id] .author-line", author);
    await expectSurface(ramp, "a row's notes line", "[data-row-id] .notes-line", notes);

    // Card text lines (grid).
    await setViewMode("grid");
    const cardReady = await waitForEval(`return document.querySelector('.card[data-row-id] .author-line') ? true : null;`, { timeout: 15000 });
    if (!cardReady) throw new Error("the author card is not rendered for the tooltip pass");
    await expectSurface(ramp, "a card's title", ".card[data-row-id] .title", "Fixture Doc doc00300");
    await expectSurface(ramp, "a card's author line", ".card[data-row-id] .author-line", author);

    // The missing state, both variants (the stored path). Filename-only
    // filter, as in the setup above.
    await typeInto(".search-input", "tipprobe");
    const flagReady = await waitForEval(`return document.querySelector('[data-row-id][data-missing] .missing-flag') ? true : null;`, { timeout: 10000 });
    if (!flagReady) throw new Error("the missing row's flag is not rendered for the tooltip pass");
    await setViewMode("list");
    await expectSurface(ramp, "the missing row flag", '[data-row-id][data-missing] .missing-flag', (t) => typeof t === "string" && t.includes("tipprobe.pdf"));
    await setViewMode("grid");
    const badgeReady = await waitForEval(`return document.querySelector('.card[data-missing] .missing-flag.over-image') ? true : null;`, { timeout: 15000 });
    if (!badgeReady) throw new Error("the missing card badge is not rendered for the tooltip pass");
    await expectSurface(ramp, "the missing card badge", ".card[data-missing] .missing-flag.over-image", (t) => typeof t === "string" && t.includes("tipprobe.pdf"));
    await setViewMode("list");

    // A tag manager row action: the tooltip equals the control's own
    // accessible name (the AC-33 survey's identity rule).
    await clearSearch();
    await browseSelect("All documents");
    await openMenuSure(".browse-trigger", ".menu.browse-menu");
    await clickMenuItem(".menu.browse-menu", "Manage tags");
    const manager = await waitForEval(`return document.querySelector('.modal .tag-row .tag-actions .icon-button') ? true : null;`, { timeout: 8000 });
    if (!manager) throw new Error("the tags manager does not render a row action for the tooltip pass");
    // The manager's row actions are display:none at rest (its own design), and
    // the kit opens focus-tooltips only for keyboard modality — after a menu
    // click the app is in pointer modality. The row's own hover renders the
    // actions: park the pointer on the row, then let the hover pass move onto
    // the action. The pointer stays inside the row the whole time, so the
    // actions stay rendered and the kit sees a real pointerenter.
    const rowSpot = await execute(`
      const el = document.querySelector('.modal .tag-row');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    `);
    if (!rowSpot) throw new Error("the tags manager renders no row for the tooltip pass");
    await wd("POST", `/session/${sessionId}/actions`, {
      actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: rowSpot.x, y: rowSpot.y }] }],
    });
    const rendered = await waitForEval(`return document.querySelector('.modal .tag-row .tag-actions .icon-button')?.getBoundingClientRect().width > 0 ? true : null;`, { timeout: 4000 });
    if (!rendered) throw new Error("the tag row actions do not render under the row hover");
    const catLabel = await execute(`return document.querySelector('.modal .tag-row .tag-actions .icon-button')?.getAttribute('aria-label') ?? null;`);
    await expectSurface(ramp, "a tag row action", ".modal .tag-row .tag-actions .icon-button", (t) => t === catLabel, { parkFirst: false });
    await keys("Escape");
    await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });

    // The delete dialog's file-note button: opened through the app's own
    // gesture (selection + Delete), cancelled right after the measurement.
    await selectFirstRows(1);
    const focused = await execute(EVAL.focusFirstRow);
    if (!focused) throw new Error("could not focus a selected row for the delete-dialog tooltip");
    await keys("Delete");
    const dialog = await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
    if (!dialog) throw new Error("the delete confirmation dialog did not open");
    await expectSurface(ramp, "the delete dialog's file-note button", ".modal .control-danger", fileNote);
    await keys("Escape");
    await waitForEval(`return document.querySelector('.modal') ? null : true;`, { timeout: 5000 });
    await clearSelection();

    // A column stepper in the View menu: accessible-name identity again.
    await openMenuSure(".view-trigger", ".menu.view-menu");
    const stepperUp = await waitForEval(`return document.querySelector('.menu.view-menu .icon-button') ? true : null;`, { timeout: 5000 });
    if (!stepperUp) throw new Error("the View menu's column stepper is not rendered for the tooltip pass");
    const stepLabel = await execute(`return document.querySelector('.menu.view-menu .icon-button')?.getAttribute('aria-label') ?? null;`);
    await expectSurface(ramp, "a column stepper control", ".menu.view-menu .icon-button", (t) => t === stepLabel);
    await keys("Escape");
    await menuClosed(".menu.view-menu");
  };

  // Both ramps (AC-82's mechanism): the claim is about the ramp the app
  // actually paints, so it is measured in each one, then the default is
  // restored exactly as the run found it.
  await pickTheme("Light");
  const light = await currentRamp();
  if (light.attr !== "light") throw new Error(`the light ramp was not applied: ${JSON.stringify(light)}`);
  await surfacePass("light ramp");

  await pickTheme("Dark");
  const dark = await currentRamp();
  if (dark.attr !== "dark") throw new Error(`the dark ramp was not applied: ${JSON.stringify(dark)}`);
  await surfacePass("dark ramp");

  await pickTheme("System");
  const restored = await currentRamp();
  check("AC-87: the theme returns to the default after both passes", restored.attr === restored.os, `ramp: ${JSON.stringify(restored)}`);

  // Leave the library as the flow found it: the probe's record is deleted
  // through the app's own path, its file and temp directories are removed.
  await clearSearch();
  await browseSelect("All documents");
  await typeInto(".search-input", "tipprobe");
  const probeRow = await waitForEval(`return document.querySelector('[data-row-id][data-missing]') ? true : null;`, { timeout: 10000 });
  if (probeRow) {
    await selectFirstRows(1);
    const focused = await execute(EVAL.focusFirstRow);
    if (focused) {
      await keys("Delete");
      const dialog = await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
      if (dialog) {
        await click('//button[normalize-space()="Delete from library"]', "xpath");
        const removed = await waitForEval(
          `return document.querySelector('.status-bar .doc-count')?.textContent?.match(/^[0-9,.]+/)?.[0] === arguments[0] ? true : null;`,
          { timeout: 10000, args: [before.toLocaleString("en-US")] },
        );
        check("tooltip flow: the probe record is removed again", !!removed, `library: ${await execute(EVAL.docTotal)}`);
      }
    }
    await clearSelectionIfAny();
  }
  await clearSearch();
  await browseSelect("All documents");
  rmSync(awayFile, { force: true });
  rmSync(probeDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- run shape

// v0.0.8 (FR-20, AC-104/AC-105; mechanism DR-266 a): the unlock form of a
// protected document. The subject is fixtures/special/protected.pdf —
// genuinely RC4-encrypted with the user password "sesame" (make-fixtures).
// Self-sufficient (D14): the flow imports the fixture, exercises the form
// across five reader windows, and deletes the document again. A reader flow
// (DR-147 runtime): the windows live on the CDP instance, the library window
// is the CDP main target.
//
// The observable reading of AC-105 is the one DR-266 a records: a stored
// value rides into the load, so a remembered *correct* password opens the
// document directly, and the prompt's prefill / *Remove password* are
// observable through the documented stored-but-wrong edge (DR-266 a writes
// every typed value to the row before the retry).
const UNLOCK_FIELD = `document.querySelector('.unlock-state input[type="password"]')`;
const UNLOCK_BOX = `document.querySelector('.remember-row input[type="checkbox"]')`;
const UNLOCK_BUTTON =
  `(Array.from(document.querySelectorAll('.unlock-state button')).find((b) => (b.textContent ?? "").trim() === "Unlock") ?? null)`;
const REMOVE_BUTTON =
  `(Array.from(document.querySelectorAll('.unlock-state button')).find((b) => (b.textContent ?? "").trim() === "Remove password") ?? null)`;

async function cUnlockType(session, text) {
  const focused = await session.evaluate(`
    const field = ${UNLOCK_FIELD};
    if (!field) return false;
    field.focus();
    field.setSelectionRange(0, field.value.length);
    return true;
  `);
  if (!focused) throw new Error("the unlock form is not rendered");
  await session.insertText(text);
  const applied = await session.waitFor(
    `return (${UNLOCK_FIELD}?.value ?? null) === ${JSON.stringify(text)} ? true : null;`,
    { timeout: 5000 },
  );
  if (!applied) throw new Error(`the password text did not reach the field: ${text}`);
}

async function cUnlockClick(session, which) {
  const target = which === "unlock" ? UNLOCK_BUTTON : which === "remove" ? REMOVE_BUTTON : UNLOCK_BOX;
  const clicked = await session.evaluate(`
    const control = ${target};
    if (!control || control.disabled) return false;
    control.click();
    return true;
  `);
  if (!clicked) throw new Error(`the unlock form's ${which} control was not clickable`);
}

async function flowProtected() {
  const PASSWORD = "sesame"; // make-fixtures: buildProtectedPdf's user password
  await cInvoke("library_import_paths", { paths: [join(FIXTURE_SPECIAL, "protected.pdf")], tagIds: [] });
  const appeared = await cMainWait(`
    return Array.from(document.querySelectorAll('[data-row-id]')).some((r) =>
      (r.querySelector('.title-line')?.textContent ?? '').includes("protected")) ? true : null;
  `, { timeout: 15000 });
  if (!appeared) throw new Error("the protected fixture did not appear in the library");

  // AC-104 half 1: the prompt is a form, not the error copy — a native
  // password field, an unchecked Remember box, an Unlock that refuses the
  // empty field as a submission.
  const first = await cOpenReader("protected");
  const form = await first.session.waitFor(`
    return (() => {
      const field = ${UNLOCK_FIELD};
      const box = ${UNLOCK_BOX};
      const unlock = ${UNLOCK_BUTTON};
      if (!field || !box || !unlock) return null;
      if (document.querySelector('.error-state')) return null;
      return { type: field.type, checked: box.checked, disabled: unlock.disabled };
    })();
  `, { timeout: 15000 });
  check(
    "AC-104: a protected document renders the password prompt — password field, unchecked Remember box, Unlock action — not the error state",
    !!form && form.type === "password" && form.checked === false && form.disabled === true,
    JSON.stringify(form),
  );

  // AC-104 half 2: a wrong password keeps the form with an inline error and
  // the window stays usable. Remember is checked here on purpose: this is
  // the stored-but-wrong edge that carries the typed value into the row
  // (DR-266 a) and makes the prefill and *Remove password* observable below.
  await cUnlockType(first.session, "wrong-one");
  await cUnlockClick(first.session, "remember");
  await cUnlockClick(first.session, "unlock");
  const wrong = await first.session.waitFor(`
    return (() => {
      const error = document.querySelector('.unlock-state .inline-error[role="alert"]');
      const field = ${UNLOCK_FIELD};
      if (!error || !field || field.value !== "wrong-one") return null;
      const external = Array.from(document.querySelectorAll('.unlock-state button'))
        .some((b) => (b.textContent ?? "").includes("Open in external viewer"));
      return external ? error.textContent : null;
    })();
  `, { timeout: 15000 });
  check(
    "AC-104: a wrong password keeps the prompt with an inline error and the window stays usable (the external action stands)",
    !!wrong && String(wrong).includes("does not open"),
    JSON.stringify(wrong),
  );

  // AC-105 prefill half (the documented edge): the row carries the stored
  // value, so the next open presents it pre-filled and offers *Remove
  // password*; removing it returns an empty prompt, and the next open after
  // that prompts again (verified by the empty prompt the fourth window shows).
  await first.session.key("Escape", "Escape", 27);
  await cWaitReaderId(first.id, false);
  const second = await cOpenReader("protected");
  const prefilled = await second.session.waitFor(`
    return (() => {
      const field = ${UNLOCK_FIELD};
      const remove = ${REMOVE_BUTTON};
      return field && field.value === "wrong-one" && remove ? true : null;
    })();
  `, { timeout: 15000 });
  check("AC-105: a stored password reaches the next open as a pre-filled prompt with a Remove password action", !!prefilled);
  await cUnlockClick(second.session, "remove");
  const emptied = await second.session.waitFor(`
    return (() => {
      const field = ${UNLOCK_FIELD};
      if (!field || field.value !== "") return null;
      return ${REMOVE_BUTTON} ? null : true;
    })();
  `, { timeout: 15000 });
  check("AC-105: Remove password clears the stored value and the prompt returns empty", !!emptied);
  await second.session.key("Escape", "Escape", 27);
  await cWaitReaderId(second.id, false);

  // AC-104 half 3: a correct password (checkbox unchecked) renders the page
  // stack and the control strip in the same window — the full reader
  // behaves, page field with the true count.
  const third = await cOpenReader("protected");
  await cUnlockType(third.session, PASSWORD);
  await cUnlockClick(third.session, "unlock");
  const label = await third.session.waitFor(FIRST_PAGE_READY, { timeout: 20000 });
  check(
    "AC-104: a correct password unlocks the document — the page stack and control strip render in the same window",
    label === pageLabel(1, 1),
    `label: ${JSON.stringify(label)}, expected: ${JSON.stringify(pageLabel(1, 1))}`,
  );

  // AC-105 unchecked half: this window's value was temporary — its close
  // clears the row, and the next open prompts with an empty field.
  await third.session.key("Escape", "Escape", 27);
  await cWaitReaderId(third.id, false);
  const fourth = await cOpenReader("protected");
  const emptyPrompt = await fourth.session.waitFor(`
    return (() => {
      const field = ${UNLOCK_FIELD};
      return field && field.value === "" ? true : null;
    })();
  `, { timeout: 15000 });
  check("AC-105: an unlock with the checkbox unchecked stores nothing — the next open prompts with an empty field", !!emptyPrompt);

  // AC-105 checked half: with *Remember this password* checked the value
  // survives the close — the next open needs no prompt at all, because the
  // load presents the stored value (DR-266 a).
  await cUnlockType(fourth.session, PASSWORD);
  await cUnlockClick(fourth.session, "remember");
  await cUnlockClick(fourth.session, "unlock");
  const remembered = await fourth.session.waitFor(FIRST_PAGE_READY, { timeout: 20000 });
  check(
    "AC-104: the remembered unlock renders the reader in the same window",
    remembered === pageLabel(1, 1),
    `label: ${JSON.stringify(remembered)}`,
  );
  await fourth.session.key("Escape", "Escape", 27);
  await cWaitReaderId(fourth.id, false);
  const fifth = await cOpenReader("protected");
  const direct = await fifth.session.waitFor(`
    return document.querySelector('.reader-controls') && !document.querySelector('.unlock-state') ? true : null;
  `, { timeout: 15000 });
  check("AC-105: a remembered password opens the document directly — no prompt", !!direct);
  await fifth.session.key("Escape", "Escape", 27);
  await cWaitReaderId(fifth.id, false);

  // D14: the fixture leaves the library as it was found.
  await cInvoke("library_delete_document", { ids: [first.id] });
}

// AC-116 (D20), reader-window half: the same guard sits at the reader root
// (ReaderApp.svelte). The claim is observed at the dispatch result — a real
// cancelable contextmenu event at the control strip and at the page-number
// field comes back defaultPrevented; the reader stays open and usable after
// each. The library-window half is flowContextMenuSuppression.
async function flowReaderContextMenu() {
  const reader = await cOpenReader("multi-096");
  const surfaces = await reader.session.evaluate(`
    const targets = { "reader chrome": ".reader-controls", "page field": ".page-field" };
    const out = {};
    for (const [name, selector] of Object.entries(targets)) {
      const el = document.querySelector(selector);
      if (!el) { out[name] = "not mounted"; continue; }
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      out[name] = event.defaultPrevented === true;
    }
    return out;
  `);
  check("AC-116: the reader window prevents the browser menu at its chrome and its text field",
    Object.values(surfaces).every((v) => v === true), JSON.stringify(surfaces));
  const alive = await reader.session.waitFor(
    `return document.querySelector('.reader-controls') ? true : null;`,
    { timeout: 8000 },
  );
  check("AC-116: the reader stays open and usable after the prevented events", alive === true);
  await reader.session.key("Escape", "Escape", 27);
  await cWaitReaderId(reader.id, false);
}

// Feature-area → flow mapping (SPEC-v0.0.5 §3.2, carried for the flows this
// suite runs). Area names are the guide pages in docs/release/features/.
// The mapping's scale flows (flowVirtualization, flowWidthMatrix,
// flowEmptyAndSkeleton) are not listed here: since DR-161 they run only in
// scripts/ui-10k.mjs, and the test inventory records that split. This table
// and the sequences below are maintained together whenever a flow is added,
// renamed, or an AC moves.
const AREAS = {
  "getting-started": ["flowStartup", "flowDropAndSkip"], // the bulk empty/skeleton case: scripts/ui-10k.mjs (DR-161)
  "importing-pdfs": ["flowImportAssign", "flowMetaColumn", "flowImportProgress"], // the 10 000-document suite: scripts/ui-10k.mjs (DR-159, DR-161)
  searching: ["flowSearchDebounce", "flowSearchField"],
  "browsing-and-filtering": ["flowTags", "flowTagsMulti", "flowBrowseIcons", "flowMenuBounds", "flowQuietCounts"],
  tags: ["flowTags", "flowTagsMulti", "flowTagCrud", "flowMenuBounds", "flowQuietCounts"],
  favorites: ["flowFavorites"],
  // v0.0.8 (FR-19 / UI-43): the Reading collection.
  "reading-collection": ["flowReading"],
  "opening-and-deleting": ["flowOpen", "flowDelete", "flowContextMenu"],
  // v0.0.7: flowReaderToc (AC-78), flowReaderViewModes (AC-79/AC-80),
  // flowReaderPerformance (AC-73/AC-75 — the measured flow, `measure` group).
  "reading-pdfs": ["flowReaderOpen", "flowReaderNavigation", "flowReaderZoom", "flowReaderClose", "flowReaderErrors", "flowReaderToc", "flowReaderViewModes", "flowReaderPerformance"],
  // v0.0.8 (FR-20 / AC-104, AC-105): the unlock form of a protected document.
  "password-protected-pdfs": ["flowProtected"],
  "metadata-editing": ["flowMetadata", "flowMetadataDisplay", "flowMetaColumn", "flowTooltipSurfaces"], // the row/card text-line tooltips (DR-201)
  "missing-files-relinking": ["flowMissingAndRelink"],
  // v0.0.8 (FR-21 / AC-107, AC-108): rename a document's file.
  "renaming-a-documents-file": ["flowRename"],
  // UI-40 / AC-111: open the containing folder.
  "opening-containing-folder": ["flowOpenFolder"],
  covers: ["flowCovers"],
  "sorting-and-views": ["flowSortSecondary", "flowViewColumns", "flowContentGutter", "flowRowDesign"], // the scale mount bound + width matrix: scripts/ui-10k.mjs (DR-161)
  "status-feedback": ["flowStatusBar", "flowProgressTransform"],
  "selecting-documents": ["flowSelectMode", "flowBulkFavorite"], // UI-41 / AC-112: the bulk favorite toggle
  "settings-and-appearance": ["flowThemeAndSettings", "flowDarkRamp", "flowTooltipSurfaces", "flowAbout", "flowScrollbars"],
  "the-app-window": ["flowDragRegion", "flowWindowChrome", "flowToolbarControls", "flowActionParity", "flowContextMenuSuppression", "flowReaderContextMenu"], // D20 / AC-116: the window-level context-menu guard (library + reader halves)
  "keyboard-shortcuts": ["flowKeyboardAudit"],
};

// The mandatory prefix (AC-60: targeted runs start "after the mandatory
// prefix"): the app shell check, the drop pipeline check (whose result the
// import paths reuse). The tier that follows is always the core one (DR-161).
export const PREFIX_FLOWS = [
  ["flowStartup", flowStartup],
  ["flowDropAndSkip", flowDropAndSkip],
];

// The mandatory prefix (AC-60): every suite run, named set and lane starts
// with it. In lane mode (SMOKE_PREFIX_QUIET, DR-163) the run is setup for a
// single-flow lane: passing checks log but are not recorded, failures are.
export async function runPrefixFlows() {
  if (PREFIX_QUIET) quietChecks = true;
  let dropOk = false;
  try {
    for (const [name, fn] of PREFIX_FLOWS) dropOk = (await runFlow(name, fn)) === true || dropOk;
  } finally {
    quietChecks = false;
  }
  return dropOk;
}

// Functional section (core tier), canonical order. Each flow is
// self-sufficient (D14); the order is still meaningful for the state flows
// deliberately leave behind:
const FUNCTIONAL_SEQUENCE = [
  // Search first: the prefix import updates the DB and status events, not the
  // store's query state — the first UI query is what renders rows, and this
  // flow's claims are the debounce behavior on the core tier.
  ["flowSearchDebounce", flowSearchDebounce],
  ["flowTags", flowTags],
  ["flowContextMenu", flowContextMenu],
  ["flowDelete", flowDelete],
  ["flowFavorites", flowFavorites],
  ["flowReading", flowReading],
  ["flowMetadata", flowMetadata],
  // The status bar's quiet state is only observable while the library is
  // clean; the missing-file branch is verified inside the flow that makes a
  // file missing. Both job checks run on the bounded cover job (§3.1.1).
  ["flowStatusBar", flowStatusBar],
  ["flowProgressTransform", flowProgressTransform],
  ["flowMissingAndRelink", flowMissingAndRelink],
  // v0.0.8 (FR-21 / AC-107, AC-108): the rename dialog on private probe
  // copies; runs among the file-state flows, cleans its records out again.
  ["flowRename", flowRename],
  // UI-40 / AC-111: *Open containing folder* on a fixture row plus a private
  // missing probe; changes nothing that outlives the flow.
  ["flowOpenFolder", flowOpenFolder],
  ["flowMetaColumn", flowMetaColumn],
  ["flowOpen", flowOpen],
  ["flowCovers", flowCovers],
  ["flowMetadataDisplay", flowMetadataDisplay],
  ["flowSortSecondary", flowSortSecondary],
  // The full 2..10 manual walk lives here, at 1280 px (AC-59).
  ["flowViewColumns", flowViewColumns],
  ["flowContentGutter", flowContentGutter],
  ["flowTagsMulti", flowTagsMulti],
  ["flowImportAssign", flowImportAssign],
  ["flowTagCrud", flowTagCrud],
  ["flowQuietCounts", flowQuietCounts],
  ["flowBrowseIcons", flowBrowseIcons],
  ["flowScrollbars", flowScrollbars],
  ["flowDragRegion", flowDragRegion],
  ["flowToolbarControls", flowToolbarControls],
  ["flowSearchField", flowSearchField],
  ["flowRowDesign", flowRowDesign],
  ["flowActionParity", flowActionParity],
  // D20 / AC-116: the browser context menu is suppressed at both windows' roots.
  ["flowContextMenuSuppression", flowContextMenuSuppression],
  ["flowThemeAndSettings", flowThemeAndSettings],
  // The dark ramp is checked against the theme it belongs to: this flow picks
  // Dark, measures what the app paints, and restores the default choice.
  ["flowDarkRamp", flowDarkRamp],
  // The tooltip surfaces are measured against the ramps the theme flow just
  // exercised: this flow picks Light, then Dark, and restores the default.
  ["flowTooltipSurfaces", flowTooltipSurfaces],
  ["flowSelectMode", flowSelectMode],
  // UI-41 / AC-112: the bulk bar's state-following favorite toggle.
  ["flowBulkFavorite", flowBulkFavorite],
  ["flowAbout", flowAbout],
  ["flowWindowChrome", flowWindowChrome],
  ["flowKeyboardAudit", flowKeyboardAudit],
  // The 30-tag submenu state this flow builds is left in the library;
  // it must run after every flow that reads tag state.
  ["flowMenuBounds", flowMenuBounds],
  // The 2 000-document import and its cover queue are left in the library at
  // the flow's end: it runs last so nothing that reads the library follows it.
  ["flowImportProgress", flowImportProgress],
];

// Reader section (multi tier, DR-147 CDP runtime), always last: the reader
// windows live outside the tauri-driver session, and these flows build their
// own library state through the app's own commands.
const READER_SEQUENCE = [
  ["flowReaderOpen", flowReaderOpen],
  ["flowReaderNavigation", flowReaderNavigation],
  ["flowReaderZoom", flowReaderZoom],
  ["flowReaderClose", flowReaderClose],
  ["flowReaderErrors", flowReaderErrors],
  // v0.0.7 (AC-78/79/80): the ToC flow and the view-mode flow drive the
  // shipped controls; the measured flow (AC-73/AC-75) runs last — its two
  // scenarios are the baseline's, in fresh windows, in the default mode.
  ["flowReaderToc", flowReaderToc],
  ["flowReaderViewModes", flowReaderViewModes],
  // v0.0.8 (AC-104/AC-105): the protected-document unlock form, on its own
  // fixture; runs before the measured flow so the baseline windows stay clean.
  ["flowProtected", flowProtected],
  // D20 / AC-116, reader half: the guard at the reader window's root.
  ["flowReaderContextMenu", flowReaderContextMenu],
  ["flowReaderPerformance", flowReaderPerformance],
];
const READER_FLOWS = new Set(READER_SEQUENCE.map(([n]) => n));

const SEQUENCE_NAMES = new Set(
  [...PREFIX_FLOWS, ...FUNCTIONAL_SEQUENCE, ...READER_SEQUENCE].map(([n]) => n),
);
// The lane table (scripts/ui-verify.mjs full mode, DR-163) is built from
// these names: one functional lane and one reader lane per name.
export const FUNCTIONAL_FLOW_NAMES = FUNCTIONAL_SEQUENCE.map(([n]) => n);
export const READER_FLOW_NAMES = READER_SEQUENCE.map(([n]) => n);
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
    if (unknown.length) throw new Error(`unknown SMOKE_FLOW name: ${unknown.join(", ")} (the 10 000-document flows run in scripts/ui-10k.mjs)`);
    wanted = wanted ? wanted.filter((n) => flows.includes(n)) : [...new Set(flows)];
  }
  return wanted; // null = the full suite
}

// ---------------------------------------------------------------- main

// The WebDriver runtime (tauri-driver): the released suite, unchanged in
// shape. `wanted` is the resolved flow selection; null means the full suite.
async function runWebDriverSuite(wanted) {
  const driver = startDriver();
  try {
    await timedPhase("open-session", openSession);
    console.log(`session ${sessionId} — app launched by tauri-driver`);

    const ran = new Set(PREFIX_FLOWS.map(([n]) => n));
    dropWorks = (await runPrefixFlows()) === true || dropWorks;

    // The core tier (DR-161): this suite never imports the docs tier — the
    // 10 000-document corpus belongs to scripts/ui-10k.mjs.
    await timedPhase("import-core-tier", () => importTier("core"));

    for (const [name, fn] of FUNCTIONAL_SEQUENCE) {
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
    // Scoped mode: the session delete closed this suite's app; an
    // image-wide kill would hit the other suite's app (DR-162). The
    // orchestrator sweeps leftovers globally when both suites are done.
    if (!SCOPED) {
      spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
    }
  }
}

// The CDP runtime (DR-147): the app launched directly, the reader flows
// against their own instance, the multi tier imported through the app itself.
async function runReaderSuite(wanted) {
  try {
    await timedPhase("open-cdp-instance", startCdpApp);
    await timedPhase("import-multi-tier", importMultiTier);
    for (const [name, fn] of READER_SEQUENCE) {
      if (wanted && !wanted.includes(name)) continue;
      await runFlow(name, fn);
    }
  } catch (error) {
    let trace = "";
    try {
      trace = await cMainEval(`return (window.__TAURI_INTERNALS__?.__smokeSeen ?? []).slice(-12).join(' → ');`);
    } catch { /* the instance is gone */ }
    fail("smoke run aborted", error.message + (trace ? ` — after: ${trace}` : ""));
  } finally {
    stopCdpApp();
  }
}

async function main() {
  prepareEnvironment();
  checkTokenSource(); // AC-49 source half: no app needed, a file fact.
  const wanted = resolveWanted();
  const wantReader = !wanted || wanted.some((n) => READER_FLOWS.has(n));
  const readerOnly = !!wanted && wantReader && wanted.every((n) => READER_FLOWS.has(n));
  // NFR-06 measures the suite's wall time against the app — both runtimes
  // together (DR-147); the build and fixture generation are D15's concern.
  const suiteStart = Date.now();
  if (!readerOnly) await runWebDriverSuite(wanted);
  if (wantReader) await runReaderSuite(wanted);

  // ---- summary (D14/AC-54): the file-fact checks, the timing table, the
  // budget, and the run result.
  const harnessSource = [
    readFileSync(fileURLToPath(import.meta.url), "utf8"),
    readFileSync(fileURLToPath(new URL("./ui-10k.mjs", import.meta.url)), "utf8"), // DR-159, DR-161
  ].join("\n");
  const longSleeps = [...harnessSource.matchAll(/\bsleep\((\d+)\)/g)]
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

// The module doubles as the shared harness library (scripts/ui-10k.mjs
// imports its plumbing and its exported scale flows — DR-159, DR-161): the
// suite runs only when this file is the program being executed.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
