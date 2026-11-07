// The reader's core invariants (SPEC-v0.0.6 §3.3): page geometry is exact
// math from the document's own point sizes, zoom walks only the fixed steps,
// image requests stay inside the command's accepted range, and a typed page
// failure becomes the window's error state. These are the numbers AC-65/66/72
// measure in the real app; the math itself is proven here.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { appPdfPage } = vi.hoisted(() => ({
  appPdfPage: vi.fn<(id: number, page: number, width: number) => Promise<string>>(),
}));

vi.mock("../../api", () => ({
  libraryGetDocument: vi.fn(),
  appPdfDocument: vi.fn(),
  appPdfPage,
  appOpenDocument: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset:///${path}`,
}));

import {
  FIT_ZOOM,
  PAGE_GAP,
  ReaderStore,
  REQUEST_WIDTH_MAX,
  REQUEST_WIDTH_MIN,
  ZOOM_STEPS,
  imageRequestWidth,
  stepZoom,
} from "./reader.svelte";
import type { PdfDocDto } from "../types";

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
    const store = storeAt(816); // 612 pt × 4/3 at zoom 100 %
    expect(store.pageWidth()).toBeCloseTo(816, 6);
    const heights = store.pageHeights();
    expect(heights[0]).toBeCloseTo((816 * 792) / 612, 6);
    expect(heights[2]).toBeCloseTo((816 * 612) / 792, 6);
  });

  it("every zoom step scales the width by exactly that percent (AC-66)", () => {
    const store = storeAt(816);
    for (const zoom of ZOOM_STEPS) {
      store.zoom = zoom;
      expect(store.pageWidth()).toBeCloseTo((816 * zoom) / 100, 6);
    }
  });

  it("resizing re-derives fit-width — the zoom is relative to it, not absolute", () => {
    const store = storeAt(816);
    const at816 = store.pageHeights()[0];
    store.fitWidth = 1200; // the window was widened
    expect(store.pageWidth()).toBeCloseTo(1200, 6);
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

describe("zoom walk (UI-30)", () => {
  it("− / + move through the fixed steps and clamp at the ends", () => {
    expect(stepZoom(FIT_ZOOM, -1)).toBe(75);
    expect(stepZoom(75, -1)).toBe(50);
    expect(stepZoom(50, -1)).toBe(50); // the floor stays 50 %
    expect(stepZoom(200, 1)).toBe(300);
    expect(stepZoom(300, 1)).toBe(300); // the ceiling stays 300 %
  });

  it("an unknown current value restarts from fit-width, never invents a step", () => {
    expect(stepZoom(137, 1)).toBe(125); // restarts at fit-width, then steps
    expect(stepZoom(137, -1)).toBe(75);
  });

  it("the store's changeZoom only ever produces listed steps", () => {
    const store = storeAt(816);
    for (let i = 0; i < 10; i++) store.changeZoom(1);
    expect(ZOOM_STEPS).toContain(store.zoom);
    expect(store.zoom).toBe(300);
    store.fitWidthZoom();
    expect(store.zoom).toBe(FIT_ZOOM);
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
    store.changeZoom(+3); // 100 → 200 %: a 1 632 px target, above the 1 400 px cap
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
