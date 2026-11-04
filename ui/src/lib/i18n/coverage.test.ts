// R4.1 / §5.3.11: every message key used anywhere in the UI must exist in
// the catalog. `svelte-check` types this for compiled code; this test is
// the runtime net over every source file, including plural pair completeness.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import en from "./en";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sources(path));
    } else if (
      (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts")) &&
      !entry.name.endsWith(".test.ts") &&
      entry.name !== "en.ts"
    ) {
      out.push(path);
    }
  }
  return out;
}

const plainKeys = new Set<string>();
const pluralBases = new Set<string>();
const literals = new Set<string>();
for (const path of sources(srcRoot)) {
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/\btp\(\s*"([^"]+)"/g)) pluralBases.add(match[1]);
  for (const match of text.matchAll(/\b(?<!p)t\(\s*"([^"]+)"/g)) plainKeys.add(match[1]);
  // Keys reached through a label table (`labelKey: "…"` in actions.ts, the
  // menus' option arrays) are literals too — the orphan net must see them.
  for (const match of text.matchAll(/"([^"\n]+)"/g)) literals.add(match[1]);
}

describe("i18n coverage", () => {
  it("finds message call sites to check", () => {
    // A regex drift must fail loudly, never silently check nothing.
    expect(plainKeys.size + pluralBases.size).toBeGreaterThan(0);
  });

  it("every t() key exists in the catalog", () => {
    const missing = [...plainKeys].filter((key) => !(key in en));
    expect(missing, `keys missing from en.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("every tp() base carries both plural variants", () => {
    const missing: string[] = [];
    for (const base of pluralBases) {
      if (!(`${base}.one` in en) || !(`${base}.other` in en)) missing.push(base);
    }
    expect(missing, `plural pairs missing from en.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("no catalog key is orphaned", () => {
    // A component that leaves the app takes its keys with it (spec §3.2).
    // A plural pair is reached through its base — `tp("x")` or
    // `notify("x", count)` — so naming the base names both variants.
    const referenced = new Set<string>();
    for (const key of [...literals, ...plainKeys, ...pluralBases]) {
      referenced.add(key);
      referenced.add(`${key}.one`);
      referenced.add(`${key}.other`);
    }
    const orphans = Object.keys(en).filter((key) => !referenced.has(key));
    expect(orphans, `keys in en.ts with no call site: ${orphans.join(", ")}`).toEqual([]);
  });
});
