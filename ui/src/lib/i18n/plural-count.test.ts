// DR-54/DR-55 regression: `tp` must interpolate the count placeholder
// through format.ts — the v0.0.1 smoke run showed "Imported 10000 PDFs"
// while every other count surface (status chip, bulk bar) groups digits.
// Locale-independent assertions, same pattern as format.test.ts.

import { describe, expect, it } from "vitest";

import { tp } from "./index";

const grouped = (n: number) => new Intl.NumberFormat().format(n);

describe("tp count formatting (R8.1)", () => {
  it("groups multi-thousand counts like the rest of the product", () => {
    expect(tp("toast.imported", 10_000)).toBe(`Imported ${grouped(10_000)} PDFs`);
    expect(tp("toast.importSkipped", 10_000)).toBe(
      `${grouped(10_000)} documents skipped (already in library)`,
    );
  });

  it("keeps single-item counts and plural selection intact", () => {
    expect(tp("toast.imported", 1)).toBe("Imported 1 PDF");
    expect(tp("toast.deleted", 3)).toBe(`Deleted ${grouped(3)} documents`);
  });
});
