// Windowing math contract (spec §5.3.5, §9: window bounds at 0 / middle /
// end of a 10 000-item list, overscan, grid column counts).

import { describe, expect, it } from "vitest";
import { gridColumns, nearEnd, window } from "./virtual";

const COUNT = 10_000;
const ROW = 40;
const VIEWPORT = 800;
const OVERSCAN = 6;

describe("window", () => {
  it("clamps the top of the list", () => {
    const w = window(0, VIEWPORT, COUNT, ROW, OVERSCAN);
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
    expect(w.end).toBeGreaterThan(0);
    expect(w.totalHeight).toBe(COUNT * ROW);
  });

  it("keeps the overscan band around the first visible row in the middle", () => {
    const scrollTop = 500 * ROW;
    const w = window(scrollTop, VIEWPORT, COUNT, ROW, OVERSCAN);
    const firstVisible = Math.floor(scrollTop / ROW);
    expect(w.start).toBe(firstVisible - OVERSCAN);
    expect(w.padTop).toBe(w.start * ROW);
    const visibleRows = Math.ceil(VIEWPORT / ROW) + 2 * OVERSCAN;
    expect(w.end).toBe(Math.min(COUNT, w.start + visibleRows));
  });

  it("clamps the end of the list and leaves no bottom padding", () => {
    const w = window((COUNT - 1) * ROW, VIEWPORT, COUNT, ROW, OVERSCAN);
    expect(w.end).toBe(COUNT);
    expect(w.padBottom).toBe(0);
    expect(w.start).toBeLessThan(COUNT);
  });

  it("partitions every scroll position without gaps or overlap", () => {
    for (let scrollTop = 0; scrollTop <= COUNT * ROW; scrollTop += ROW * 7) {
      const w = window(scrollTop, VIEWPORT, COUNT, ROW, OVERSCAN);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(COUNT);
      expect(w.end).toBeGreaterThanOrEqual(w.start);
      // The padding + rendered window must reproduce the full list height —
      // the scrollbar stays honest (NFR-01).
      expect(w.padTop + (w.end - w.start) * ROW + w.padBottom).toBe(w.totalHeight);
    }
  });

  it("handles an empty list", () => {
    expect(window(0, VIEWPORT, 0, ROW)).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
      totalHeight: 0,
    });
  });
});

describe("gridColumns", () => {
  it("derives column count from container width", () => {
    expect(gridColumns(220)).toBe(1);
    expect(gridColumns(220 * 2 + 12)).toBe(2);
    expect(gridColumns(220 * 4 + 12 * 3)).toBe(4);
  });

  it("never returns less than one column", () => {
    expect(gridColumns(0)).toBe(1);
    expect(gridColumns(100)).toBe(1);
  });
});

describe("nearEnd", () => {
  it("triggers slice loading only near the loaded end", () => {
    const loaded = 500;
    expect(nearEnd(loaded * ROW, VIEWPORT, loaded, ROW)).toBe(true);
    expect(nearEnd((loaded - 10) * ROW, VIEWPORT, loaded, ROW)).toBe(true); // within `near` rows
    expect(nearEnd(0, VIEWPORT, loaded, ROW)).toBe(false);
    expect(nearEnd((loaded - 100) * ROW, VIEWPORT, loaded, ROW)).toBe(false);
  });
});
