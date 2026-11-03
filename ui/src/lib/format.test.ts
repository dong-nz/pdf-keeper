// R8.1: every user-facing format goes through Intl with the specified
// styles. The tests pin the contract against the same Intl calls in this
// environment — locale-agnostic by construction.

import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, formatDate, pluralKey } from "./format";

describe("format", () => {
  it("formats counts with the locale's grouping", () => {
    expect(formatCount(1_234_567)).toBe(new Intl.NumberFormat().format(1_234_567));
    expect(formatCount(0)).toBe(new Intl.NumberFormat().format(0));
  });

  it("formats sizes as short byte units", () => {
    const reference = new Intl.NumberFormat(undefined, {
      style: "unit",
      unit: "byte",
      unitDisplay: "short",
    });
    expect(formatBytes(0)).toBe(reference.format(0));
    expect(formatBytes(2048)).toBe(reference.format(2048));
    expect(formatBytes(1_048_576)).toBe(reference.format(1_048_576));
  });

  it("formats dates with the medium date style", () => {
    const seconds = 1_730_000_000; // 2024-10-27T05:33:20Z
    const reference = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
    expect(formatDate(seconds)).toBe(reference.format(new Date(seconds * 1000)));
  });

  it("selects plural categories through Intl.PluralRules", () => {
    const reference = new Intl.PluralRules();
    for (const n of [0, 1, 2, 5, 21]) {
      expect(pluralKey(n)).toBe(reference.select(n));
    }
    expect(pluralKey(1)).toBe("one");
    expect(pluralKey(2)).toBe("other");
  });
});
