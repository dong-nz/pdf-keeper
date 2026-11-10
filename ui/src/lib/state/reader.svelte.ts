// The reader window store (SPEC-v0.0.6 §3.3). Per-window by construction:
// each reader webview is its own JS context and runs exactly one instance —
// no UI state crosses windows, and nothing here touches the DOM: geometry is
// exact (computed from the document's point sizes), never measured.

import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../../api";
import { asAppError } from "../types";
import type { AppErrorPayload, OutlineEntry, PdfDocDto } from "../types";
import { indexAt, stackOffsets } from "$lib/virtual";

/** UI-30 fixed zoom steps (the ladder unchanged by DR-221): percentages
 *  relative to the page's actual size - 100 % is Actual size, the page's
 *  true dimensions (SPEC-v0.0.7 §3.16). */
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300] as const;

/** The zoom state (UI-30 as re-anchored by DR-221): a fit mode - fit-width
 *  (the released default), fit-page (the whole page visible in the viewport),
 *  actual (100 % of the page's true size) - or one of the fixed percentages,
 *  relative to the page's actual size. */
export type ReaderZoomMode = "fit-width" | "fit-page" | "actual";
export type ReaderZoom = { mode: ReaderZoomMode } | { mode: "percent"; percent: number };

/** A page's CSS width at its actual size: points are 72/inch, CSS pixels
 *  96/inch - the released rendering math, now the percentage anchor
 *  (100 % = this width, AC-96). */
export function actualSizeWidth(widthPt: number): number {
  return (widthPt * 4) / 3;
}

/** What percentage of the page's actual size a display width represents -
 *  the value the − / + walk continues from when it leaves a fit mode
 *  (UI-30/DR-221). */
export function effectivePercent(displayWidth: number, widthPt: number): number {
  return (displayWidth / actualSizeWidth(widthPt)) * 100;
}
/** The page stack's gap (UI-30): the same 12 px the document views use
 *  (`--document-gap` / `CARD_GAP`), restated as a constant the same way. */
export const PAGE_GAP = 12;

/** One wheel notch (UI-39/DR-228): the keyboard counterpart of a wheel
 *  event — the distance a single notch scrolls (§3.6). */
export const SCROLL_NOTCH = 100;

/** The edge test of the DR-227 rule (UI-34/UI-39): the page step a delta
 *  produces at a reached content edge — +1 past the bottom edge, −1 past
 *  the top edge, 0 when the edge is not reached in the delta's direction.
 *  The 2 px margins are the container's rounding tolerance the wheel
 *  handler used; the helper is the single rule both callers share. */
export function edgeStep(
  delta: number,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
  const atTop = scrollTop <= 2;
  if (delta > 0 && atBottom) return 1;
  if (delta < 0 && atTop) return -1;
  return 0;
}
/** `app_pdf_page`'s accepted request range (the command validates the same;
 *  mirroring it here keeps a rounding edge from producing a rejected call). */
export const REQUEST_WIDTH_MIN = 100;
export const REQUEST_WIDTH_MAX = 4000;
/** Image resolution cap: devicePixelRatio at most 2× (spec §3.3). */
export const MAX_PIXEL_RATIO = 2;
/** Fast-render cap (DR-151, preview width per DR-153): the preview stage
 *  requests `min(display width in CSS px, this cap)` — a raster at or below
 *  it displays in ≈ 150–200 ms on the reference machine. A larger device
 *  target is requested in two stages — preview first, full target replacing
 *  it in place; at devicePixelRatio 1 below the cap the preview equals the
 *  target and the request stays single-stage. */
export const PREVIEW_WIDTH_MAX = 1400;

export type ReaderStatus = "loading" | "ready" | "error";

/** View modes (UI-34, DR-180): the store's `viewMode` is the single source
 *  for the layout, the strip control's active state, and the navigation
 *  semantics (DR-156's one-state-source discipline). `continuous` is the
 *  released default; pairs are consecutive in reading order (1|2, 3|4, …).
 *  Named apart from the document-area `ViewMode` in `lib/types.ts` — list
 *  versus grid is a different axis. */
export type ReaderViewMode = "single" | "continuous" | "facing";

export interface PageImage {
  /** The CSS width this image was fetched at — a zoom change makes the
   *  entry stale and the view re-requests. */
  width: number;
  src: string;
}

/** The image request width for a CSS width: device pixels, capped 2×,
 *  clamped into the command's accepted range. Pure, like the rest of this
 *  module's math. */
export function imageRequestWidth(cssWidth: number, devicePixelRatio: number): number {
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_PIXEL_RATIO);
  return Math.min(REQUEST_WIDTH_MAX, Math.max(REQUEST_WIDTH_MIN, Math.round(cssWidth * ratio)));
}

/** The next step of the − / + walk (UI-30 as re-anchored by DR-221): from a
 *  percentage - possibly a fit mode's effective one - the nearest ladder
 *  value in the delta direction (the snap-in AC-96 names); clamped at the
 *  ends, never a value outside the fixed list. */
export function stepZoom(current: number, delta: number): number {
  if (delta > 0) {
    for (const step of ZOOM_STEPS) if (step > current) return step;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  if (delta < 0) {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] < current) return ZOOM_STEPS[i];
    }
    return ZOOM_STEPS[0];
  }
  // delta 0: the nearest ladder value to the current percentage.
  let nearest: number = ZOOM_STEPS[0];
  for (const step of ZOOM_STEPS) {
    if (Math.abs(step - current) < Math.abs(nearest - current)) nearest = step;
  }
  return nearest;
}

export class ReaderStore {
  status = $state<ReaderStatus>("loading");
  error = $state<AppErrorPayload | null>(null);
  doc = $state<PdfDocDto | null>(null);
  /** The strip shows the document name (UI-30); the row read supplies it —
   *  `app_pdf_document` carries geometry only (§3.2), and the row is the
   *  existing whitelisted source of the filename. */
  documentName = $state("");
  zoom = $state<ReaderZoom>({ mode: "fit-width" });
  /** The selected view mode (UI-34): the single source for the layout in
   *  `ReaderView`, the strip control's active state, and the navigation
   *  semantics. Default `continuous` — the released behavior. */
  viewMode = $state<ReaderViewMode>("continuous");
  /** The document outline (FR-18): empty for documents without one — the
   *  strip then renders no ToC control (UI-33). Loaded with the geometry. */
  outline = $state<OutlineEntry[]>([]);
  /** The ToC collapse state (UI-33 as revised by DR-218): the outline indexes
   *  whose subtree is hidden. Initialized when the outline loads: every parent
   *  entry - the panel opens collapsed to the first level (the user's choice,
   *  over the agent's all-expanded recommendation). Session-scoped: this store
   *  lives exactly as long as the reader window (no persistence, OQ-45 closed
   *  as no-persistence). */
  tocCollapsed = $state<ReadonlySet<number>>(new Set());
  /** The toolbar toggle's mode (UI-33 as revised by DR-223): true = the
   *  control's next activation is expand-all, false = collapse-all.
   *  Flip-flop, per the user's decision: it alternates on every activation
   *  and is never touched by per-entry toggles. Initialized with the set —
   *  the tree opens collapsed, so the first action is expand-all. Same
   *  session scope as the set. */
  tocExpandMode = $state(true);
  /** Single-page mode's mounted page (UI-34): in that mode the current
   *  page is index-driven, not scroll-driven; `goToPage` writes it. */
  singleIndex = $state(1);
  /** The direction of the last navigation (UI-34 as extended by DR-224):
   *  the sign of the last page delta; forward is the initial default. The
   *  single-mode prefetch window queues movement-direction-first from it. */
  lastNavDirection = $state(1);
  /** Mode-switch handoff (UI-34: "changing mode keeps `currentPage`"):
   *  switching to a scroll-driven mode records the page to land on and a
   *  nonce; `ReaderView` performs the jump once the new layout is mounted
   *  (the old scroller element is gone at the moment of the switch). */
  pendingReveal = 1;
  revealNonce = $state(0);
  /** Fit-width content width: the reader content box minus the two gutters.
   *  Set by the view on mount and on every resize — fit-width re-derives
   *  with the width (UI-30/AC-66). */
  fitWidth = $state(0);
  /** Fetched page images, keyed by 1-based page. Only viewport-near pages
   *  are ever requested (UI-30's mount rule, enforced by the view). */
  images = $state(new Map<number, PageImage>());

  readonly docId: number;
  /** Set by ReaderView: jump the scroll to an absolute stack offset. */
  onScrollTo: ((offsetPx: number) => void) | null = null;
  /** Set by ReaderView: shift the scroll by a pixel delta. */
  onScrollBy: ((deltaPx: number) => void) | null = null;
  /** Set by ReaderView (single mode): scroll one wheel notch — the view
   *  applies the DR-227 edge rule through `edgeStep` (UI-39/DR-228). */
  onNotch: ((deltaPx: number) => void) | null = null;
  /** Set by ReaderView on every measure: the scroller's viewport height —
   *  the distance one `PgUp`/`PgDn` travels (UI-30). */
  viewportHeight = $state(0);
  /** The scroller's position, written by ReaderView on every measure
   *  (DR-155): the single source both the page label and the mount window
   *  derive from, so they update in one flush and can never be read
   *  inconsistent. */
  scrollTop = $state(0);
  /** The page the reader is on (UI-30's page field): in continuous mode
   *  derived from the store's own scroll position — the one source the
   *  control strip's label and the view's mount window both read (DR-155);
   *  in single mode it is the mounted index (UI-34: index-driven); in
   *  facing mode it is the first page of the row whose span contains the
   *  viewport center (UI-34). Before the first measurement the geometry is
   *  degenerate and `pageAt` over a zero-height stack would name the last
   *  page, so the scroll-driven position stays page 1, where the scroller
   *  actually is (DR-154). */
  currentPage = $derived.by(() => {
    if (this.viewMode === "single") return this.singleIndex;
    if (this.fitWidth <= 0) return 1;
    if (this.viewMode === "facing") {
      const rows = this.rowOffsets();
      if (rows.length < 2) return 1;
      const center = this.scrollTop + this.viewportHeight / 2;
      return Math.min(2 * indexAt(rows, center) + 1, this.doc?.page_count ?? 1);
    }
    return this.pageAt(this.pageOffsets(), this.scrollTop);
  });
  /** Requests in flight, keyed by page with the width they were asked at:
   *  scrolling back and forth over a page must not fire the same request
   *  twice before the first one lands. */
  #pending = new Map<number, number>();

  constructor(docId: number) {
    this.docId = docId;
  }

  /** `PgUp`/`PgDn` (UI-30; UI-34 semantics per mode): continuous scrolls
   *  one viewport through the view's scroller; single moves one page;
   *  facing moves one row (two pages). */
  scrollViewport(pages: number): void {
    if (this.viewMode === "single") {
      this.goToPage(this.currentPage + pages);
      return;
    }
    if (this.viewMode === "facing") {
      this.goToPage(this.currentPage + 2 * pages);
      return;
    }
    this.onScrollBy?.(pages * this.viewportHeight);
  }

  /** Prev/next (UI-30; UI-34 semantics): one page, except facing mode,
   *  where the field always names a row's first page and the step is one
   *  row. The strip's buttons and nothing else call this. */
  stepPage(delta: number): void {
    this.goToPage(this.currentPage + (this.viewMode === "facing" ? 2 * delta : delta));
  }

  /** `ArrowDown`/`ArrowUp` (UI-39/DR-228): one wheel notch. Continuous and
   *  facing scroll the stack through the view's scroll callback; single
   *  delegates to the view's notch handler, which applies the DR-227 edge
   *  rule (page step at a reached edge, container scroll otherwise). */
  scrollNotch(delta: number): void {
    if (this.viewMode === "single") {
      this.onNotch?.(delta);
      return;
    }
    this.onScrollBy?.(delta);
  }

  /** Outline indexes that have children - the flat depth encoding's parent
   *  test (UI-33/§3.17): an entry is a parent exactly when the next entry
   *  is deeper. */
  tocParents(): number[] {
    const parents: number[] = [];
    for (let i = 0; i < this.outline.length - 1; i++) {
      if (this.outline[i + 1].depth > this.outline[i].depth) parents.push(i);
    }
    return parents;
  }

  isTocParent(index: number): boolean {
    const entry = this.outline[index];
    const next = this.outline[index + 1];
    return entry !== undefined && next !== undefined && next.depth > entry.depth;
  }

  /** The entries the panel renders, in order, under the current collapse
   *  state: an entry is hidden when ANY ancestor is in the hidden set (the
   *  subtree rule - collapsing a parent hides everything below it until the
   *  next entry at its own level or shallower; a nested parent's own state
   *  never overrides a collapsed ancestor above it). */
  tocVisible(): { entry: OutlineEntry; index: number }[] {
    const visible: { entry: OutlineEntry; index: number }[] = [];
    const ancestors: { depth: number; collapsed: boolean }[] = [];
    for (let i = 0; i < this.outline.length; i++) {
      const entry = this.outline[i];
      while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= entry.depth) {
        ancestors.pop();
      }
      if (!ancestors.some((ancestor) => ancestor.collapsed)) {
        visible.push({ entry, index: i });
      }
      ancestors.push({ depth: entry.depth, collapsed: this.tocCollapsed.has(i) });
    }
    return visible;
  }

  toggleTocEntry(index: number): void {
    if (!this.isTocParent(index)) return;
    const next = new Set(this.tocCollapsed);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.tocCollapsed = next;
  }

  tocExpandAll(): void {
    this.tocCollapsed = new Set();
  }

  tocCollapseAll(): void {
    this.tocCollapsed = new Set(this.tocParents());
  }

  /** The single toolbar control (UI-33/DR-223): performs the action its
   *  mode names, then flips the mode. The action always applies to the
   *  whole tree; per-entry toggles never change the mode. */
  tocToggleAll(): void {
    if (this.tocExpandMode) this.tocExpandAll();
    else this.tocCollapseAll();
    this.tocExpandMode = !this.tocExpandMode;
  }

  /** Switch view mode keeping the current page (UI-34): single mounts the
   *  kept page directly (index-driven); the scroll-driven modes record it
   *  and `ReaderView` scrolls there once the new layout is mounted — the
   *  old scroller element no longer exists at the moment of the switch. */
  setViewMode(mode: ReaderViewMode): void {
    if (mode === this.viewMode) return;
    const page = this.currentPage;
    this.viewMode = mode;
    if (mode === "single") {
      this.singleIndex = page;
      return;
    }
    this.pendingReveal = page;
    this.revealNonce++;
  }

  /** Load: the row for the strip's name, the geometry for everything else,
   *  and the outline after the geometry (FR-18/UI-33) — an empty list for
   *  documents without one. A typed failure — including a file deleted
   *  after this window opened — becomes the window's error state
   *  (§3.2/§3.3, AC-69). */
  async load(): Promise<void> {
    this.status = "loading";
    this.error = null;
    try {
      const row = await api.libraryGetDocument(this.docId);
      this.documentName = row.filename;
      this.doc = await api.appPdfDocument(this.docId);
      this.outline = await api.appPdfOutline(this.docId);
      // Default collapsed to the first level (UI-33/DR-218): every parent
      // starts in the hidden set; the toolbar toggle starts in expand mode
      // to match (DR-223).
      this.tocCollapsed = new Set(this.tocParents());
      this.tocExpandMode = true;
      this.status = "ready";
    } catch (error) {
      this.error = asAppError(error);
      this.status = "error";
    }
  }

  /** A page's CSS width at the current zoom (UI-30 as re-anchored by
   *  DR-221/AC-96, §3.16): fit-width is the released fit base; fit-page
   *  fits the whole page into the viewport (the page's own aspect through
   *  the viewport height, capped at the fit base); actual is the page's
   *  true size (`width_pt × 4/3`); a fixed percent is `actual × percent`.
   *  Mixed-size documents keep per-page widths — the stack geometry already
   *  derives each page's height from its own aspect, so only the width
   *  anchor changes. In facing mode the fit base is one half of a pair row
   *  - (content width - 12 px) / 2 (UI-34). */
  pageWidth(page: number): number {
    const doc = this.doc;
    if (!doc || this.fitWidth <= 0) return 0;
    const geometry = doc.pages[page - 1];
    if (!geometry) return 0;
    const fit =
      this.viewMode === "facing"
        ? Math.max(0, (this.fitWidth - PAGE_GAP) / 2)
        : this.fitWidth;
    const zoom = this.zoom;
    if (zoom.mode === "fit-width") return fit;
    const actual = actualSizeWidth(geometry.width_pt);
    if (zoom.mode === "actual") return actual;
    if (zoom.mode === "percent") return (actual * zoom.percent) / 100;
    const byHeight =
      this.viewportHeight > 0 ? (this.viewportHeight * geometry.width_pt) / geometry.height_pt : 0;
    return Math.min(fit, byHeight);
  }

  /** Per-page CSS heights from the exact point geometry (§3.3): the aspect
   *  ratio is the document's own, so the stack's offsets are computable
   *  from data alone — the list's no-measurement rule, applied to pages. */
  pageHeights(): number[] {
    if (!this.doc) return [];
    return this.doc.pages.map(
      (page, index) => (this.pageWidth(index + 1) * page.height_pt) / page.width_pt,
    );
  }

  /** Stack prefix offsets including the gap — the input `window()` expects. */
  pageOffsets(): number[] {
    return stackOffsets(this.pageHeights(), PAGE_GAP);
  }

  /** Facing-mode row heights (UI-34): a row's height is the taller of its
   *  pair; an unpaired last page is a row of one — the layout degrades
   *  without a special case. */
  rowHeights(): number[] {
    const heights = this.pageHeights();
    const rows: number[] = [];
    for (let index = 0; index < heights.length; index += 2) {
      rows.push(Math.max(heights[index], heights[index + 1] ?? heights[index]));
    }
    return rows;
  }

  /** Row prefix offsets — the mount window's input in facing mode; the
   *  row offset step is max(pair heights) + gap (UI-34). */
  rowOffsets(): number[] {
    return stackOffsets(this.rowHeights(), PAGE_GAP);
  }

  /** 1-based page index at a scroll position (the page field's value). */
  pageAt(offsets: number[], scrollTop: number): number {
    if (offsets.length < 2) return 1;
    return indexAt(offsets, scrollTop) + 1;
  }

  /** Jump to a 1-based page: clamped to the document, delivered through the
   *  view's scroller (UI-30: page field, prev/next, `Home`/`End`; the ToC
   *  panel's entries use the same path, UI-33). In single mode the jump
   *  changes the mounted index instead of scrolling (UI-34); in facing mode
   *  it lands on the row containing the page — the row's first page is the
   *  field's value (UI-34). */
  goToPage(page: number): void {
    if (!this.doc || this.doc.page_count === 0) return;
    const clamped = Math.min(Math.max(1, Math.trunc(page)), this.doc.page_count);
    // The movement direction for the single-mode prefetch window (DR-224):
    // the sign of this navigation's delta; a same-page jump keeps the
    // previous direction.
    const direction = Math.sign(clamped - this.currentPage);
    if (direction !== 0) this.lastNavDirection = direction;
    if (this.viewMode === "single") {
      this.singleIndex = clamped;
      return;
    }
    const facing = this.viewMode === "facing";
    const offsets = facing ? this.rowOffsets() : this.pageOffsets();
    const index = facing ? Math.floor((clamped - 1) / 2) : clamped - 1;
    // +1 px (DR-148): the compositor snaps a scroll to device pixels, which
    // can land a fraction short of the page top — `pageAt` would then name
    // the previous page. One pixel inside the target page makes the jump
    // exact for any snap and is invisible to the user.
    this.onScrollTo?.(offsets[index] + 1);
  }

  /** D23 (v0.0.8 / AC-119): a zoom change is a layout change, and the
   *  released mode-switch handoff applies to it unchanged — the scroll-driven
   *  modes record the anchor page and `ReaderView` scrolls there once the
   *  new geometry is mounted. Call it BEFORE the zoom state changes: the
   *  geometry and scroll position that name the anchor are the ones the user
   *  is looking at. Normal case: the page at the viewport's top edge — the
   *  same page the page field names. Bottom-clamped case (the AC-119
   *  sequence): when the measured scroll sits at the maximum of the current
   *  geometry, the viewport's bottom edge names the anchor — the page the
   *  user is anchored to (the last page), not the partial page the top edge
   *  happens to show after the clamp. The anchor survives the whole
   *  fit → out → fit walk: the clamped reveal lands at the maximum, the
   *  next geometry change re-anchors from the page, not from the clamped
   *  position. Single mode needs nothing: its page is index-driven and
   *  stays mounted. */
  #keepZoomAnchor(): void {
    if (this.viewMode === "single") return;
    const offsets = this.viewMode === "facing" ? this.rowOffsets() : this.pageOffsets();
    let page = this.currentPage;
    const maxScroll = Math.max(0, (offsets[offsets.length - 1] ?? 0) - this.viewportHeight);
    if (offsets.length > 1 && this.scrollTop >= maxScroll - 2) {
      page = this.pageAt(offsets, this.scrollTop + this.viewportHeight - 1);
    }
    this.pendingReveal = page;
    this.revealNonce++;
  }

  /** − / + between the fixed steps (UI-30 as re-anchored by DR-221). From a
   *  percent state the released walk over the ladder. From a fit mode the
   *  walk continues from that mode's effective percentage of the current
   *  page (AC-96: the nearest step in the pressed direction) - Fit Width on
   *  a wide page can therefore land above or below 100 %. */
  changeZoom(delta: number): void {
    const zoom = this.zoom;
    if (zoom.mode === "percent") {
      const percent = stepZoom(zoom.percent, delta);
      if (percent === zoom.percent) return; // clamped: no layout change, no re-anchor
      this.#keepZoomAnchor();
      this.zoom = { mode: "percent", percent };
      return;
    }
    const doc = this.doc;
    if (!doc || doc.pages.length === 0) return;
    const page = Math.min(Math.max(this.currentPage, 1), doc.pages.length);
    const effective = effectivePercent(this.pageWidth(page), doc.pages[page - 1].width_pt);
    this.#keepZoomAnchor();
    this.zoom = { mode: "percent", percent: stepZoom(effective, delta) };
  }

  /** The zoom select's fit-mode items (UI-30/DR-221): Fit width is the
   *  released default control, Fit page and Actual Size the new ones. */
  setZoomMode(mode: ReaderZoomMode): void {
    if (this.zoom.mode === mode) return; // unchanged geometry: no re-anchor
    this.#keepZoomAnchor();
    this.zoom = { mode };
  }

  /** The zoom select's ladder items - only listed percentages are ever set
   *  (AC-96: the select offers exactly the fixed ladder). */
  setZoomPercent(percent: number): void {
    if (this.zoom.mode === "percent" && this.zoom.percent === percent) return;
    this.#keepZoomAnchor();
    this.zoom = { mode: "percent", percent };
  }

  /** Request one page's image at the current width. A page whose entry was
   *  fetched at this width is not re-requested; a zoom change makes mounted
   *  pages stale and the view calls this again (NFR-08's ≤ 300 ms re-show:
   *  the Rust cache serves re-requests of a known width without rendering).
   *  Two stages above the fast-render cap (DR-151, preview width per
   *  DR-153): the preview at `min(CSS display width, PREVIEW_WIDTH_MAX)`
   *  lands and displays first, the full target then replaces it in place;
   *  when the preview equals the target this is a single request. */
  requestPage(page: number): void {
    if (this.status !== "ready") return;
    const width = this.pageWidth(page);
    const fetched = this.images.get(page);
    if (fetched && fetched.width === width) return;
    if (this.#pending.get(page) === width) return; // same request already in flight
    const target = imageRequestWidth(width, globalThis.devicePixelRatio ?? 1);
    // The preview is the CSS display width taken through the same range
    // clamp as the target (imageRequestWidth at ratio 1): before the first
    // fit-width measurement `width` is 0, and the raw value would be a
    // rejected request.
    const preview = Math.min(target, imageRequestWidth(width, 1), PREVIEW_WIDTH_MAX);
    this.#pending.set(page, width);
    // A stale stage completing late must not clear a newer request's guard.
    const settlePending = () => {
      if (this.#pending.get(page) === width) this.#pending.delete(page);
    };
    void api
      .appPdfPage(this.docId, page, preview)
      .then((path) => {
        this.#setImage(page, width, path);
        if (preview === target) {
          settlePending();
          return undefined;
        }
        return api.appPdfPage(this.docId, page, target).then((full) => {
          this.#setImage(page, width, full);
          settlePending();
        });
      })
      .catch((error: unknown) => {
        settlePending();
        // A failed page request on a typed error means the document is gone
        // or unopenable — the same error state the document load yields
        // (§3.2: a file deleted after the window opened yields the typed
        // error, which the window renders as its error state).
        this.error = asAppError(error);
        this.status = "error";
      });
  }

  #setImage(page: number, width: number, path: string): void {
    const next = new Map(this.images);
    next.set(page, { width, src: convertFileSrc(path) });
    this.images = next;
  }
}
