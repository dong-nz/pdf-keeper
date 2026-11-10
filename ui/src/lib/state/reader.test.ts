// The reader's core invariants (SPEC-v0.0.6 §3.3, view-mode semantics per
// SPEC-v0.0.7 §3.6 including the DR-224 navigation direction, the zoom
// re-anchor per §3.16 and the ToC tree per §3.5 including the DR-223
// toolbar toggle): page geometry is exact math from the document's own
// point sizes, the zoom model anchors to the page's actual size and walks
// only the fixed steps, image requests stay inside the command's accepted
// range, a typed page failure becomes the window's error state, the view
// modes keep one state source and the current page across a mode switch,
// the ToC tree hides whole subtrees under the collapse set and its toolbar
// toggle alternates, and navigation records the direction the last movement
// took. These are the numbers AC-65/72/78/79/80/96 measure in the real
// app; the math itself is proven here.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { appPdfPage, appPdfOutline, appPdfDocument, libraryGetDocument } = vi.hoisted(() => ({
  appPdfPage: vi.fn<(id: number, page: number, width: number) => Promise<string>>(),
  appPdfOutline: vi.fn<(id: number) => Promise<unknown>>(),
  appPdfDocument: vi.fn<(id: number) => Promise<unknown>>(),
  libraryGetDocument: vi.fn<(id: number) => Promise<unknown>>(),
}));

vi.mock("../../api", () => ({
  libraryGetDocument,
  appPdfDocument,
  appPdfPage,
  appPdfOutline,
  appOpenDocument: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset:///${path}`,
}));

import {
  PAGE_GAP,
  ReaderStore,
  REQUEST_WIDTH_MAX,
  REQUEST_WIDTH_MIN,
  SCROLL_NOTCH,
  ZOOM_STEPS,
  actualSizeWidth,
  edgeStep,
  imageRequestWidth,
  stepZoom,
} from "./reader.svelte";
import type { OutlineEntry, PdfDocDto } from "../types";

/** Two letter-size pages (612×792 pt) and one landscape page (792×612 pt)
 *  — the real fixture geometry (the multi-* fixtures are letter MediaBox). */
const doc: PdfDocDto = {
  page_count: 3,
  pages: [
    { width_pt: 612, height_pt: 792 },
    { width_pt: 612, height_pt: 792 },
    { width_pt: 792, height_pt: 612 },
  ],
};

function storeAt(fitWidth: number): ReaderStore {
  const store = new ReaderStore(1);
  store.doc = doc;
  store.status = "ready";
  store.fitWidth = fitWidth;
  return store;
}

describe("page geometry (exact, never measured)", () => {
  it("fit-width renders every page at the content width and its own aspect ratio", () => {
    const store = storeAt(816); // 612 pt × 4/3 — the fit base here equals actual size
    expect(store.zoom).toEqual({ mode: "fit-width" }); // the default is the fit mode (AC-96)
    expect(store.pageWidth(1)).toBeCloseTo(816, 6);
    const heights = store.pageHeights();
    expect(heights[0]).toBeCloseTo((816 * 792) / 612, 6);
    expect(heights[2]).toBeCloseTo((816 * 612) / 792, 6);
  });

  it("a fixed percent renders the page's actual size × percent — per page, in every mode (AC-96)", () => {
    const store = storeAt(816);
    for (const percent of ZOOM_STEPS) {
      store.setZoomPercent(percent);
      expect(store.pageWidth(1)).toBeCloseTo(816 * (percent / 100), 6); // 612 pt × 4/3 = 816
      expect(store.pageWidth(3)).toBeCloseTo(1056 * (percent / 100), 6); // 792 pt × 4/3 = 1 056
    }
  });

  it("Actual Size renders each page at its true dimensions (AC-96)", () => {
    const store = storeAt(816);
    store.setZoomMode("actual");
    expect(store.pageWidth(1)).toBeCloseTo(actualSizeWidth(612), 6);
    expect(store.pageWidth(3)).toBeCloseTo(actualSizeWidth(792), 6);
    // The aspect is the document's own, so the height is the true height too.
    expect(store.pageHeights()[2]).toBeCloseTo(actualSizeWidth(792) * (612 / 792), 6);
  });

  it("Fit Page fits the whole page into the viewport, capped at the fit base (AC-96)", () => {
    const store = storeAt(816);
    store.viewportHeight = 600;
    store.setZoomMode("fit-page");
    // Height-bound: the page renders exactly the viewport height.
    expect(store.pageWidth(1)).toBeCloseTo((600 * 612) / 792, 6);
    expect(store.pageHeights()[0]).toBeCloseTo(600, 6);
    expect(store.pageWidth(3)).toBeCloseTo((600 * 792) / 612, 6); // 776.5 — under the 816 base
    // A viewport taller than every page: width-bound at the fit base.
    store.viewportHeight = 1200;
    expect(store.pageWidth(1)).toBeCloseTo(816, 6);
  });

  it("resizing re-derives fit-width — the fit mode follows it, never an absolute width", () => {
    const store = storeAt(816);
    const at816 = store.pageHeights()[0];
    store.fitWidth = 1200; // the window was widened
    expect(store.pageWidth(1)).toBeCloseTo(1200, 6);
    expect(store.pageHeights()[0]).toBeCloseTo((1200 * 792) / 612, 6);
    expect(store.pageHeights()[0]).toBeGreaterThan(at816);
  });

  it("the stack offsets carry the gap and the total height, and pages resolve at their tops", () => {
    const store = storeAt(816);
    const heights = store.pageHeights();
    const offsets = store.pageOffsets();
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(heights[0] + PAGE_GAP, 6);
    expect(offsets[3]).toBeCloseTo(heights[0] + heights[1] + heights[2] + 2 * PAGE_GAP, 6);
    expect(offsets.length).toBe(doc.page_count + 1);
    // 1-based page at a scroll position: the page whose top the position touches.
    expect(store.pageAt(offsets, 0)).toBe(1);
    expect(store.pageAt(offsets, offsets[1])).toBe(2);
    expect(store.pageAt(offsets, offsets[3] - 1)).toBe(3);
  });
});

describe("navigation", () => {
  it("jumps land one pixel inside the target page's stack offset", () => {
    const store = storeAt(816);
    const delivered: number[] = [];
    store.onScrollTo = (offset) => delivered.push(offset);
    store.goToPage(2);
    // +1 px inside the page (DR-148): sub-pixel scroll snapping must not
    // land a fraction short of the page top.
    expect(delivered).toEqual([store.pageOffsets()[1] + 1]);
  });

  it("targets outside the document clamp to its first and last page", () => {
    const store = storeAt(816);
    const delivered: number[] = [];
    store.onScrollTo = (offset) => delivered.push(offset);
    store.goToPage(0);
    store.goToPage(-5);
    store.goToPage(doc.page_count + 10);
    const offsets = store.pageOffsets();
    expect(delivered).toEqual([1, 1, offsets[doc.page_count - 1] + 1]);
  });

  it("a page jump with no scroller attached does not fail", () => {
    const store = storeAt(816);
    expect(() => store.goToPage(2)).not.toThrow();
  });
});

describe("view modes (UI-34)", () => {
  it("continuous is the default and keeps the released geometry untouched", () => {
    const store = storeAt(816);
    expect(store.viewMode).toBe("continuous");
    expect(store.pageWidth(1)).toBeCloseTo(816, 6); // the released fit-width base
  });

  it("facing fit-width is half a pair row minus the gap; percents anchor to actual size in every mode", () => {
    const store = storeAt(816);
    store.setViewMode("facing");
    expect(store.pageWidth(1)).toBeCloseTo((816 - PAGE_GAP) / 2, 6);
    store.setZoomPercent(150);
    // AC-96: the percent anchor is the page's actual size in every mode —
    // an over-wide page is centered and stays fully reachable (DR-205).
    expect(store.pageWidth(1)).toBeCloseTo(816 * 1.5, 6);
  });

  it("a row is the taller page of its pair; an unpaired last page is a row of one", () => {
    const store = storeAt(816);
    const heights = store.pageHeights();
    const rows = store.rowHeights();
    expect(rows.length).toBe(2); // (1|2), then 3 alone — no special case
    expect(rows[0]).toBeCloseTo(Math.max(heights[0], heights[1]), 6);
    expect(rows[1]).toBeCloseTo(heights[2], 6);
    const offsets = store.rowOffsets();
    expect(offsets[1]).toBeCloseTo(rows[0] + PAGE_GAP, 6); // row step = max(pair) + gap
    expect(offsets.length).toBe(3);
  });

  it("facing jumps and steps land on the row containing the page; the field names its first page", () => {
    const store = storeAt(816);
    store.setViewMode("facing");
    const delivered: number[] = [];
    store.onScrollTo = (offset) => delivered.push(offset);
    const rows = store.rowOffsets();
    store.goToPage(2); // a row's second page: the jump targets the row (UI-34)
    expect(delivered[0]).toBeCloseTo(rows[0] + 1, 6);
    store.scrollTop = delivered[0];
    expect(store.currentPage).toBe(1); // the field shows the row's first page
    store.stepPage(1); // prev/next move one row
    expect(delivered[1]).toBeCloseTo(rows[1] + 1, 6);
    store.scrollTop = delivered[1];
    expect(store.currentPage).toBe(3);
    store.stepPage(1); // past the last row: clamped, the position stands
    expect(delivered[2]).toBeCloseTo(rows[1] + 1, 6);
  });

  it("the field follows the viewport center: a row crossing it owns the page number", () => {
    const store = storeAt(816);
    store.setViewMode("facing");
    const rows = store.rowOffsets();
    store.viewportHeight = 400;
    store.scrollTop = rows[1] - 200; // the viewport center lands on the second row's top
    expect(store.currentPage).toBe(3);
  });

  it("single mounts the index instead of scrolling; its navigation moves pages", () => {
    const store = storeAt(816);
    const delivered: number[] = [];
    store.onScrollTo = (offset) => delivered.push(offset);
    store.setViewMode("single");
    store.goToPage(3);
    expect(store.singleIndex).toBe(3);
    expect(store.currentPage).toBe(3);
    expect(delivered).toEqual([]); // no scroll request exists in single mode
    store.stepPage(-1);
    expect(store.currentPage).toBe(2);
    store.scrollViewport(1); // PgDn is the next page (UI-34)
    expect(store.currentPage).toBe(3);
    store.scrollViewport(1);
    expect(store.currentPage).toBe(3); // clamped at the last page
    expect(delivered).toEqual([]);
  });

  it("switching mode keeps the current page: single mounts it, scroll modes record it for the view", () => {
    const store = storeAt(816);
    store.scrollTop = store.pageOffsets()[1] + 1; // scrolled to page 2 (DR-148's target)
    expect(store.currentPage).toBe(2);
    store.setViewMode("single"); // entering single mounts the kept page
    expect(store.singleIndex).toBe(2);
    expect(store.currentPage).toBe(2);
    store.setViewMode("facing"); // a scroll-driven mode records it (the view jumps once mounted)
    expect(store.pendingReveal).toBe(2);
    expect(store.revealNonce).toBe(1);
  });
});

describe("zoom walk (UI-30 as re-anchored by DR-221)", () => {
  it("− / + move through the fixed steps and clamp at the ends", () => {
    expect(stepZoom(100, -1)).toBe(75);
    expect(stepZoom(75, -1)).toBe(50);
    expect(stepZoom(50, -1)).toBe(50); // the floor stays 50 %
    expect(stepZoom(200, 1)).toBe(300);
    expect(stepZoom(300, 1)).toBe(300); // the ceiling stays 300 %
  });

  it("a non-ladder value snaps to the nearest step in the pressed direction (AC-96)", () => {
    expect(stepZoom(137, 1)).toBe(150);
    expect(stepZoom(137, -1)).toBe(125);
    expect(stepZoom(112, 1)).toBe(125);
    expect(stepZoom(112, -1)).toBe(100);
  });

  it("from a fit mode the walk continues from the mode's effective percent of the current page (AC-96)", () => {
    // Fit width at 1 200 CSS px on a 612 pt page: effective 147.06 %.
    const store = storeAt(1200);
    store.changeZoom(1);
    expect(store.zoom).toEqual({ mode: "percent", percent: 150 });
    store.setZoomMode("fit-width");
    store.changeZoom(-1);
    expect(store.zoom).toEqual({ mode: "percent", percent: 125 });
    // Fit width on the landscape page (792 pt, actual 1 056) at the same
    // window: effective 113.6 % — + lands on 125, − on 100.
    store.setZoomMode("fit-width");
    store.scrollTop = store.pageOffsets()[2] + 1; // now on page 3
    store.changeZoom(1);
    expect(store.zoom).toEqual({ mode: "percent", percent: 125 });
    store.setZoomMode("fit-width");
    store.changeZoom(-1);
    expect(store.zoom).toEqual({ mode: "percent", percent: 100 });
  });

  it("the store's changeZoom only ever produces listed steps", () => {
    const store = storeAt(816);
    for (let i = 0; i < 10; i++) store.changeZoom(1);
    expect(store.zoom).toEqual({ mode: "percent", percent: 300 });
    store.setZoomMode("fit-width");
    expect(store.zoom).toEqual({ mode: "fit-width" });
  });

  it("the zoom select's items set exactly the modes and the ladder (AC-96)", () => {
    const store = storeAt(816);
    for (const mode of ["fit-page", "actual", "fit-width"] as const) {
      store.setZoomMode(mode);
      expect(store.zoom).toEqual({ mode });
    }
    for (const percent of ZOOM_STEPS) {
      store.setZoomPercent(percent);
      expect(store.zoom).toEqual({ mode: "percent", percent });
    }
  });
});

describe("the zoom anchor handoff (D23 / AC-119)", () => {
  it("a zoom change records the current page for the reveal after the layout change", () => {
    const store = storeAt(816);
    store.viewportHeight = 600;
    store.scrollTop = store.pageOffsets()[1]; // the viewport top edge is on page 2
    store.setZoomPercent(150);
    expect(store.pendingReveal).toBe(2);
    expect(store.revealNonce).toBe(1);
    // The reveal landed: the view is at page 2's top edge in the new geometry.
    store.scrollTop = store.pageOffsets()[1];
    store.setZoomMode("fit-page");
    expect(store.pendingReveal).toBe(2);
    expect(store.revealNonce).toBe(2);
  });

  it("a change that cannot change the geometry records no reveal", () => {
    const store = storeAt(816);
    store.setZoomMode("fit-width"); // the mode it is already in
    expect(store.revealNonce).toBe(0);
    store.setZoomPercent(50);
    store.changeZoom(-1); // clamped at the floor: no layout change
    expect(store.zoom).toEqual({ mode: "percent", percent: 50 });
    expect(store.revealNonce).toBe(1);
  });

  it("single mode records no reveal — its page is index-driven", () => {
    const store = storeAt(816);
    store.setViewMode("single");
    store.setZoomPercent(150);
    expect(store.revealNonce).toBe(0);
  });

  it("a bottom-clamped view anchors to the viewport's bottom page, not the top edge's partial one", () => {
    // The AC-119 walk's middle state: fit → zoom out clamps the scroll to the
    // maximum; the top edge then shows a partial page while the user's anchor
    // is the last page. The next geometry change must re-anchor from that page.
    const store = storeAt(816);
    store.viewportHeight = 1500;
    const offsets = store.pageOffsets();
    store.scrollTop = offsets[offsets.length - 1] - 1500; // exactly at the maximum
    expect(store.currentPage).toBe(2); // the top edge's page — not the anchor
    store.setZoomPercent(75);
    expect(store.pendingReveal).toBe(3); // the last page: the bottom edge's page
    expect(store.revealNonce).toBe(1);
  });
});

describe("the ToC tree (UI-33 as revised by DR-218)", () => {
  // The flat depth encoding the command delivers (§3.5): a parent is exactly
  // an entry followed by a deeper one.
  const outline: OutlineEntry[] = [
    { title: "Chapter 1", page: 1, depth: 1 },
    { title: "1.1 Section", page: 2, depth: 2 },
    { title: "1.1.1 Subsection", page: 3, depth: 3 },
    { title: "Chapter 2", page: 5, depth: 1 },
    { title: "2.1 Section", page: 6, depth: 2 },
  ];

  function treeStore(): ReaderStore {
    const store = storeAt(816);
    store.outline = outline;
    store.tocCollapsed = new Set(store.tocParents()); // the load-time initialization
    return store;
  }

  it("parents are exactly the entries followed by a deeper entry", () => {
    const store = storeAt(816);
    store.outline = outline;
    expect(store.tocParents()).toEqual([0, 1, 3]); // 1.1 is a parent of 1.1.1
    expect(store.isTocParent(0)).toBe(true);
    expect(store.isTocParent(1)).toBe(true);
    expect(store.isTocParent(2)).toBe(false);
    expect(store.isTocParent(4)).toBe(false); // the last entry has no child
  });

  it("the tree initializes collapsed to the first level: only top-level entries are visible (AC-78)", () => {
    const store = treeStore();
    expect([...store.tocCollapsed]).toEqual([0, 1, 3]);
    expect(store.tocVisible().map((v) => v.entry.title)).toEqual(["Chapter 1", "Chapter 2"]);
  });

  it("the outline load performs that initialization through the command path (AC-78)", async () => {
    libraryGetDocument.mockResolvedValue({ id: 1, filename: "t.pdf" });
    appPdfDocument.mockResolvedValue(doc);
    appPdfOutline.mockResolvedValue(outline);
    const store = new ReaderStore(1);
    await store.load();
    expect(store.status).toBe("ready");
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 3]);
  });

  it("expanding a parent reveals its whole subtree up to the next entry of its own level (AC-78)", () => {
    const store = treeStore();
    store.toggleTocEntry(0); // Chapter 1 opens: its direct children show, 1.1's own subtree is still collapsed
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 1, 3]);
    store.toggleTocEntry(1); // the nested subtree follows its parent's state, not the ancestor's
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 1, 2, 3]);
    store.toggleTocEntry(3); // Chapter 2 opens too
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 1, 2, 3, 4]);
    store.toggleTocEntry(0); // Chapter 1 collapses again — its whole subtree hides with it; Chapter 2, opened earlier, stays open
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 3, 4]);
  });

  it("the toolbar toggle alternates modes and drives the whole tree (AC-78, DR-223)", () => {
    const store = treeStore();
    expect(store.tocExpandMode).toBe(true); // the tree opens collapsed: the first action is expand-all
    store.tocToggleAll();
    expect(store.tocCollapsed.size).toBe(0);
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 1, 2, 3, 4]);
    expect(store.tocExpandMode).toBe(false); // the control now names collapse-all
    store.tocToggleAll();
    expect([...store.tocCollapsed]).toEqual([0, 1, 3]);
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 3]);
    expect(store.tocExpandMode).toBe(true); // and flips back
  });

  it("per-entry toggles never change the toggle's mode; its action always applies to the whole tree (AC-78, DR-223)", () => {
    const store = treeStore();
    store.toggleTocEntry(0); // a manual partial expansion…
    expect(store.tocExpandMode).toBe(true); // …leaves the mode untouched
    store.tocToggleAll(); // still expand-all — applied to the whole tree
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 1, 2, 3, 4]);
    expect(store.tocExpandMode).toBe(false);
    store.toggleTocEntry(3); // a manual collapse…
    expect(store.tocExpandMode).toBe(false); // …again leaves the mode untouched
    store.tocToggleAll(); // still collapse-all
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 3]);
  });

  it("toggling a leaf changes nothing", () => {
    const store = treeStore();
    store.toggleTocEntry(2); // 1.1.1 has no child
    expect(store.tocVisible().map((v) => v.index)).toEqual([0, 3]);
  });

  it("a document without an outline has no tree and no hidden entries", () => {
    const store = storeAt(816);
    expect(store.tocParents()).toEqual([]);
    expect(store.tocVisible()).toEqual([]);
  });
});

describe("the navigation direction (UI-34 as extended by DR-224)", () => {
  it("it follows the delta of each navigation and defaults to forward", () => {
    const store = storeAt(816);
    store.setViewMode("single");
    expect(store.lastNavDirection).toBe(1); // forward is the initial default
    store.goToPage(3);
    expect(store.lastNavDirection).toBe(1);
    store.stepPage(-1); // 3 → 2
    expect(store.lastNavDirection).toBe(-1);
    store.goToPage(2); // a same-page jump keeps the previous direction
    expect(store.lastNavDirection).toBe(-1);
    store.goToPage(1); // backward to the first page
    expect(store.lastNavDirection).toBe(-1);
    store.goToPage(3); // forward again
    expect(store.lastNavDirection).toBe(1);
  });

  it("clamped navigation records the direction of the movement actually taken", () => {
    const store = storeAt(816); // the fixture document has 3 pages
    store.setViewMode("single");
    store.goToPage(99); // clamped to 3: forward from 1
    expect(store.currentPage).toBe(3);
    expect(store.lastNavDirection).toBe(1);
    store.goToPage(-5); // clamped to 1: backward from 3
    expect(store.currentPage).toBe(1);
    expect(store.lastNavDirection).toBe(-1);
  });
});

describe("the edge rule and the keyboard notch (UI-34/UI-39 as re-derived by DR-227/DR-228)", () => {
  it("a delta at a reached edge steps exactly one page — any magnitude (DR-227)", () => {
    // A tall page: 1 556 px of content in a 660 px viewport.
    expect(edgeStep(4, 896, 660, 1556)).toBe(1); // a trackpad micro-event at the bottom edge steps
    expect(edgeStep(-4, 0, 660, 1556)).toBe(-1); // and at the top edge
  });

  it("the edge test carries the 2 px rounding margin (DR-227)", () => {
    expect(edgeStep(100, 894, 660, 1556)).toBe(1); // 894 + 660 = 1 554 ≥ 1 556 − 2
    expect(edgeStep(-100, 2, 660, 1556)).toBe(-1);
    expect(edgeStep(100, 893, 660, 1556)).toBe(0); // 1 553 is past the margin — still mid-page
  });

  it("mid-page deltas never step; the direction decides which edge counts (DR-227)", () => {
    expect(edgeStep(100, 400, 660, 1556)).toBe(0); // neither edge
    expect(edgeStep(100, 0, 660, 1556)).toBe(0); // at the top edge, scrolling forward
    expect(edgeStep(-100, 896, 660, 1556)).toBe(0); // at the bottom edge, scrolling back
  });

  it("a page fully inside the viewport steps in the delta's direction (DR-227)", () => {
    expect(edgeStep(100, 0, 1556, 1556)).toBe(1); // both edges reached at once
    expect(edgeStep(-100, 0, 1556, 1556)).toBe(-1);
  });

  it("the notch dispatch is mode-aware: single hands the edge rule to the view, the scroll modes scroll (AC-98)", () => {
    const store = storeAt(816);
    const scrolled: number[] = [];
    const notched: number[] = [];
    store.onScrollBy = (delta) => scrolled.push(delta);
    store.onNotch = (delta) => notched.push(delta);
    store.setViewMode("continuous");
    store.scrollNotch(SCROLL_NOTCH);
    store.scrollNotch(-SCROLL_NOTCH);
    store.setViewMode("facing");
    store.scrollNotch(SCROLL_NOTCH);
    store.setViewMode("single");
    store.scrollNotch(-SCROLL_NOTCH);
    expect(scrolled).toEqual([SCROLL_NOTCH, -SCROLL_NOTCH, SCROLL_NOTCH]);
    expect(notched).toEqual([-SCROLL_NOTCH]);
  });
});

describe("image request width", () => {
  it("requests device pixels at most 2× the CSS width", () => {
    expect(imageRequestWidth(800, 1)).toBe(800);
    expect(imageRequestWidth(800, 1.5)).toBe(1200);
    expect(imageRequestWidth(800, 3)).toBe(1600); // capped at 2×
  });

  it("stays inside the command's accepted range", () => {
    expect(imageRequestWidth(10, 1)).toBe(REQUEST_WIDTH_MIN);
    expect(imageRequestWidth(3000, 2)).toBe(REQUEST_WIDTH_MAX); // 6000 → 4000
    expect(imageRequestWidth(0, 1)).toBe(REQUEST_WIDTH_MIN);
  });
});

describe("page serving through the store", () => {
  beforeEach(() => {
    appPdfPage.mockReset();
    appPdfPage.mockImplementation((_id, page, width) =>
      Promise.resolve(`C:/appdata/reader/1/${page}-${width}.png`),
    );
  });

  it("serves a mounted page once per width: scrolling does not re-request it", async () => {
    const store = storeAt(816);
    store.requestPage(2);
    store.requestPage(2);
    await vi.waitFor(() => expect(store.images.has(2)).toBe(true));
    expect(appPdfPage).toHaveBeenCalledTimes(1);
    expect(appPdfPage).toHaveBeenCalledWith(1, 2, 816);
    const image = store.images.get(2)!;
    expect(image.width).toBe(816);
    expect(image.src).toContain("asset:///");
    store.requestPage(2); // already fetched at this width
    expect(appPdfPage).toHaveBeenCalledTimes(1);
  });

  it("a zoom change re-requests at the new width (NFR-08's re-show path)", async () => {
    const store = storeAt(816);
    store.requestPage(1);
    await vi.waitFor(() => expect(store.images.has(1)).toBe(true));
    store.changeZoom(-1); // 100 → 75 %
    store.requestPage(1);
    await vi.waitFor(() => expect(appPdfPage).toHaveBeenCalledTimes(2));
    expect(appPdfPage.mock.calls[1]).toEqual([1, 1, Math.round(816 * 0.75)]);
    expect(store.images.get(1)!.width).toBeCloseTo(612, 6);
  });

  it("a target above the fast-render cap previews first and refines in place (DR-151)", async () => {
    const store = storeAt(816);
    store.setZoomPercent(200); // a 1 632 px target, above the 1 400 px cap
    const full = Promise.withResolvers<string>();
    appPdfPage.mockImplementation((_id, page, width) =>
      width === 1632 ? full.promise : Promise.resolve(`C:/appdata/reader/1/${page}-${width}.png`), // full stage gated
    );
    store.requestPage(1);
    await vi.waitFor(() => expect(store.images.has(1)).toBe(true));
    expect(appPdfPage.mock.calls[0]).toEqual([1, 1, 1400]); // the preview leads
    expect(store.images.get(1)!.src).toContain("1-1400.png"); // and displays while full is pending
    await vi.waitFor(() => expect(appPdfPage.mock.calls.length).toBe(2));
    expect(appPdfPage.mock.calls[1]).toEqual([1, 1, 1632]); // the full target follows
    full.resolve("C:/appdata/reader/1/1-1632.png");
    await vi.waitFor(() => expect(store.images.get(1)!.src).toContain("1-1632.png"));
    expect(store.images.get(1)!.width).toBeCloseTo(1632, 6); // the entry stays at the CSS width
  });

  it("a request before the first fit-width measurement stays inside the command's range (DR-153)", async () => {
    // Window-start state: fitWidth is not derived yet, so the CSS width is
    // 0 — every request width must still land in [100, 4000].
    const store = storeAt(0);
    store.requestPage(1);
    await vi.waitFor(() => expect(appPdfPage).toHaveBeenCalledTimes(1));
    expect(appPdfPage.mock.calls[0]).toEqual([1, 1, 100]); // clamped, never 0
    expect(store.status).toBe("ready"); // a startup request must not error the window
  });

  it("at devicePixelRatio above 1 the preview uses the CSS display width, not the cap (DR-153)", async () => {
    // The reference machine's fit-width case: 967 CSS px at dpr 1.75 — the
    // device target (1 692) exceeds the cap, but the preview stage renders
    // at the display width; the cap only bounds display widths above it.
    const ratio = globalThis.devicePixelRatio;
    Object.defineProperty(globalThis, "devicePixelRatio", { value: 1.75, configurable: true });
    try {
      const store = storeAt(967);
      const full = Promise.withResolvers<string>();
      appPdfPage.mockImplementation((_id, page, width) =>
        width === 1692 ? full.promise : Promise.resolve(`C:/appdata/reader/1/${page}-${width}.png`), // full stage gated
      );
      store.requestPage(1);
      await vi.waitFor(() => expect(store.images.has(1)).toBe(true));
      expect(appPdfPage.mock.calls[0]).toEqual([1, 1, 967]); // the preview leads at display width
      expect(store.images.get(1)!.src).toContain("1-967.png"); // and displays while full is pending
      await vi.waitFor(() => expect(appPdfPage.mock.calls.length).toBe(2));
      expect(appPdfPage.mock.calls[1]).toEqual([1, 1, 1692]); // the full device target follows
      full.resolve("C:/appdata/reader/1/1-1692.png");
      await vi.waitFor(() => expect(store.images.get(1)!.src).toContain("1-1692.png"));
      expect(store.images.get(1)!.width).toBeCloseTo(967, 6); // the entry stays at the CSS width
    } finally {
      Object.defineProperty(globalThis, "devicePixelRatio", { value: ratio, configurable: true });
    }
  });

  it("a target at or below the fast-render cap is a single request (DR-151)", async () => {
    const store = storeAt(816);
    store.changeZoom(+1); // 100 → 125 %: 1 020 px, below the cap
    store.requestPage(1);
    await vi.waitFor(() => expect(store.images.has(1)).toBe(true));
    store.requestPage(1); // already fetched at this width
    await Promise.resolve();
    expect(appPdfPage).toHaveBeenCalledTimes(1);
    expect(appPdfPage).toHaveBeenCalledWith(1, 1, 1020);
  });

  it("a typed page failure becomes the window's error state (§3.2)", async () => {
    const store = storeAt(816);
    appPdfPage.mockImplementation(() =>
      Promise.reject({ kind: "pdf_unopenable", message: "Cannot Read PDF", document_id: null }),
    );
    store.requestPage(1);
    await vi.waitFor(() => expect(store.status).toBe("error"));
    expect(store.error?.kind).toBe("pdf_unopenable");
  });
});

describe("the scroll position is a single source (DR-155)", () => {
  it("currentPage follows the store's scrollTop through the exact offsets", () => {
    const store = storeAt(816);
    const offsets = store.pageOffsets();
    expect(store.currentPage).toBe(1);
    store.scrollTop = offsets[1] + 1; // one pixel inside page 2 — the goToPage target (DR-148)
    expect(store.currentPage).toBe(2);
    store.scrollTop = offsets[2] + 1;
    expect(store.currentPage).toBe(3);
    store.scrollTop = 0;
    expect(store.currentPage).toBe(1);
  });

  it("an unmeasured window claims page 1, the position the scroller is at (DR-154)", () => {
    const cold = storeAt(0);
    cold.scrollTop = 999_999;
    expect(cold.currentPage).toBe(1);
  });

  it("goToPage and currentPage agree: the delivered target names the page it claims", () => {
    const store = storeAt(816);
    let delivered = -1;
    store.onScrollTo = (offset) => {
      delivered = offset;
    };
    store.goToPage(3);
    expect(delivered).toBe(store.pageOffsets()[2] + 1);
    store.scrollTop = delivered;
    expect(store.currentPage).toBe(3);
  });
});
