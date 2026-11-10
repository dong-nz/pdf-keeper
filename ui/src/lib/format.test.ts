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

  // UI-36 (§3.9, AC-85, rule revised by DR-208): a size renders in the
  // unit its magnitude calls for — bytes, kilobytes, megabytes — asserted
  // band by band against reference Intl byte-unit formatters, the same
  // locale-agnostic-by-construction pattern as the rest of the file.
  it("formats sizes by magnitude: bytes, kilobytes, megabytes", () => {
    const unit = (u: string, maxDigits?: number) =>
      new Intl.NumberFormat(undefined, {
        style: "unit",
        unit: u,
        unitDisplay: "short",
        ...(maxDigits === undefined
          ? {}
          : { minimumFractionDigits: 0, maximumFractionDigits: maxDigits }),
      });
    expect(formatBytes(512)).toBe(unit("byte").format(512)); // "512 B"
    expect(formatBytes(999)).toBe(unit("byte").format(999));
    expect(formatBytes(1_000)).toBe(unit("kilobyte", 1).format(1)); // "1 kB"
    expect(formatBytes(2_048)).toBe(unit("kilobyte", 1).format(2.048)); // "2 kB"
    expect(formatBytes(12_500)).toBe(unit("kilobyte", 1).format(12.5)); // "12.5 kB"
    expect(formatBytes(500_000)).toBe(unit("kilobyte", 1).format(500)); // "500 kB"
    expect(formatBytes(999_949)).toBe(unit("kilobyte", 1).format(999.949)); // "999.9 kB"
    // Band edge: 999 950 is the first value the kilobyte band would round
    // into `1 000 kB`; the megabyte band takes over there (§3.9).
    expect(formatBytes(999_950)).toBe(unit("megabyte", 1).format(0.99995)); // "1 MB"
    expect(formatBytes(2_400_000)).toBe(unit("megabyte", 1).format(2.4)); // "2.4 MB"
    expect(formatBytes(99_999_999)).toBe(unit("megabyte", 1).format(99.999999));
    expect(formatBytes(100_000_000)).toBe(unit("megabyte", 0).format(100)); // "100 MB"
    expect(formatBytes(125_000_000)).toBe(unit("megabyte", 0).format(125)); // "125 MB"
  });

  it("renders zero through the byte band", () => {
    // 0 bytes renders through the same Intl path as every other value.
    expect(formatBytes(0)).toBe(
      new Intl.NumberFormat(undefined, {
        style: "unit",
        unit: "byte",
        unitDisplay: "short",
      }).format(0),
    ); // "0 B"
  });

  it("formats dates with the medium date style", () => {
    const seconds = 1_730_000_000; // 2024-10-27T05:33:20Z
    const reference = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
    expect(formatDate(seconds)).toBe(reference.format(new Date(seconds * 1000)));
  });

  it("selects plural tags through Intl.PluralRules", () => {
    const reference = new Intl.PluralRules();
    for (const n of [0, 1, 2, 5, 21]) {
      expect(pluralKey(n)).toBe(reference.select(n));
    }
    expect(pluralKey(1)).toBe("one");
    expect(pluralKey(2)).toBe("other");
  });
});
