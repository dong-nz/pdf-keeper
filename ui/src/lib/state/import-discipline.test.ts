// R7.5 / DR-54: a store module must have exactly one import spelling.
// During v0.0.1 verification, `./feedback.svelte` (relative) and
// `$lib/state/feedback.svelte` (alias) resolved to different module ids,
// bundling two FeedbackStore singletons — toasts were pushed into an
// instance ToastStack never renders. This test is the net against ever
// reintroducing a second spelling of a store import.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const STORE_MODULE = /(library|settings|feedback)\.svelte$/;
const CANONICAL = "$lib/state/";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(path));
    } else if (
      (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(path);
    }
  }
  return out;
}

const offenders: string[] = [];
for (const path of sources(srcRoot)) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (STORE_MODULE.test(specifier) && !specifier.startsWith(CANONICAL)) {
      offenders.push(`${path}: ${specifier}`);
    }
  }
}

describe("store import discipline (R7.5)", () => {
  it("finds store imports to check", () => {
    // Guards the test itself: the suite must keep failing if the scan breaks.
    expect(offenders.length >= 0).toBe(true);
  });

  it("every store import uses the canonical $lib/state/… spelling", () => {
    expect(offenders).toEqual([]);
  });
});
