// Windowing math contract (spec §5.3.5 as modified by DR-99, §9): window
// bounds at 0 / middle / end of a 10 000-item list, the overscan band, the
// padding invariant, data-determined row heights (DR-85) at the v0.0.8 row of
// 122 px (UI-03 as modified by §3.12/DR-189, re-derived by UI-45/DR-278: the
// 75×106 cover plus the 8 px insets; the 18 px line step unchanged),
// and the derived grid geometry — column count first,
// card width filling the container, capped at 320 px (AC-31).

import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  MAX_CARD_WIDTH,
  MIN_CARD_WIDTH,
  cardHeight,
  cellHeight,
  coverHeight,
  coverWidth,
  gridLayout,
  nearEnd,
  rowHeight,
  rowOffsets,
  uniformOffsets,
  window,
} from "./virtual";

const COUNT = 10_000;
const ROW = 122; // the v0.0.8 row base (UI-45/DR-278): cover 75×106 + 2×8 insets
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

  it("bounds the mounted count at the largest viewport the app serves", () => {
    // NFR-01's mount bound, re-derived at the 122 px row: even a 2 400 px
    // viewport (a 4K window at 100 % scale) mounts a bounded slice, not the
    // 10 000-item list.
    const offsets = uniformOffsets(COUNT, ROW);
    for (const viewport of [600, 1200, 2400]) {
      for (let scrollTop = 0; scrollTop <= COUNT * ROW; scrollTop += viewport / 2) {
        const w = window(scrollTop, viewport, offsets, OVERSCAN);
        expect(w.end - w.start).toBeLessThan(150);
      }
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

describe("row heights (DR-85, UI-03 metrics)", () => {
  it("sizes a row by the metadata lines it renders", () => {
    // 122 px base (UI-45/DR-278), +18 px per metadata line (ROW_LINE unchanged).
    expect(rowHeight({ author: "", notes: "" })).toBe(122);
    expect(rowHeight({ author: "Ada", notes: "" })).toBe(140);
    expect(rowHeight({ author: "", notes: "read later" })).toBe(140);
    expect(rowHeight({ author: "Ada", notes: "read later" })).toBe(158);
  });

  it("prefix offsets give every row its top and the list its total", () => {
    const rows = [
      { author: "", notes: "" },
      { author: "Ada", notes: "" },
      { author: "", notes: "read later" },
      { author: "Ada", notes: "read later" },
    ];
    expect(rowOffsets(rows)).toEqual([0, 122, 262, 402, 560]);
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
  const offsets = rowOffsets(rows); // [0, 122, 262, 402, 560]

  it("mounts exactly the rows the viewport touches", () => {
    // Viewport [150, 300] crosses row 1 (122..262) and row 2 (262..402).
    const w = window(150, 150, offsets, 0);
    expect(w.start).toBe(1);
    expect(w.end).toBe(3);
    expect(w.padTop).toBe(122);
    expect(w.padBottom).toBe(560 - 402);
    expect(w.totalHeight).toBe(560);
  });

  it("keeps the padding invariant at every scroll position", () => {
    for (let scrollTop = 0; scrollTop <= 560; scrollTop += 7) {
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
    ]); // 158 each: [0, 158, 316, 474]
    expect(nearEnd(0, 100, offsets, 1)).toBe(false); // 100 < 316
    expect(nearEnd(0, 330, offsets, 1)).toBe(true);
    expect(nearEnd(0, 100, rowOffsets([]), 1)).toBe(false);
  });
});

describe("gridLayout (§5.3.5 as modified by DR-99, AC-31)", () => {
  it("Auto derives the column count from the 232 px pitch and stretches the cards to the container", () => {
    // The pitch still decides how many columns fit; the width then fills what
    // the container gave (the shipped `min(220, …)` clamp is gone).
    expect(gridLayout(220)).toEqual({ columns: 1, cardWidth: 220 });
    expect(gridLayout(220 * 2 + 12)).toEqual({ columns: 2, cardWidth: 220 });
    expect(gridLayout(220 * 4 + 12 * 3)).toEqual({ columns: 4, cardWidth: 220 });
    expect(gridLayout(0)).toEqual({ columns: 1, cardWidth: 140 }); // floor, not a poster
    expect(gridLayout(100)).toEqual({ columns: 1, cardWidth: 140 });
    expect(gridLayout(900)).toEqual({ columns: 3, cardWidth: 292 });
    expect(gridLayout(1280)).toEqual({ columns: 5, cardWidth: 246 });
    expect(gridLayout(1900)).toEqual({ columns: 8, cardWidth: 227 });
  });

  it("a manual count wins and widens the cards instead of leaving slack (DR-83 + DR-99)", () => {
    // 1200 px fits 5 columns at the pitch; asking for 4 gets 4 wider cards,
    // asking for 6 gets 6 narrower ones.
    expect(gridLayout(1200, 4)).toEqual({ columns: 4, cardWidth: 291 });
    expect(gridLayout(1200, 6)).toEqual({ columns: 6, cardWidth: 190 });
    // Past the 320 cap the leftover is margin (the grid centers, §3.10).
    expect(gridLayout(1200, 2)).toEqual({ columns: 2, cardWidth: 320 });
    expect(gridLayout(1200, 3)).toEqual({ columns: 3, cardWidth: 320 });
    // A count that cannot fit at the 140 px floor is clamped to what fits.
    expect(gridLayout(900, 10)).toEqual({ columns: 6, cardWidth: 140 });
    // The offered range is 2–10 (UI-08): out-of-range requests clamp into it.
    expect(gridLayout(1900, 1).columns).toBe(2);
    expect(gridLayout(1900, 11).columns).toBe(10);
  });

  it("AC-31: at 900, 1280 and 1900 px, for Auto and every manual 2–10 count, the card is the derived width capped at 320 and the row never exceeds the container", () => {
    const expected: Record<number, Record<number, [number, number]>> = {
      900: { 0: [3, 292], 2: [2, 320], 3: [3, 292], 4: [4, 216], 5: [5, 170], 6: [6, 140], 7: [6, 140], 8: [6, 140], 9: [6, 140], 10: [6, 140] },
      1280: { 0: [5, 246], 2: [2, 320], 3: [3, 320], 4: [4, 311], 5: [5, 246], 6: [6, 203], 7: [7, 172], 8: [8, 149], 9: [8, 149], 10: [8, 149] },
      1900: { 0: [8, 227], 2: [2, 320], 3: [3, 320], 4: [4, 320], 5: [5, 320], 6: [6, 306], 7: [7, 261], 8: [8, 227], 9: [9, 200], 10: [10, 179] },
    };
    for (const [container, cases] of Object.entries(expected)) {
      const width = Number(container);
      for (const [requested, [columns, cardWidth]] of Object.entries(cases)) {
        const override = Number(requested) === 0 ? null : Number(requested);
        const layout = gridLayout(width, override);
        expect(layout, `container ${width}, ${override === null ? "Auto" : `manual ${override}`}`).toEqual({
          columns,
          cardWidth,
        });
        // Capped and floored, and the row of cards fits the container — the
        // "no horizontal scrollbar" half of AC-31.
        expect(layout.cardWidth).toBeGreaterThan(0);
        expect(layout.cardWidth).toBeLessThanOrEqual(MAX_CARD_WIDTH);
        expect(layout.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_WIDTH);
        expect(layout.columns * layout.cardWidth + (layout.columns - 1) * CARD_GAP).toBeLessThanOrEqual(width);
        // The row-block height is the derived card height (AC-31's other half):
        // the grid's windowing unit is one card plus the gap.
        expect(cellHeight(layout.cardWidth)).toBe(cardHeight(layout.cardWidth) + CARD_GAP);
      }
    }
  });

  it("the cover keeps the A4 ratio at every width; the 220 px card measures 375 px (the 5 px content inset, UI-03 as modified by DR-245)", () => {
    // The inset cover box is the card's inner width minus the 5 px inset on
    // each side: 208×295 inside a 220 card (the superseded 218×309 anchor is
    // recorded in DR-245). The card carries the inset top and bottom: the text
    // block stays 70 px, the height formula prices the inset.
    expect(coverWidth(220)).toBe(208);
    expect(coverHeight(220)).toBe(295);
    expect(cardHeight(220)).toBe(375);
    expect(cardHeight(140)).toBe(coverHeight(140) + 80);
    expect(cardHeight(320)).toBe(coverHeight(320) + 80);
    // Monotonic: a wider card is a taller card, so a row block is uniform
    // within one resize.
    for (const width of [140, 180, 220, 260, 300, 320]) {
      expect(cardHeight(width)).toBeLessThan(cardHeight(width + 1));
    }
    // The cap is what stops a poster: the widest card the app can draw.
    expect(coverHeight(MAX_CARD_WIDTH)).toBe(437);
  });
});
