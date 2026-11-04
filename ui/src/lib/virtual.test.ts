// Windowing math contract (spec §5.3.5, §9): window bounds at 0 / middle /
// end of a 10 000-item list, the overscan band, the padding invariant,
// data-determined row heights (DR-85), and grid column/card geometry (UI-08).

import { describe, expect, it } from "vitest";
import {
  CELL_HEIGHT,
  gridLayout,
  nearEnd,
  rowHeight,
  rowOffsets,
  uniformOffsets,
  window,
} from "./virtual";

const COUNT = 10_000;
const ROW = 48;
const VIEWPORT = 800;
const OVERSCAN = 6;

describe("window (uniform items)", () => {
  it("clamps the top of the list", () => {
    const w = window(0, VIEWPORT, uniformOffsets(COUNT, ROW), OVERSCAN);
    expect(w.start).toBe(0);
    expect(w.padTop).toBe(0);
    expect(w.end).toBeGreaterThan(0);
    expect(w.totalHeight).toBe(COUNT * ROW);
  });

  it("keeps the overscan band around the visible range in the middle", () => {
    const scrollTop = 500 * ROW;
    const w = window(scrollTop, VIEWPORT, uniformOffsets(COUNT, ROW), OVERSCAN);
    const firstVisible = Math.floor(scrollTop / ROW);
    const lastVisible = Math.floor((scrollTop + VIEWPORT) / ROW);
    expect(w.start).toBe(firstVisible - OVERSCAN);
    expect(w.padTop).toBe(w.start * ROW);
    expect(w.end).toBe(lastVisible + OVERSCAN + 1);
  });

  it("clamps the end of the list and leaves no bottom padding", () => {
    const offsets = uniformOffsets(COUNT, ROW);
    const w = window((COUNT - 1) * ROW, VIEWPORT, offsets, OVERSCAN);
    expect(w.end).toBe(COUNT);
    expect(w.padBottom).toBe(0);
    expect(w.start).toBeLessThan(COUNT);
  });

  it("partitions every scroll position without gaps or overlap", () => {
    const offsets = uniformOffsets(COUNT, ROW);
    for (let scrollTop = 0; scrollTop <= COUNT * ROW; scrollTop += ROW * 7) {
      const w = window(scrollTop, VIEWPORT, offsets, OVERSCAN);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(COUNT);
      expect(w.end).toBeGreaterThanOrEqual(w.start);
      // The padding + rendered window must reproduce the full list height —
      // the scrollbar stays honest (NFR-01).
      expect(w.padTop + (w.end - w.start) * ROW + w.padBottom).toBe(w.totalHeight);
    }
  });

  it("handles an empty list", () => {
    expect(window(0, VIEWPORT, uniformOffsets(0, ROW))).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
      totalHeight: 0,
    });
  });
});

describe("row heights (DR-85)", () => {
  it("sizes a row by the metadata lines it renders", () => {
    expect(rowHeight({ author: "", notes: "" })).toBe(48);
    expect(rowHeight({ author: "Ada", notes: "" })).toBe(66);
    expect(rowHeight({ author: "", notes: "read later" })).toBe(66);
    expect(rowHeight({ author: "Ada", notes: "read later" })).toBe(84);
  });

  it("prefix offsets give every row its top and the list its total", () => {
    const rows = [
      { author: "", notes: "" },
      { author: "Ada", notes: "" },
      { author: "", notes: "read later" },
      { author: "Ada", notes: "read later" },
    ];
    expect(rowOffsets(rows)).toEqual([0, 48, 114, 180, 264]);
    expect(rowOffsets([])).toEqual([0]);
  });
});

describe("window (rows of different heights)", () => {
  const rows = [
    { author: "", notes: "" },
    { author: "Ada", notes: "" },
    { author: "", notes: "read later" },
    { author: "Ada", notes: "read later" },
  ];
  const offsets = rowOffsets(rows); // [0, 48, 114, 180, 264]

  it("mounts exactly the rows the viewport touches", () => {
    // Viewport [100, 150] crosses row 1 (48..114) and row 2 (114..180).
    const w = window(100, 50, offsets, 0);
    expect(w.start).toBe(1);
    expect(w.end).toBe(3);
    expect(w.padTop).toBe(48);
    expect(w.padBottom).toBe(264 - 180);
    expect(w.totalHeight).toBe(264);
  });

  it("keeps the padding invariant at every scroll position", () => {
    for (let scrollTop = 0; scrollTop <= 264; scrollTop += 7) {
      const w = window(scrollTop, 90, offsets, 1);
      const rendered = offsets[w.end] - offsets[w.start];
      expect(w.padTop + rendered + w.padBottom).toBe(w.totalHeight);
      expect(w.padTop).toBe(offsets[w.start]);
      if (w.end < rows.length) expect(rendered).toBeGreaterThanOrEqual(90);
    }
  });

  it("clamps both ends", () => {
    expect(window(0, 1000, offsets, 0).start).toBe(0);
    expect(window(0, 1000, offsets, 0).end).toBe(rows.length);
    expect(window(0, 1000, offsets, 0).padBottom).toBe(0);
  });
});

describe("nearEnd", () => {
  it("triggers slice loading only near the loaded end", () => {
    const loaded = 500;
    const offsets = uniformOffsets(loaded, ROW);
    expect(nearEnd(loaded * ROW, VIEWPORT, offsets)).toBe(true);
    expect(nearEnd((loaded - 10) * ROW, VIEWPORT, offsets)).toBe(true); // within `near` rows
    expect(nearEnd(0, VIEWPORT, offsets)).toBe(false);
    expect(nearEnd((loaded - 100) * ROW, VIEWPORT, offsets)).toBe(false);
  });

  it("measures the threshold from the last rows' real heights", () => {
    const offsets = rowOffsets([
      { author: "Ada", notes: "long note" },
      { author: "Ada", notes: "long note" },
      { author: "Ada", notes: "long note" },
    ]); // 84 each: [0, 84, 168, 252]
    expect(nearEnd(0, 100, offsets, 1)).toBe(false); // 100 < 168
    expect(nearEnd(0, 168, offsets, 1)).toBe(true);
    expect(nearEnd(0, 100, rowOffsets([]), 1)).toBe(false);
  });
});

describe("gridLayout", () => {
  it("Auto derives the shipped column count at the shipped card width", () => {
    expect(gridLayout(220)).toEqual({ columns: 1, cardWidth: 220 });
    expect(gridLayout(220 * 2 + 12)).toEqual({ columns: 2, cardWidth: 220 });
    expect(gridLayout(220 * 4 + 12 * 3)).toEqual({ columns: 4, cardWidth: 220 });
    expect(gridLayout(0)).toEqual({ columns: 1, cardWidth: 220 });
    expect(gridLayout(100)).toEqual({ columns: 1, cardWidth: 220 });
  });

  it("a manual count wins and shrinks the cards (DR-83)", () => {
    // 1200 px fits 5 columns at 220; asking for 6 gets 6 at 190.
    expect(gridLayout(1200, 6)).toEqual({ columns: 6, cardWidth: 190 });
    // A count below Auto keeps the shipped card width: only the slack changes.
    expect(gridLayout(1200, 2)).toEqual({ columns: 2, cardWidth: 220 });
  });

  it("honours the count only as far as the window allows", () => {
    // 900 px fits 6 columns at the 140 px floor (6·140 + 5·12 = 900).
    expect(gridLayout(900, 10)).toEqual({ columns: 6, cardWidth: 140 });
    // Never wider than the Auto card, never narrower than the floor.
    expect(gridLayout(4000, 2).cardWidth).toBe(220);
    expect(gridLayout(300, 10).cardWidth).toBeGreaterThanOrEqual(140);
    expect(gridLayout(300, 10).columns).toBe(2);
  });

  it("clamps counts to the range the View menu offers", () => {
    expect(gridLayout(1200, 1).columns).toBe(2);
    expect(gridLayout(1200, 99).columns).toBeLessThanOrEqual(10);
  });

  it("grid blocks keep the shipped cell height", () => {
    // The windowing unit is a block of `columns` cards, one CELL_HEIGHT tall.
    const offsets = uniformOffsets(3, CELL_HEIGHT);
    expect(offsets).toEqual([0, 401, 802, 1203]);
  });
});
