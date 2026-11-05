// AC-46 (UI-24): the count cutover deletes the dead code it empties (R7.4).
// After this release the `.chip` rules, `.chip-accent` and the
// `--radius-chip` token appear in no stylesheet rule, component or token
// definition anywhere in the frontend — asserted against the source tree.
// Comments about the removed v0.0.2 status chips use the plural; the patterns
// below name the identifiers themselves.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(path));
    } else if (
      (entry.name.endsWith(".svelte") || entry.name.endsWith(".css") || entry.name.endsWith(".ts")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(path);
    }
  }
  return out;
}

const FORBIDDEN: Record<string, RegExp> = {
  ".chip": /\bchip\b/,
  ".chip-accent": /chip-accent/,
  "--radius-chip": /--radius-chip/,
};

describe("chip cutover (UI-24, AC-46)", () => {
  it("finds frontend sources to check", () => {
    // A broken walk must fail loudly, never silently check nothing.
    expect(sources(srcRoot).length).toBeGreaterThan(0);
  });

  it("no stylesheet rule, component or token definition references the chip", () => {
    const hits: string[] = [];
    for (const path of sources(srcRoot)) {
      const lines = readFileSync(path, "utf8").split("\n");
      for (const [name, pattern] of Object.entries(FORBIDDEN)) {
        lines.forEach((line, index) => {
          if (pattern.test(line)) hits.push(`${name} in ${join("ui/src", relative(srcRoot, path))}:${index + 1}`);
        });
      }
    }
    expect(hits, `leftover chip references: ${hits.join(", ")}`).toEqual([]);
  });
});

function relative(root: string, path: string): string {
  return path.slice(root.length + 1);
}
