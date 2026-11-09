// AC-87 (UI-37, §3.11): no HTML element in ui/src carries a native `title`
// attribute — every full-text affordance goes through the app's Tooltip
// component. A `title` passed to a component (the Modal wrapper's prop) is a
// prop, not an HTML attribute, and is not a violation. Asserted against the
// sources: the rendered half is the flowTooltipSurfaces lane.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(import.meta.url), "..", "..");

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.endsWith(".svelte")) out.push(full);
    else if (statSync(full).isDirectory()) out.push(...svelteFiles(full));
  }
  return out;
}

describe("native title removal (UI-37, AC-87)", () => {
  it("no HTML element in ui/src carries a title attribute", () => {
    const offenders: string[] = [];
    for (const file of svelteFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      // Walk every `title=` and find the tag it sits in: the tag is the last
      // `<name` before it with no `>` in between (script/style `title=` have
      // no tag at all and are not attributes).
      for (const m of source.matchAll(/\stitle\s*=/g)) {
        const before = source.slice(0, m.index);
        const tag = before.match(/<([A-Za-z][\w.]*)[^<>]*$/);
        // A tag starting with an uppercase letter is a component: its `title`
        // is a prop. A lowercase tag (span, button, …) is an HTML element.
        if (tag && /^[a-z]/.test(tag[1])) {
          offenders.push(`${relative(SRC, file)}: <${tag[1]} … title=>`);
        }
      }
    }
    expect(offenders, `native title attributes remain:\n${offenders.join("\n")}`).toEqual([]);
  });
});
