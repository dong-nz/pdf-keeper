#!/usr/bin/env node
// UI smoke script (SPEC-v0.0.1.md §5.3.12): drives the REAL built app
// (src-tauri/target/debug/pdfkeeper.exe) through tauri-driver (W3C WebDriver,
// proxied to msedgedriver on Windows). Assertions are made against the live
// DOM and the real command boundary; keyboard flows use real key events.
//
// Prerequisites (toolchain, not product dependencies): tauri-driver and a
// version-matched msedgedriver on PATH (see spec §5.3.12 + DR-54).
// Usage: node scripts/ui-smoke.mjs
//   SMOKE_FLOW=flowCategories,flowDelete  run only these flows after the
//   mandatory startup/import/search/virtualization prefix (debugging aid).
// Exit code: 0 all checks pass, 1 any check fails.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_EXE = join(root, "src-tauri", "target", "debug", "pdfkeeper.exe");
const DATA_DIR = join(process.env.APPDATA, "com.pdfkeeper.app");
const FIXTURE_DOCS = join(root, "fixtures", "docs");
const FIXTURE_SPECIAL = join(root, "fixtures", "special");
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

function prepareEnvironment() {
  spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
  rmSync(DATA_DIR, { recursive: true, force: true }); // fresh library per run
  const docs = existsSync(FIXTURE_DOCS) ? readdirSync(FIXTURE_DOCS) : [];
  if (docs.length < 10_000) {
    console.log("fixtures missing — running scripts/make-fixtures.mjs");
    const r = spawnSync(process.execPath, [join(root, "scripts", "make-fixtures.mjs")], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("make-fixtures failed");
  }
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
  if (!res.ok || (data.value && data.value.error)) {
    const err = new Error(`WebDriver ${method} ${path}: ${data.value?.error ?? res.status} ${data.value?.message ?? ""}`);
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
// once (R6.4 harness robustness, not product behavior).
async function withStaleRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (e.w3cError === "stale element reference" && attempt === 0) {
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

async function typeInto(selector, text) {
  await withStaleRetry(async () => {
    const id = await elementId(selector);
    if (!id) throw new Error(`type target not found: ${selector}`);
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
  ArrowDown: "\uE015",
  ArrowUp: "\uE013",
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

async function waitForEval(script, { timeout = 15000, args = [], interval = 300 } = {}) {
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
  for (let attempt = 0; attempt < 10; attempt += 1) {
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
      await sleep(2000);
      if (attempt === 9) throw e;
    }
  }
}

// ---------------------------------------------------------------- DOM probes

const EVAL = {
  appReady: `return !!document.querySelector('.app .status-bar');`,
  rowCount: `return document.querySelectorAll('[data-row-id]').length;`,
  chipTotal: `return document.querySelector('.counts .count-chip .tabular')?.textContent ?? null;`,
  toastTexts: `return Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent);`,
  toastActionLabel: `return document.querySelector('.toast.error .control')?.textContent?.trim() ?? null;`,
  rowTitles: `return Array.from(document.querySelectorAll('[data-row-id] .title')).map((e) => e.textContent);`,
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
    // The Sort control carries a visible text label (no aria-label — the
    // text IS its accessible name); icon-only controls are matched by the
    // aria-labels they require.
    const targets = [
      { sel: '.search-input' },
      { sel: 'button[aria-label="Import"]' },
      { sel: 'button', text: 'Sort' },
      { sel: 'button[aria-label="Grid view"]' },
      { sel: 'button[aria-label="List view"]' },
      { sel: 'input[aria-label="Add category"]' },
    ];
    return targets.map(({ sel, text }) => {
      let els = Array.from(document.querySelectorAll(sel));
      if (text) els = els.filter((e) => e.textContent.trim() === text);
      return { sel: text ? 'button text "Sort"' : sel, total: els.length, tabbable: els.filter((e) => e.tabIndex >= 0).length };
    });
  `,
};

function toastContains(text) {
  return waitForEval(`
    return Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes(arguments[0]));
  `, { timeout: 30000, args: [text] });
}

async function expectNoErrorToast(name) {
  await sleep(1500);
  const bad = await execute(EVAL.hasErrorToast);
  const toasts = bad ? await execute(EVAL.toastTexts) : [];
  check(name, !bad, bad ? `error toast: ${toasts.join(" | ")}` : "");
}

// ---------------------------------------------------------------- flows

async function flowStartup() {
  const ready = await waitForEval(EVAL.appReady, { timeout: 45000 });
  if (!ready) throw new Error("app window never reached the document area");
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
    `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryId: null }); return true;`,
    [[join(FIXTURE_SPECIAL, "notes.txt")]],
  );
  const skipped = await toastContains("file skipped");
  check("non-PDF import is reported as a skip, never silently ignored (FR-11)", !!skipped);
  return false;
}

async function flowImport10k(dropWorks) {
  const paths = readdirSync(FIXTURE_DOCS)
    .filter((n) => n.endsWith(".pdf"))
    .map((n) => join(FIXTURE_DOCS, n));
  const started = Date.now();
  if (dropWorks) {
    await execute(EVAL.emitDragDrop, [paths]);
  } else {
    // Fallback: the same command the drop handler calls, so the pipeline and
    // UI update are still exercised end-to-end.
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryId: null }); return true;`,
      [paths],
    );
  }
  let chip = null;
  for (;;) {
    chip = await execute(EVAL.chipTotal);
    if (chip === "10,000") break;
    if (Date.now() - started > 45000) break;
    await sleep(250);
  }
  const elapsed = Date.now() - started;
  check("AC-01 UI: 10,000 documents listed via the app", chip === "10,000", `status chip: ${chip}, ${elapsed} ms`);
  check("AC-01 UI: whole import completes < 30 s (NFR-02)", elapsed < 30000, `${elapsed} ms`);
  const toast = await toastContains("Imported 10,000 PDFs");
  check("import result toast reports the batch (FR-15)", !!toast);

  // Duplicate import: same paths again — every one skipped with a notice (FR-11).
  if (dropWorks) await emitDrop(paths);
  else
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], categoryId: null }); return true;`,
      [paths],
    );
  const dup = await toastContains("10,000 files skipped");
  check("AC-01 UI: duplicate import is skipped with a notice (FR-11)", !!dup);
}

async function flowVirtualization() {
  // Measure only after the full-list query has actually landed (the list is
  // restored asynchronously after the search flow's Esc).
  const restored = await waitForEval(`return document.querySelectorAll('[data-row-id]').length >= 12;`, { timeout: 15000 });
  const mounted = await execute(EVAL.rowCount);
  const total = await execute(EVAL.chipTotal);
  check(
    "NFR-01 UI: mounted document nodes stay bounded with 10,000 documents",
    !!restored && mounted >= 12 && mounted < 60,
    `${mounted} mounted rows for ${total} documents`,
  );
}

// Types `text` in small chunks with a gap shorter than the 150 ms debounce:
// still ONE burst, but any per-keystroke query would have time to render an
// intermediate result that observation can catch.
async function typeInChunks(selector, text, chunk = 4, gapMs = 60) {
  for (let i = 0; i < text.length; i += chunk) {
    await typeInto(selector, text.slice(i, i + chunk));
    await sleep(gapMs);
  }
}

async function flowSearchDebounce() {
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
  await typeInto(".search-input", "fixture doc doc00");
  const shown = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '999 shown' ? c.textContent : null;
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
  await typeInto('input[aria-label="Add category"]', "Smoke Cat");
  await keys("Enter");
  // Poll both halves together: the info toast auto-dismisses after 6 s, so
  // waiting out a failed sidebar check first would erase the toast evidence.
  const both = await waitForEval(`
    const side = Array.from(document.querySelectorAll('.category-row')).some((b) => b.textContent.includes('Smoke Cat'));
    const toast = Array.from(document.querySelectorAll('.toast')).some((t) => t.textContent.includes('Category created'));
    return side && toast;
  `, { timeout: 15000 });
  if (both) {
    check("AC-03 UI: category creation via keyboard (sidebar field + Enter)", true);
  } else {
    const diag = await execute(`
      return {
        input: document.querySelector('input[aria-label="Add category"]')?.value ?? null,
        side: Array.from(document.querySelectorAll('.category-row')).some((b) => b.textContent.includes('Smoke Cat')),
        toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent),
      };
    `);
    check("AC-03 UI: category creation via keyboard (sidebar field + Enter)", false, `state: ${JSON.stringify(diag)}`);
  }

  // Select three rows with Space/ArrowDown only.
  const focused = await execute(EVAL.focusFirstRow);
  if (!focused) throw new Error("could not focus the first row");
  await keys("Space", "ArrowDown", "Space", "ArrowDown", "Space");
  const bulk = await waitForEval(`
    return Array.from(document.querySelectorAll('.bulk-bar')).some((b) => b.textContent.includes('3 selected'));
  `, { timeout: 5000 });
  check("Space + ArrowDown select rows and open the bulk bar", !!bulk);

  await click('//div[contains(@class,"bulk-bar")]//button[.//span[normalize-space()="Categories…"]]', "xpath");
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
  const assigned = await waitForEval(`
    return Array.from(document.querySelectorAll('[data-row-id]')).filter((r) => r.textContent.includes('Smoke Cat')).length;
  `, { timeout: 15000 });
  check("AC-03 UI: bulk assignment shows chips on all three rows", assigned === 3, `chipped rows: ${assigned}`);

  await click('//button[contains(@class,"category-select") and .//span[normalize-space()="Smoke Cat"]]', "xpath");
  const filtered = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '3 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  check("AC-03 UI: sidebar category filter shows exactly the assigned documents", !!filtered, `status: ${filtered}`);
}

async function flowContextMenu() {
  // UI-05: right-click on a row opens the context menu on screen. The
  // action parity itself (R4.7) is structural — buttons and menu render the
  // same action list — so this checks the interaction and the chrome.
  // §5.2: the Esc that CLOSES the menu must not clear the selection —
  // this is the regression found in v0.0.1 verification (overlay count
  // dropped to 0 while the menu was open; the window-level Esc wiped the
  // selection).
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
    const t = document.querySelector('.counts .count-chip .tabular')?.textContent;
    return t === '9,997' ? t : null;
  `, { timeout: 10000 });
  const toast = await toastContains("Deleted 3 documents");
  check("AC-04 UI: 'Delete from library' removes exactly the selection", !!emptyCategory && total === "9,997" && !!toast);

  await click('.counts .count-chip');
  const allBack = await waitForEval(`
    const t = document.querySelector('.counts .count-chip .tabular')?.textContent;
    return t === '9,997' ? t : null;
  `, { timeout: 10000 });
  check("library count reflects the deletion", !!allBack);
}

async function flowFavorites() {
  // FR-04: starring pins a document to the top of every list, the counts
  // reflect it, and the sidebar Favorites view shows exactly the starred
  // document. Runs from the All view (flowDelete ended there).
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
  const starred = await waitForEval(`
    const chip = Array.from(document.querySelectorAll('.counts .count-chip'))
      .find((c) => c.textContent.includes('Favorites'));
    const n = chip?.querySelector('.tabular')?.textContent;
    return n === '1' ? n : null;
  `, { timeout: 10000 });
  check("FR-04: starring updates the favorites count", starred === "1");

  // Agreed UI (favorites spec): no mid-scroll jump — the row stays under
  // the cursor; the pinned position applies when the query next re-runs.
  const noJump = await waitForEval(`
    const first = document.querySelector('.row[data-row-id]');
    return first && first.getAttribute('data-row-id') !== arguments[0] ? true : null;
  `, { timeout: 3000, args: [target.id] });
  check("FR-04: the starred row does not jump mid-scroll (agreed UI)", !!noJump);

  await click('//aside//button[.//span[normalize-space()="Favorites"]]', "xpath");
  const favShown = await waitForEval(`
    const c = document.querySelector('.result-count');
    return c && c.textContent === '1 shown' ? c.textContent : null;
  `, { timeout: 10000 });
  check("FR-04: the Favorites view shows exactly the starred document", !!favShown, `status: ${favShown}`);

  // Re-running the query (back to All) must show the pinned position.
  await click('//aside//button[.//span[normalize-space()="All documents"]]', "xpath");
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
  const cleared = await waitForEval(`
    const chip = Array.from(document.querySelectorAll('.counts .count-chip'))
      .find((c) => c.textContent.includes('Favorites'));
    const n = chip?.querySelector('.tabular')?.textContent;
    return n === '0' ? n : null;
  `, { timeout: 10000 });
  check("FR-04: unstarring removes the document from Favorites", cleared === "0");

  await click('//aside//button[.//span[normalize-space()="All documents"]]', "xpath");
  await waitForEval(`
    return document.querySelectorAll('.row[data-row-id]').length > 5 ? true : null;
  `, { timeout: 15000 });
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

async function flowMetadata() {
  // FR-05/06/07 (UI part): the details modal edits the title; the edited
  // title is shown on the row and is searchable.
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
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Delete…"]', "xpath");
  const confirm = await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
  check("UI-02: the editor hands the document to the delete flow (singular title)", !!confirm);
  await keys("Escape"); // cancel the confirmation — the editor must stay open
  const editorStillOpen = await waitForEval(EVAL.bodyHas, { args: ["Document details"] });
  const notDeleted = await waitForEval(EVAL.rowsWithText, { args: ["ZZRenamed Fixture"] });
  check("UI-02: cancelling the delete keeps both the document and the editor", !!editorStillOpen && notDeleted === 1);
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Delete…"]', "xpath");
  await waitForEval(EVAL.bodyHas, { args: ["Delete 1 document?"] });
  await click('//button[normalize-space()="Delete from library"]', "xpath");
  const gone = await waitForEval(`
    return document.querySelectorAll('[data-row-id="' + arguments[0] + '"]').length === 0
      && !document.body.textContent.includes('Document details') ? true : null;
  `, { timeout: 10000, args: [renamedId] });
  check("UI-02: deleting from the editor removes the document and closes the editor", !!gone);

  // Leave the library unfiltered for the following flows.
  await execute(`document.querySelector('.search-input')?.focus(); return true;`);
  await keys("Escape"); // Esc in the search box clears it
  await waitForEval(`
    return (document.querySelector('.search-input')?.value ?? '') === '' ? true : null;
  `, { timeout: 5000 });
}

async function flowMissingAndRelink() {
  const moved = join(FIXTURE_DOCS, "doc00500.pdf");
  const outside = join(root, "fixtures", "moved-away", "smoke-moved.pdf");
  if (!existsSync(moved) && existsSync(outside)) renameSync(outside, moved); // previous run aborted mid-flow

  // FR-15 busy gate: Rescan is disabled while a job runs — the cover queue
  // from the 10,000-document import is the long-running job on this path.
  // Waiting for the gate to open is itself the observation: progress events
  // must terminate (processed >= total clears the job) or the app would be
  // unusable forever.
  const started = Date.now();
  const enabled = await waitForEval(
    `const b = Array.from(document.querySelectorAll('.status-bar .control')).find((x) => x.textContent.includes('Rescan'));
     return b && !b.disabled;`,
    { timeout: 600_000, interval: 1000 },
  );
  check(
    "job progress completes; Rescan re-enables after the cover queue drains (FR-15)",
    !!enabled,
    `gate open after ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );

  mkdirSync(join(root, "fixtures", "moved-away"), { recursive: true });
  renameSync(moved, outside);

  await click('//button[.//span[normalize-space()="Rescan"]]', "xpath");
  const found = await toastContains("1 missing file found");
  check("AC-05 UI: manual Rescan reports the missing file", !!found);

  // The category filter is still active from the previous flow; the relink
  // checks need the full library (search ∩ category would show nothing).
  await click('//button[.//span[normalize-space()="All documents"]]', "xpath");
  await typeInto(".search-input", "doc00500");
  const flagged = await waitForEval(EVAL.missingRow, { timeout: 10000 });
  check("AC-05 UI: the row is flagged missing", !!flagged);

  // Enter on the missing row -> failed command -> toast WITH its action (R4.6).
  await execute(EVAL.focusFirstRow);
  await keys("Enter");
  const errorToast = await toastContains("The file is missing");
  const action = await waitForEval(EVAL.toastActionLabel, { timeout: 5000 });
  check("failed command produces a toast with its action (Relink…)", !!errorToast && action === "Relink…", `action: ${action}`);

  await click('.toast.error .control');
  const dialog = await waitForEval(EVAL.bodyHas, { args: ["Relink missing file"] });
  check("AC-05 UI: the toast action opens the relink dialog", !!dialog);

  await keys("Escape");
  const closed = await waitForEval(`return !document.body.textContent.includes('Relink missing file');`, { timeout: 5000 });
  check("Esc closes the innermost overlay", !!closed);

  // UI-02: the editor offers Relink… on a missing document (same dialog).
  await openEditorForRow('[data-row-id][data-missing]');
  await click('//div[contains(@class,"modal")]//button[normalize-space()="Relink…"]', "xpath");
  const editorRelink = await waitForEval(EVAL.bodyHas, { args: ["Relink missing file"] });
  check("UI-02: the editor's Relink… opens the relink dialog", !!editorRelink);
  await keys("Escape");
  await waitForEval(`return !document.body.textContent.includes('Relink missing file') ? true : null;`, { timeout: 5000 });

  renameSync(outside, moved);
  await click('//button[.//span[normalize-space()="Rescan"]]', "xpath");
  const restored = await toastContains("1 file found again");
  const stillMissing = await execute(EVAL.missingRow);
  check("AC-05 UI: Rescan finds the file again and clears the flag", !!restored && !stillMissing);
  rmSync(join(root, "fixtures", "moved-away"), { recursive: true, force: true });
}

async function flowOpen() {
  const focused = await execute(EVAL.focusFirstRow);
  if (!focused) throw new Error("could not focus a row for open");
  await keys("Enter");
  await expectNoErrorToast("AC-01 UI: Enter opens a present file via the OS (no failure surfaced)");
}

async function flowCovers() {
  // Covers are queued at import; the next query carries the cached paths.
  await keys("^Control", "^f", "~f", "~Control");
  await keys("Escape");
  const withCover = await waitForEval(EVAL.coverImgs, { timeout: 180000, interval: 2000 });
  check("AC-06 UI: list rows render real cover images from the cache", !!withCover, `imgs: ${withCover}`);

  await click('button[aria-label="Grid view"]');
  const grid = await waitForEval(EVAL.gridCardsWithCovers, { timeout: 15000 });
  check("AC-06 UI: grid cards render cover images", !!grid);

  await click('button[aria-label="List view"]');
  const list = await waitForEval(EVAL.listRowsWithCovers, { timeout: 10000 });
  check("AC-06 UI: switching back to list keeps covers", !!list);
}

// UI-01 / §5.3: the sidebar collapses to a 56px icon rail and back to 264px.
// The rail must have no horizontal overflow — overflow is what made WebView2
// render a horizontal scrollbar under the rail (user-reported, DR-61/DR-62).
// Rename and delete must stay reachable from the rail via the context menu.
async function flowSidebarRail() {
  await click('button[aria-label="Collapse sidebar"]');
  const rail = await execute(`
    const side = document.querySelector('.sidebar');
    const nav = side?.querySelector('nav');
    return {
      collapsed: !!side?.classList.contains('collapsed'),
      w: side ? Math.round(side.getBoundingClientRect().width) : 0,
      overflowX: nav ? nav.scrollWidth - nav.clientWidth : -1,
      rows: side ? side.querySelectorAll('.side-row, .category-row').length : 0,
    };
  `);
  check("UI-01: the collapsed sidebar is a 56px icon rail with no horizontal overflow", rail.collapsed && rail.w === 56 && rail.overflowX <= 0 && rail.rows > 0, JSON.stringify(rail));

  // DR-62 (user-reported): hovering a rail row must not reveal the hidden
  // actions or bring the scrollbar back.
  const rowPos = await waitForEval(`
    return (() => {
      const el = document.querySelector('.sidebar .category-row');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })();
  `, { timeout: 5000 });
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: rowPos.x, y: rowPos.y }] }],
  });
  const hovered = await execute(`
    const side = document.querySelector('.sidebar');
    const nav = side?.querySelector('nav');
    const revealed = Array.from(side.querySelectorAll('.category-actions, .category-name, .category-row .chip'))
      .filter((e) => getComputedStyle(e).display !== 'none').length;
    return { overflowX: nav ? nav.scrollWidth - nav.clientWidth : -1, revealed };
  `);
  check("DR-62: hovering a rail row reveals no hidden content and no scrollbar", hovered.overflowX <= 0 && hovered.revealed === 0, JSON.stringify(hovered));
  await wd("POST", `/session/${sessionId}/actions`, {
    actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: 600, y: 400 }] }],
  });

  // Rename from the rail: right-click -> menu -> Rename -> prefilled dialog ->
  // commit (the only category in the test library is "Smoke Cat"). The item
  // is selected with ArrowDown/Enter — bits-ui animates the menu open, and a
  // coordinate click can land on the pre-animation position.
  await rightClick('.sidebar .category-row');
  const menuUp = await waitForEval(`
    const menu = document.querySelector('.menu');
    if (!menu || !menu.querySelector('.menu-item')) return null;
    const r = menu.getBoundingClientRect();
    return r.width > 120 && r.bottom <= window.innerHeight ? true : null;
  `, { timeout: 5000 });
  check("UI-01: right-clicking a rail row opens the category menu on screen", !!menuUp);
  // ArrowDown and Enter in SEPARATE action chains: one chain dispatches every
  // key against the focus state captured at chain start (the menu content),
  // so Enter would never reach the item that ArrowDown just focused.
  await keys("ArrowDown");
  const highlighted = await waitForEval(`
    return document.querySelector('.menu [data-highlighted]')?.textContent?.trim() === 'Rename category' ? true : null;
  `, { timeout: 5000 });
  check("UI-01: ArrowDown highlights the first menu item", !!highlighted);
  await clickAtStable('.menu [data-highlighted]');
  const prefilled = await waitForEval(`
    const field = document.querySelector('.modal .field');
    return field && field.value === 'Smoke Cat' ? true : null;
  `, { timeout: 5000 });
  if (!prefilled) {
    const diag = await execute(`
      return {
        menu: !!document.querySelector('.menu'),
        menuState: document.querySelector('.menu')?.getAttribute('data-state') ?? null,
        highlighted: document.querySelector('.menu [data-highlighted]')?.textContent?.trim() ?? null,
        items: Array.from(document.querySelectorAll('.menu .menu-item')).map((e) => e.textContent.trim()),
        modal: !!document.querySelector('.modal'),
        modalText: document.querySelector('.modal')?.textContent?.trim().slice(0, 120) ?? null,
        active: (document.activeElement?.tagName || '') + '.' + (document.activeElement?.className || '').slice(0, 60),
      };
    `);
    check("UI-01: rail rename opens the dialog prefilled with the current name", false, `state: ${JSON.stringify(diag)}`);
  } else {
    check("UI-01: rail rename opens the dialog prefilled with the current name", true);
  }
  await click('.modal .field');
  await keys("^Control", "^a", "~a", "~Control");
  await typeInto('.modal .field', "Smoke Cat Renamed");
  await click('//button[normalize-space()="Rename"]', "xpath");
  const renameClosed = await waitForEval(`return !document.querySelector('.modal') ? true : null;`, { timeout: 5000 });
  check("UI-01: committing the rename dialog closes it", !!renameClosed);

  // Delete from the rail: right-click -> menu -> Delete -> confirmation ->
  // Discard (the category must survive).
  await rightClick('.sidebar .category-row');
  const menuUp2 = await waitForEval(`return document.querySelector('.menu .menu-item') ? true : null;`, { timeout: 5000 });
  check("UI-01: the rail menu opens again for the delete path", !!menuUp2);
  await keys("ArrowDown");
  const highlighted2 = await waitForEval(`
    return document.querySelector('.menu [data-highlighted]')?.textContent?.trim() === 'Rename category' ? true : null;
  `, { timeout: 5000 });
  check("UI-01: delete path highlights the first item first", !!highlighted2);
  await keys("ArrowDown");
  const highlighted3 = await waitForEval(`
    return document.querySelector('.menu [data-highlighted]')?.textContent?.trim() === 'Delete category' ? true : null;
  `, { timeout: 5000 });
  check("UI-01: ArrowDown moves the highlight to the delete item", !!highlighted3);
  await clickAtStable('.menu [data-highlighted]');
  const confirmUp = await waitForEval(`
    const m = document.querySelector('.modal');
    return m && m.textContent.includes('Delete category') ? true : null;
  `, { timeout: 5000 });
  check("UI-01: rail delete opens the confirmation dialog", !!confirmUp);
  await click('//button[normalize-space()="Discard"]', "xpath");
  const confirmClosed = await waitForEval(`return !document.querySelector('.modal') ? true : null;`, { timeout: 5000 });
  const stillThere = await waitForEval(`return !!document.querySelector('.sidebar .category-row');`, { timeout: 3000 });
  check("UI-01: discarding the delete keeps the category", !!confirmClosed && !!stillThere);

  await click('button[aria-label="Expand sidebar"]');
  const open = await execute(`
    const side = document.querySelector('.sidebar');
    return {
      collapsed: !!side?.classList.contains('collapsed'),
      w: side ? Math.round(side.getBoundingClientRect().width) : 0,
    };
  `);
  check("UI-01: the expanded sidebar is 264px", !open.collapsed && open.w === 264, JSON.stringify(open));
  const names = await waitForEval(`
    return (() => {
      const list = Array.from(document.querySelectorAll('.sidebar .category-name')).map((e) => e.textContent.trim());
      return list.includes('Smoke Cat Renamed') && !list.includes('Smoke Cat') ? list : null;
    })();
  `, { timeout: 5000 });
  check("UI-01: the rename made from the rail shows after expanding", !!names, JSON.stringify(names));
}

async function flowKeyboardAudit() {
  const audit = await execute(EVAL.keyboardAudit);
  const unreachable = audit.filter((a) => a.total === 0 || a.tabbable < a.total);
  check(
    "every toolbar/sidebar control is keyboard-reachable (tabbable)",
    unreachable.length === 0,
    audit.map((a) => `${a.sel}:${a.tabbable}/${a.total}`).join(", "),
  );
}

// ---------------------------------------------------------------- main

async function main() {
  prepareEnvironment();
  const driver = startDriver();
  try {
    await openSession();
    console.log(`session ${sessionId} — app launched by tauri-driver`);

    await flowStartup();
    const dropWorks = await flowDropAndSkip();
    await flowImport10k(dropWorks);
    // Search first: the bridge import updates the DB and status events, not
    // the store's query state — the first UI query (search, then Esc back to
    // the full list) is what actually renders rows. Virtualization is then
    // measured on the full 10,000-document list.
    await flowSearchDebounce();
    await flowVirtualization();
    // SMOKE_FLOW=<a,b,...>: flow subset for debugging (import/search/
    // virtualization always run first — they establish the rendered state).
    const registry = { flowCategories, flowContextMenu, flowDelete, flowFavorites, flowMetadata, flowMissingAndRelink, flowOpen, flowCovers, flowSidebarRail, flowKeyboardAudit };
    const subset = process.env.SMOKE_FLOW?.split(",").map((n) => registry[n.trim()]);
    if (subset) {
      for (const f of subset) await f();
    } else {
      await flowCategories();
      await flowContextMenu();
      await flowDelete();
      await flowFavorites();
      await flowMetadata();
      await flowMissingAndRelink();
      await flowOpen();
      await flowCovers();
      await flowSidebarRail();
      await flowKeyboardAudit();
    }
  } catch (error) {
    fail("smoke run aborted", error.message);
  } finally {
    try {
      if (sessionId) await wd("DELETE", `/session/${sessionId}`);
    } catch {
      /* driver may already be gone */
    }
    driver.kill();
    spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped === true);
  const judged = results.length - skipped.length;
  console.log(`\n${judged - failed.length}/${judged} checks passed, ${skipped.length} skipped (harness-limited)`);
  for (const f of failed) console.log(`FAILED: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  for (const s of skipped) console.log(`SKIPPED: ${s.name} — ${s.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
