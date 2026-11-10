#!/usr/bin/env node
// The 10 000-document suite (DR-159, consolidated into one runner by DR-161):
// every UI test case that needs the 10 000-document corpus lives here, so no
// regular ui-smoke run pays the corpus any more. It drives the same real
// built app through the same tauri-driver session and reuses the shared
// harness plumbing exported by ui-smoke.mjs; the scale flow bodies stay in
// that library because they share their helpers with the functional flows.
//
// What it verifies (requirements owned by the released specs; this file is
// the runner):
//   AC-01 UI   10 000 documents listed through the app; whole import < 30 s (NFR-02)
//   AC-22      the status bar shows the progress bar while the job runs
//   FR-11      duplicate import: every file skipped, with a notice
//   FR-15      the result toast reports the batch
//   AC-57      cover backfill throughput ≥ 2× the 27/s baseline, sampled from
//              this run's own status-bar progress (the v0.0.5 real-app half)
//   NFR-01     mounted document nodes stay bounded with 10 000 documents
//   AC-35/39/56/59  the width matrix at 900/1900 px (Auto + the clamp edges),
//              list and grid, mounted bound against the scale corpus
//   AC-49/50/51  Ctrl+A → "Select all N matching" (scale-only per DR-136) →
//              bulk delete empties the library; empty-state import action
//              rhythm, first-paint skeleton on the empty result set
//
// Full run (DR-161): fixed order — the measured import first, it imports the
// corpus the scale flows then run against — then virtualization, the width
// matrix, and empty/skeleton last (it empties the library through the app's
// own bulk path).
// Lane mode (DR-163): SMOKE_10K_FLOW=<flow>[,<flow>…] runs exactly those
// flows. The measured import stays the test case only in its own lane; in a
// scale lane the same import runs as a setup phase (internal asserts, no
// checks recorded). Unknown names error.
//
// Usage: node scripts/ui-10k.mjs
//        node scripts/ui-verify.mjs — full verification (DR-162, DR-163):
//        full mode runs each flow of this suite as its own lane, coarse mode
//        as one "docs" lane, each with its own data directory
//        (PDFKEEPER_DATA_DIR), driver ports, and scoped cleanup.
// Exit code: 0 all checks pass, 1 any check fails.

import { spawnSync } from "node:child_process";
import { basename } from "node:path";

import {
  check, docCount, emitDrop, execute, openSession, prepareEnvironment,
  NFR06_BUDGET_MS, results, runFlow, runPrefixFlows, SCOPED, sessionId, sleep, startDriver,
  tierPdfPaths, toastContains, timings, wd, EVAL, FIXTURE_DOCS,
  flowVirtualization, flowWidthMatrix, flowEmptyAndSkeleton,
} from "./ui-smoke.mjs";

async function flowImport10k(dropOk) {
  const paths = tierPdfPaths(FIXTURE_DOCS);
  // The count claim is derived, not hard-coded: the batch must add exactly
  // the corpus size to whatever the library held before (a fresh library in
  // this runner — prepareEnvironment wiped it).
  const before = await docCount();
  if (!Number.isFinite(before)) throw new Error(`flowImport10k could not read the library count: ${before}`);
  const target = (before + paths.length).toLocaleString("en-US");
  const started = Date.now();
  if (dropOk) {
    await execute(EVAL.emitDragDrop, [paths]);
  } else {
    // Fallback: the same command the drop handler calls, so the pipeline and
    // UI update are still exercised end-to-end.
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
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
  if (dropOk) await emitDrop(paths);
  else
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
      [paths],
    );
  // D21 (v0.0.8): the assertion names the shipped notice wording — the toast
  // has said "documents skipped (already in library)" since the UI-44
  // terminology pass; the notice itself is correct product behavior (FR-11).
  const dup = await toastContains("10,000 documents skipped (already in library)");
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
}

// Lane mode (DR-163): SMOKE_10K_FLOW selects exactly these flows; null =
// the full fixed-order run.
const TENK_FLOW_NAMES = ["flowImport10k", "flowVirtualization", "flowWidthMatrix", "flowEmptyAndSkeleton"];
function resolveWanted10k() {
  const names = process.env.SMOKE_10K_FLOW;
  if (!names) return null;
  const flows = names.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = flows.filter((n) => !TENK_FLOW_NAMES.includes(n));
  if (unknown.length) throw new Error(`unknown SMOKE_10K_FLOW name: ${unknown.join(", ")} (known: ${TENK_FLOW_NAMES.join(", ")})`);
  return [...new Set(flows)];
}

// Corpus setup for a scale lane (DR-163): the same import the measured case
// performs, but the claims belong to the import lane's test case — here the
// import is setup: internal asserts only, no check recorded. The wait is more
// patient than the measured window because a setup must not fail on load.
async function prepareCorpus(dropOk) {
  const paths = tierPdfPaths(FIXTURE_DOCS);
  const before = await docCount();
  if (!Number.isFinite(before)) throw new Error(`prepareCorpus could not read the library count: ${before}`);
  const target = (before + paths.length).toLocaleString("en-US");
  const started = Date.now();
  if (dropOk) await execute(EVAL.emitDragDrop, [paths]);
  else
    await execute(
      `window.__TAURI_INTERNALS__.invoke('library_import_paths', { paths: arguments[0], tagIds: [] }); return true;`,
      [paths],
    );
  for (;;) {
    const total = await execute(EVAL.docTotal);
    if (total === target) return;
    if (Date.now() - started > 90000) throw new Error(`the corpus import did not complete (count: ${await execute(EVAL.docTotal)})`);
    await sleep(250);
  }
}

async function main() {
  const wanted = resolveWanted10k(); // unknown names error before any app work
  prepareEnvironment();
  // NFR-06 measures the suite's wall time against the app; the build and
  // fixture generation are D15's concern (same rule as the main suite).
  const suiteStart = Date.now();
  const driver = startDriver();
  try {
    await openSession();
    console.log(`session ${sessionId} — app launched by tauri-driver`);
    // The same mandatory prefix the suite uses (AC-60); in a lane it runs as
    // setup — quiet mode records only its failures (DR-163).
    const dropOk = await runPrefixFlows();
    // The full run pays the corpus exactly once (DR-161): the measured import
    // is also the corpus the scale flows run against. In a scale-only lane
    // (DR-163) the import runs as a setup phase instead — the measured
    // claims (AC-01 ×2, AC-22, NFR-02, FR-11, FR-15, AC-57) belong to the
    // import lane's test case. Virtualization and the width matrix need the
    // loaded library; empty/skeleton runs last — it empties the library
    // through the app's own bulk path, and the suite exits without waiting
    // for the scale cover queue (§3.1 rule, unchanged).
    if (!wanted || wanted.includes("flowImport10k")) {
      await runFlow("flowImport10k", () => flowImport10k(dropOk));
    } else {
      await runFlow("corpus-setup", () => prepareCorpus(dropOk));
    }
    if (!wanted || wanted.includes("flowVirtualization")) await runFlow("flowVirtualization", flowVirtualization);
    if (!wanted || wanted.includes("flowWidthMatrix")) await runFlow("flowWidthMatrix", flowWidthMatrix);
    if (!wanted || wanted.includes("flowEmptyAndSkeleton")) await runFlow("flowEmptyAndSkeleton", flowEmptyAndSkeleton);
  } catch (error) {
    let trace = "";
    try {
      trace = await execute(`
        const internals = window.__TAURI_INTERNALS__;
        return (internals?.__smokeSeen ?? []).slice(-12).join(' → ');
      `);
    } catch { /* the page or the session is gone */ }
    check("smoke run aborted", false, error.message + (trace ? ` — after: ${trace}` : ""));
  } finally {
    try {
      if (sessionId) await wd("DELETE", `/session/${sessionId}`);
    } catch {
      /* driver may already be gone */
    }
    driver.kill();
    // Scoped mode: the session delete closed this suite's app; an
    // image-wide kill would hit the other suite's app (DR-162).
    if (!SCOPED) {
      spawnSync("taskkill", ["/IM", "pdfkeeper.exe", "/F"], { stdio: "ignore" });
    }
  }

  const runMs = Date.now() - suiteStart;
  console.log("\n[TIME] summary");
  for (const t of timings) console.log(`[TIME]   ${t.name.padEnd(24)} ${String(t.ms).padStart(7)} ms`);
  console.log(`[TIME]   ${"SUITE TOTAL".padEnd(24)} ${String(runMs).padStart(7)} ms`);
  check(`NFR-06 / AC-58: 10 000-document suite wall time within the ${NFR06_BUDGET_MS / 1000} s budget`,
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
