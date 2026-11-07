// The reader window store (SPEC-v0.0.6 §3.3). Per-window by construction:
// each reader webview is its own JS context and runs exactly one instance —
// no UI state crosses windows, and nothing here touches the DOM: geometry is
// exact (computed from the document's point sizes), never measured.

import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../../api";
import { asAppError } from "../types";
import type { AppErrorPayload, PdfDocDto } from "../types";
import { indexAt, stackOffsets } from "$lib/virtual";

/** UI-30 fixed zoom steps: percentages relative to fit-width. */
export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300] as const;
/** Fit-width is the default — the 100 % step (UI-30). */
export const FIT_ZOOM = 100;
/** The page stack's gap (UI-30): the same 12 px the document views use
 *  (`--document-gap` / `CARD_GAP`), restated as a constant the same way. */
export const PAGE_GAP = 12;
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

/** The next step of the − / + walk (UI-30): clamped at the ends, never a
 *  value outside the fixed list. An unknown current value restarts at
 *  fit-width. */
export function stepZoom(current: number, delta: number): number {
  const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
  const at = index === -1 ? ZOOM_STEPS.indexOf(FIT_ZOOM) : index;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + delta))];
}

export class ReaderStore {
  status = $state<ReaderStatus>("loading");
  error = $state<AppErrorPayload | null>(null);
  doc = $state<PdfDocDto | null>(null);
  /** The strip shows the document name (UI-30); the row read supplies it —
   *  `app_pdf_document` carries geometry only (§3.2), and the row is the
   *  existing whitelisted source of the filename. */
  documentName = $state("");
  zoom = $state<number>(FIT_ZOOM);
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
  /** Set by ReaderView on every measure: the scroller's viewport height —
   *  the distance one `PgUp`/`PgDn` travels (UI-30). */
  viewportHeight = $state(0);
  /** The scroller's position, written by ReaderView on every measure
   *  (DR-155): the single source both the page label and the mount window
   *  derive from, so they update in one flush and can never be read
   *  inconsistent. */
  scrollTop = $state(0);
  /** The page the reader is on (UI-30's page field): derived from the
   *  store's own scroll position — the one source the control strip's
   *  label and the view's mount window both read (DR-155). Before the
   *  first measurement the geometry is degenerate and `pageAt` over a
   *  zero-height stack would name the last page, so the position stays
   *  page 1, where the scroller actually is (DR-154). */
  currentPage = $derived(this.pageWidth() <= 0 ? 1 : this.pageAt(this.pageOffsets(), this.scrollTop));
  /** Requests in flight, keyed by page with the width they were asked at:
   *  scrolling back and forth over a page must not fire the same request
   *  twice before the first one lands. */
  #pending = new Map<number, number>();

  constructor(docId: number) {
    this.docId = docId;
  }

  /** `PgUp`/`PgDn` (UI-30): one viewport per step, through the view's
   *  scroller. */
  scrollViewport(pages: number): void {
    this.onScrollBy?.(pages * this.viewportHeight);
  }

  /** Load: the row for the strip's name, the geometry for everything else.
   *  A typed failure — including a file deleted after this window opened —
   *  becomes the window's error state (§3.2/§3.3, AC-69). */
  async load(): Promise<void> {
    this.status = "loading";
    this.error = null;
    try {
      const row = await api.libraryGetDocument(this.docId);
      this.documentName = row.filename;
      this.doc = await api.appPdfDocument(this.docId);
      this.status = "ready";
    } catch (error) {
      this.error = asAppError(error);
      this.status = "error";
    }
  }

  /** A page's CSS width at the current zoom: fit-width-relative, uniform
   *  across pages (AC-66: displayed width = zoom × fit-width width). */
  pageWidth(): number {
    return this.fitWidth * (this.zoom / 100);
  }

  /** Per-page CSS heights from the exact point geometry (§3.3): the aspect
   *  ratio is the document's own, so the stack's offsets are computable
   *  from data alone — the list's no-measurement rule, applied to pages. */
  pageHeights(): number[] {
    if (!this.doc) return [];
    const width = this.pageWidth();
    return this.doc.pages.map((page) => (width * page.height_pt) / page.width_pt);
  }

  /** Stack prefix offsets including the gap — the input `window()` expects. */
  pageOffsets(): number[] {
    return stackOffsets(this.pageHeights(), PAGE_GAP);
  }

  /** 1-based page index at a scroll position (the page field's value). */
  pageAt(offsets: number[], scrollTop: number): number {
    if (offsets.length < 2) return 1;
    return indexAt(offsets, scrollTop) + 1;
  }

  /** Jump to a 1-based page: clamped to the document, delivered through the
   *  view's scroller (UI-30: page field, prev/next, `Home`/`End`). */
  goToPage(page: number): void {
    if (!this.doc || this.doc.page_count === 0) return;
    const clamped = Math.min(Math.max(1, Math.trunc(page)), this.doc.page_count);
    // +1 px (DR-148): the compositor snaps a scroll to device pixels, which
    // can land a fraction short of the page top — `pageAt` would then name
    // the previous page. One pixel inside the target page makes the jump
    // exact for any snap and is invisible to the user.
    this.onScrollTo?.(this.pageOffsets()[clamped - 1] + 1);
  }

  /** − / + between the fixed steps (UI-30). */
  changeZoom(delta: number): void {
    this.zoom = stepZoom(this.zoom, delta);
  }

  /** Fit-width control: back to the 100 % default (UI-30). */
  fitWidthZoom(): void {
    this.zoom = FIT_ZOOM;
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
    const width = this.pageWidth();
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
