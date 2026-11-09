// scripts/ui-verify.mjs — the full-verification entry point (DR-162, DR-163).
//
// Full mode (default): every UI test case runs as its own lane — 48 lanes:
//   prefix  SMOKE_FLOW=flowStartup         the two prefix test cases, checks
//                                          ON; owns the build (D15) — the
//                                          other lanes are released on its
//                                          session line
//   docs    SMOKE_10K_FLOW=flowImport10k   the measured corpus import: its
//                                          AC-57/NFR-02 claims are measured
//                                          while nothing else runs (the
//                                          barrier makes the machine quiet;
//                                          DR-168 places it after the
//                                          measured phase)
//   reader  SMOKE_FLOW=flowReaderX         own CDP instance, own debug port,
//                                          own WebView2 profile directory (the
//                                          AC-72 timings are load-sensitive
//                                          too — early)
//   func    SMOKE_FLOW=flowX               one lane per functional flow
//   scale   SMOKE_10K_FLOW=<scale flow>    corpus import as a setup phase;
//                                          last (long lead time, no throughput
//                                          claims)
// Every lane runs against its own data directory under
// …\com.pdfkeeper.app\parallel\lanes\<flow>, its own tauri-driver ports, and
// scoped cleanup (it touches only its own process tree). The scheduler runs
// barrier-separated groups (DR-164, order revised by DR-168): the build owner
// alone, then the measured phase (reader lanes, bounded-job lanes, the
// picker-request lane, the double-click window lane — measured claims are
// single-instance statements, so they run one at a time; cap
// SMOKE_VERIFY_MEASURE_LANES, default 1), then the corpus import lane alone
// (its AC-57/NFR-02 claims are measured while nothing else runs — the
// barrier, not an early start, is what makes the machine quiet; running it
// before the measured phase left its cover-queue disk flushing bleeding into
// the first reader lane: AC-72 activation flaked at 917 ms against 800),
// then the flood of the rest (cap SMOKE_VERIFY_LANES, default 10).
// The absolute thresholds are unchanged; the phases give the measured claims
// isolation.
//
// coarse mode (--coarse): the two-suite split of DR-162 (core suite + docs
// suite, …\parallel\core and …\parallel\docs) — the documented triage
// fallback; same scheduler shape: build owner alone, then the docs suite
// released on its session line.
//
// The combined clock runs from the build owner's session line (the build and
// fixture work are D15's concern, outside the NFR-06 window — the same rule
// the suites themselves apply) to the last lane exit; the combined wall time
// is asserted against the same ≤ 300 s budget the lanes assert individually.
// Global image-name sweeps run once before anything starts and once after all
// lanes are done — the only moments when sweeping is safe for the lanes.
//
// Usage: node scripts/ui-verify.mjs [--coarse] [--report [path]]
//   --report [path]  write the final summary to a report file (DR-167):
//                    verdict, mode + caps, lanes ran, check tallies, the
//                    combined wall vs the budget, the per-lane table, and the
//                    failed check names per failed lane — the summary only,
//                    no per-check transcript. Default path:
//                    tmp/test-reports/verify-<UTC stamp>.md (tmp/ is
//                    gitignored). A write failure is reported on stdout and
//                    never changes the exit code: the exit code is the
//                    scheduler gate alone.
// Exit code: 0 all lanes pass within the combined budget, 1 otherwise.

import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FUNCTIONAL_FLOW_NAMES, READER_FLOW_NAMES } from "./ui-smoke.mjs";

const NFR06_BUDGET_MS = 300_000; // the same budget the lanes assert (AC-58)
const LANE_GUARD_MS = 900_000; // hard ceiling per lane process (a build is inside it)
const MAX_LANES = Math.max(1, Math.min(16, Number(process.env.SMOKE_VERIFY_LANES ?? 10)));
// Measured claims are defined against single-instance conditions, so the
// measure phase runs its lanes one at a time (cap SMOKE_VERIFY_MEASURE_LANES,
// default 1). Measured 2026-11-07: with cap 4 four concurrent CDP reader
// instances (each rendering a 192-page document) contended enough to flake
// AC-72 at 933 ms against its 300 ms threshold — the claim itself measures
// 192 ms in isolation. The phase's lanes are short; serializing them costs
// ~50 s inside a 300 s budget.
const MEASURE_CAP = Math.max(1, Math.min(8, Number(process.env.SMOKE_VERIFY_MEASURE_LANES ?? 1)));

const COARSE = process.argv.slice(2).includes("--coarse");
// --report [path]: the final summary file (DR-167). No path argument = the
// default tmp/test-reports/verify-<UTC stamp>.md under the repo root.
const REPORT_PATH = (() => {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--report");
  if (at === -1) return null;
  const arg = argv[at + 1];
  if (arg && !arg.startsWith("-")) return resolve(arg);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15) + "Z";
  return resolve(join(import.meta.dirname, "..", "tmp", "test-reports", `verify-${stamp}.md`));
})();
const PARALLEL = join(process.env.APPDATA, "com.pdfkeeper.app", "parallel");
const SCALE_FLOW_NAMES = ["flowVirtualization", "flowWidthMatrix", "flowEmptyAndSkeleton"];

// The lane table. In full mode the lanes carry their DR-164 group:
// "import" (the corpus import lane — measured claims on a quiet machine),
// "measure" (reader lanes; the bounded-job lanes flowStatusBar,
// flowProgressTransform, flowMissingAndRelink; the picker-request lane
// flowSearchField; the window strip lane flowDragRegion — its AC-19
// double-click needs event delivery fast enough for the WebView to pair the
// clicks, which a loaded machine breaks: measured flake at flood cap 10,
// is_maximized false for both toggles), "flood" (the remaining functional
// and scale lanes). The build owner is lane 0 and runs alone before the
// groups. In coarse mode it is the two DR-162 suites.
const MEASURE_FUNCTIONAL = new Set([
  "flowStatusBar",
  "flowProgressTransform",
  "flowMissingAndRelink",
  "flowSearchField",
  "flowDragRegion",
]);
function buildLanes() {
  const lanes = [];
  let index = 0;
  const add = (lane) => lanes.push({ ...lane, index: index++ });
  if (COARSE) {
    add({ id: "core", runner: "smoke", dataDir: join(PARALLEL, "core"), buildOwner: true });
    add({ id: "docs", runner: "10k", dataDir: join(PARALLEL, "docs"), group: "coarse" });
    return lanes;
  }
  add({ id: "prefix", runner: "smoke", flows: ["flowStartup"], dataDir: join(PARALLEL, "lanes", "prefix"), buildOwner: true });
  add({ id: "flowImport10k", runner: "10k", flow: "flowImport10k", quietPrefix: true, group: "import", dataDir: join(PARALLEL, "lanes", "flowImport10k") });
  for (const name of READER_FLOW_NAMES) {
    add({ id: name, runner: "smoke", flows: [name], quietPrefix: true, cdp: true, group: "measure", dataDir: join(PARALLEL, "lanes", name) });
  }
  for (const name of FUNCTIONAL_FLOW_NAMES) {
    const group = MEASURE_FUNCTIONAL.has(name) ? "measure" : "flood";
    add({ id: name, runner: "smoke", flows: [name], quietPrefix: true, group, dataDir: join(PARALLEL, "lanes", name) });
  }
  for (const name of SCALE_FLOW_NAMES) {
    add({ id: name, runner: "10k", flow: name, quietPrefix: true, group: "flood", dataDir: join(PARALLEL, "lanes", name) });
  }
  return lanes;
}

function globalSweep(what) {
  for (const image of ["pdfkeeper.exe", "msedgedriver.exe", "tauri-driver.exe"]) {
    spawnSync("taskkill", ["/IM", image, "/F"], { stdio: "ignore" });
  }
  console.log(`[verify] global sweep ${what}`);
}

// One lane: the runner script with its own data directory and ports, scoped
// cleanup (SMOKE_SCOPED — the runners touch only their own process tree).
// The lane's summary line is parsed from its own output; the exit code is
// the lane's verdict (the runners exit 1 on any recorded failure — in quiet
// prefix mode a failed setup check is recorded, so a broken setup never
// passes silently). seenSession resolves when the lane launches its app (or
// when the lane exits without ever doing so).
function runLane(lane) {
  const script = lane.runner === "smoke" ? "scripts/ui-smoke.mjs" : "scripts/ui-10k.mjs";
  const env = {
    ...process.env,
    PDFKEEPER_DATA_DIR: lane.dataDir,
    SMOKE_SCOPED: "1",
    SMOKE_DRIVER_PORT: String(4444 + lane.index),
    SMOKE_NATIVE_PORT: String(17556 + lane.index),
  };
  for (const key of ["SMOKE_SET", "SMOKE_FLOW", "SMOKE_10K_FLOW", "SMOKE_PREFIX_QUIET", "SMOKE_CDP_PORT"]) {
    delete env[key];
  }
  if (lane.flows) env.SMOKE_FLOW = lane.flows.join(",");
  if (lane.flow) env.SMOKE_10K_FLOW = lane.flow;
  if (lane.quietPrefix) env.SMOKE_PREFIX_QUIET = "1";
  if (lane.cdp) env.SMOKE_CDP_PORT = String(9323 + lane.index);

  let openSessionLine;
  const seenSession = new Promise((done) => { openSessionLine = done; });
  const result = { id: lane.id, exit: null, passed: 0, judged: 0, skipped: 0, wallMs: null, guardKilled: false, failedNames: [] };
  const done = new Promise((resolve) => {
    const proc = spawn(process.execPath, [script], { env, cwd: join(import.meta.dirname, "..") });
    const finish = () => {
      clearTimeout(guard);
      openSessionLine();
      console.log(
        `[verify] lane ${lane.id}: exit ${result.exit ?? "killed"} — ${result.passed}/${result.judged} checks` +
          `${result.skipped ? `, ${result.skipped} skipped` : ""}${result.wallMs != null ? `, wall ${result.wallMs} ms` : ""}` +
          `${result.guardKilled ? " — GUARD KILL" : ""}`,
      );
      resolve(result);
    };
    const guard = setTimeout(() => {
      result.guardKilled = true;
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    }, LANE_GUARD_MS);
    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      console.log(`[${lane.id}] ${line}`);
      const summary = line.match(/^(\d+)\/(\d+) checks passed(?:, (\d+) skipped)?/);
      if (summary) {
        result.passed = Number(summary[1]);
        result.judged = Number(summary[2]);
        result.skipped = Number(summary[3] ?? 0);
      }
      const wall = line.match(/^\[TIME\]\s+SUITE TOTAL\s+(\d+) ms/);
      if (wall) result.wallMs = Number(wall[1]);
      if (line.startsWith("FAILED: ")) result.failedNames.push(line.slice(8, 160));
      if (/session \S+ — app launched|cdp instance on port/.test(line)) openSessionLine();
    });
    proc.stderr.on("data", (d) => process.stderr.write(`[${lane.id}] ${d}`));
    proc.on("exit", (code) => {
      result.exit = code;
      finish();
    });
  });
  return { done, seenSession };
}

// The final summary report (DR-167): built from the data the scheduler
// already aggregates — no per-check transcript. Lane order = execution order:
// the build owner first, then each scheduler group in the order it runs
// (DR-168: the group order is not the lane-table order).
export function buildReport({ startedAt, combinedMs, lanes, groups, byId, neverStarted, judged, passed, skipped, ok }) {
  const groupOf = new Map(lanes.map((l) => [l.id, l.buildOwner ? "owner" : (l.group ?? "coarse")]));
  const ordered = [];
  const owner = lanes.find((l) => l.buildOwner);
  if (owner) ordered.push(owner);
  for (const group of groups) for (const lane of group.lanes) ordered.push(lane);
  const L = [];
  L.push("# UI verification report");
  L.push("");
  L.push(`- Run: ${startedAt.toISOString()} (UTC)`);
  L.push(`- Mode: ${COARSE ? "coarse (two-suite split, DR-162)" : `full (${lanes.length} lanes) — caps: measure ${MEASURE_CAP}, flood ${MAX_LANES}`}`);
  L.push(`- Verdict: **${ok ? "PASS — every lane green within the combined budget" : "FAIL"}**`);
  L.push("");
  L.push("## Summary");
  L.push("");
  L.push("|Metric|Value|");
  L.push("|---|---|");
  L.push(`|Lanes ran|${byId.size}/${lanes.length}${neverStarted.length ? ` — never started: ${neverStarted.map((l) => l.id).join(", ")}` : ""}|`);
  L.push(`|Checks|${passed}/${judged} passed, ${skipped} skipped (harness-limited)|`);
  L.push(`|Combined wall|${combinedMs} ms (budget ${NFR06_BUDGET_MS} ms)|`);
  L.push("");
  L.push("## Lanes");
  L.push("");
  L.push("|Group|Lane|Exit|Checks|Wall (ms)|");
  L.push("|---|---|---|---|---|");
  for (const lane of ordered) {
    const r = byId.get(lane.id);
    if (!r) {
      L.push(`|${groupOf.get(lane.id)}|${lane.id}|never started|—|—|`);
      continue;
    }
    L.push(
      `|${groupOf.get(lane.id)}|${lane.id}|${r.exit ?? "killed"}|${r.passed}/${r.judged}${r.skipped ? ` +${r.skipped} skipped` : ""}` +
        `|${r.wallMs ?? "—"}${r.guardKilled ? " — GUARD KILL" : ""}|`,
    );
  }
  const failed = ordered.map((l) => byId.get(l.id)).filter((r) => r && (r.exit !== 0 || r.failedNames.length));
  L.push("");
  L.push("## Failures");
  L.push("");
  if (!failed.length && !neverStarted.length) L.push("(none)");
  for (const r of failed) {
    L.push(`- lane ${r.id} (exit ${r.exit ?? "killed"})${r.guardKilled ? " — killed by the lane guard" : ""}`);
    for (const name of r.failedNames) L.push(`  - FAILED: ${name}`);
  }
  for (const lane of neverStarted) L.push(`- lane ${lane.id}: never started`);
  L.push("");
  return L.join("\n");
}

async function main() {
  const startedAt = new Date();
  const lanes = buildLanes();
  const owner = lanes.find((lane) => lane.buildOwner);
  const groups = COARSE
    ? [{ name: "coarse", lanes: lanes.filter((lane) => lane.group === "coarse"), cap: 1 }]
    : [
        // DR-168: the measured phase runs before the import lane — the
        // reader lanes must not inherit the import lane's cover-queue disk
        // flush (measured flake: AC-72 activation 917 ms against 800 as the
        // first measure lane right after the 10k lane exited). The import
        // lane's quiet-machine intent is the barrier, not its position.
        { name: "measure", lanes: lanes.filter((lane) => lane.group === "measure"), cap: MEASURE_CAP },
        { name: "import", lanes: lanes.filter((lane) => lane.group === "import"), cap: 1 },
        { name: "flood", lanes: lanes.filter((lane) => lane.group === "flood"), cap: MAX_LANES },
      ];

  const results = [];

  // One group: launch its lanes up to the cap, resolve when the last one
  // exits (the barrier). The owner never re-enters a group — the previous
  // single pump re-launched it from index 0 (a duplicate instance hit EPERM
  // cleaning the live owner's data directory; DR-164 records this).
  const runGroup = (group) =>
    new Promise((resolve) => {
      if (!group.lanes.length) return resolve();
      let next = 0;
      const active = new Set();
      const pump = () => {
        while (next < group.lanes.length && active.size < group.cap) {
          const lane = group.lanes[next++];
          const handle = runLane(lane);
          active.add(handle);
          handle.done.then((r) => {
            results.push(r);
            active.delete(handle);
            pump();
            if (next === group.lanes.length && active.size === 0) resolve();
          });
        }
      };
      pump();
    });

  globalSweep(COARSE ? "before coarse suites" : "before lanes");

  // G1: the build owner starts alone; the groups are released on its session
  // line — by then the binary is fresh and every other lane's build check
  // short-circuits (D15: no two builds race over one binary). The combined
  // NFR-06 clock starts at that line; an owner that exits without ever
  // launching resolves the wait too, so a build failure is reported, not a
  // hang.
  const ownerHandle = runLane(owner);
  const ownerDone = ownerHandle.done.then((r) => {
    results.push(r);
  });
  await ownerHandle.seenSession;
  const combinedStart = Date.now();
  console.log(`[verify] build owner ${owner.id} launched its app — releasing the scheduler`);
  for (const group of groups) {
    console.log(`[verify] group ${group.name}: ${group.lanes.length} lanes (cap ${group.cap})`);
    await runGroup(group);
  }
  await ownerDone;

  globalSweep("after all lanes");

  const combinedMs = Date.now() - combinedStart;
  const byId = new Map(results.map((r) => [r.id, r]));
  const failedLanes = lanes.filter((lane) => byId.get(lane.id)?.exit !== 0);
  const neverStarted = lanes.filter((lane) => !byId.has(lane.id));
  const judged = results.reduce((n, r) => n + r.judged, 0);
  const passed = results.reduce((n, r) => n + r.passed, 0);
  const skipped = results.reduce((n, r) => n + r.skipped, 0);

  console.log(`\n[verify] ${results.length}/${lanes.length} lanes ran${neverStarted.length ? `, never started: ${neverStarted.map((l) => l.id).join(", ")}` : ""}`);
  for (const r of results.filter((x) => x.exit !== 0)) {
    console.log(`[verify] lane ${r.id} FAILED (exit ${r.exit ?? "killed"})`);
    for (const name of r.failedNames) console.log(`[verify]   FAILED: ${name}`);
  }
  console.log(`[verify] checks: ${passed}/${judged} passed, ${skipped} skipped (harness-limited)`);
  console.log(`[verify] combined wall time ${combinedMs} ms (budget ${NFR06_BUDGET_MS} ms)`);
  const ok = failedLanes.length === 0 && neverStarted.length === 0 && combinedMs <= NFR06_BUDGET_MS;
  console.log(ok ? "[verify] PASS — every lane green within the combined budget" : "[verify] FAIL");
  if (REPORT_PATH) {
    // A write failure never changes the exit code (DR-167): the exit code is
    // the scheduler gate alone.
    try {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, buildReport({ startedAt, combinedMs, lanes, groups, byId, neverStarted, judged, passed, skipped, ok }));
      console.log(`[verify] report: ${REPORT_PATH}`);
    } catch (error) {
      console.log(`[verify] report write failed: ${error.message}`);
    }
  }
  process.exit(ok ? 0 : 1);
}

// Runs only when executed as the program (the same guard ui-smoke.mjs uses),
// so buildReport can be imported and checked standalone.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
