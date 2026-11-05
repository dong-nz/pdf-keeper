// AC-50 (UI-28): the skeleton's cover placeholder is the real row geometry by
// construction — the component imports the row constants from virtual.ts and
// defines no cover dimensions of its own (asserted against the source; the
// rendered measurements live in the smoke flow's AC-50 checks).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const component = resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "SkeletonRows.svelte");
const source = readFileSync(component, "utf8");
const lines = source.split("\n");

describe("skeleton geometry source rule (UI-28, AC-50)", () => {
  it("imports the row geometry constants from virtual.ts", () => {
    const importLine = lines.find((line) => line.includes('from "$lib/virtual"'));
    expect(importLine, "SkeletonRows.svelte must import its row geometry from $lib/virtual").toBeDefined();
    expect(importLine).toContain("ROW_HEIGHT");
    expect(importLine).toContain("ROW_COVER_WIDTH");
  });

  it("sizes the cover placeholder from the constants, not from its own numbers", () => {
    const coverLine = lines.find((line) => line.includes('class="box cover"'));
    expect(coverLine, "the cover placeholder element is missing").toBeDefined();
    expect(coverLine).toContain("{ROW_COVER_WIDTH}");
    expect(coverLine).toContain("{ROW_HEIGHT}");
    expect(coverLine, "the cover placeholder carries a numeric px dimension of its own").not.toMatch(/\d+(\.\d+)?px/);
  });

  it("the cover's own CSS rule defines no dimensions", () => {
    const coverRule = source.match(/\.cover\s*\{[^}]*\}/);
    expect(coverRule, "the .cover rule is missing").toBeDefined();
    expect(coverRule[0], "the .cover rule defines a numeric width or height").not.toMatch(/(width|height)\s*:\s*[\d.]+px/);
  });
});
