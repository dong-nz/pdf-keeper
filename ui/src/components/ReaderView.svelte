<script lang="ts">
  // The reader's page layout (UI-30 continuous stack; UI-34 adds the
  // single-page and facing-pair layouts — the store's `viewMode` is the
  // single source, and every mode keeps the mount rule: only viewport-near
  // pages are requested, with per-page geometry from the store's exact math
  // (never measured)). Continuous: the released spacer + translateY pattern
  // with the standard 12 px gap and the standard scrollbar (base.css global
  // rules). Facing: rows of consecutive pairs, row geometry from the pair's
  // taller page. Single (revised by DR-204): exactly one mounted page in a
  // scrolling container — centered when it fits, top-aligned when taller —
  // with edge navigation: continued wheel at a content edge advances one
  // page per full page pitch. All modes center the mounted unit
  // horizontally (DR-205): auto margins center it below fit width and
  // collapse to zero above it, so an over-wide page stays fully reachable.
  import { CONTENT_GUTTER, OVERSCAN, window as mountWindow } from "$lib/virtual";
  import { edgeStep, type ReaderStore } from "$lib/state/reader.svelte";
  import { t } from "$lib/i18n";

  let {
    store,
  }: {
    store: ReaderStore;
  } = $props();

  let scroller: HTMLDivElement | undefined = $state();

  const mode = $derived(store.viewMode);
  const heights = $derived(store.pageHeights());
  const pageCount = $derived(store.doc?.page_count ?? 0);
  // DR-155: the mount window and the page label derive from the store's
  // own scroll position — one source, one flush, never read inconsistent.
  // Facing mode windows over rows (UI-34); continuous over pages.
  const win = $derived(
    mode === "facing"
      ? mountWindow(store.scrollTop, store.viewportHeight, store.rowOffsets())
      : mountWindow(store.scrollTop, store.viewportHeight, store.pageOffsets()),
  );
  // Single mode mounts exactly the current page (UI-34: index-driven).
  const singlePage = $derived(store.currentPage);
  const singleHeight = $derived(heights[singlePage - 1] ?? 0);
  // DR-154: until the first measurement there is no geometry — a zero-height
  // stack makes `pageAt` report the last page and a width-0 request waste a
  // raster. The page rendering and the page requests wait for the measured
  // width; the window shows its loading surface until then, and the store's
  // page position stays at page 1, where the scroller actually is.
  const measured = $derived(store.fitWidth > 0);

  // The mount rule (UI-30/AC-65): images are requested for the mounted
  // window only, never for the whole document — at 1 000 pages this stays
  // bounded by the viewport; in single mode the mount is one page (UI-34).
  // `requestPage` no-ops for pages already fetched at the current width, so
  // scrolling and re-renders re-request nothing.
  // The order (NFR-08 / DR-150): the current page is requested first, and
  // the rest of the window follows only after it has arrived — the page the
  // user asked for leads its queue, and a raster at a zoom the user has
  // left behind is never requested.
  $effect(() => {
    if (!measured) return;
    store.requestPage(store.currentPage);
    const currentWidth = store.pageWidth(store.currentPage);
    const image = store.images.get(store.currentPage);
    if (!(image && image.width === currentWidth)) return;
    if (mode === "single") {
      // Prefetch window (UI-34/AC-79; DR-219's neighbours widened to the
      // ±OVERSCAN window by DR-224): once the current page's image arrives,
      // the current page ± 6 are requested at the same width — the same
      // bounded lookahead the continuous mount window carries (one shared
      // rule, `OVERSCAN`). Queued movement-direction-first: the side the
      // reader is moving leads the other side. The mount rule is untouched:
      // the mount stays one page; the window only serves images into the
      // store's cache, thirteen requests per state whatever the document.
      const center = store.currentPage;
      const ahead = store.lastNavDirection >= 0 ? 1 : -1;
      for (const side of [ahead, -ahead]) {
        for (let step = 1; step <= OVERSCAN; step++) {
          const page = center + side * step;
          if (page >= 1 && page <= pageCount) store.requestPage(page);
        }
      }
      return;
    }
    if (mode === "facing") {
      for (let row = win.start; row < win.end; row++) {
        for (const page of [2 * row + 1, 2 * row + 2]) {
          if (page !== store.currentPage && page <= pageCount) store.requestPage(page);
        }
      }
      return;
    }
    for (let index = win.start; index < win.end; index++) {
      if (index + 1 !== store.currentPage) store.requestPage(index + 1);
    }
  });

  // Navigation plumbing (UI-30): the store computes targets, the scroller
  // performs the motion — same callback pattern as `library.onQueryReset`.
  // The notch callback (UI-39/DR-228) is the single-mode keyboard wheel:
  // the view applies the DR-227 edge rule, the store routes the modes.
  $effect(() => {
    store.onScrollTo = (offsetPx) => scroller?.scrollTo({ top: offsetPx });
    store.onScrollBy = (deltaPx) => scroller?.scrollBy({ top: deltaPx });
    store.onNotch = (deltaPx) => notchScroll(deltaPx);
    return () => {
      store.onScrollTo = null;
      store.onScrollBy = null;
      store.onNotch = null;
    };
  });

  // Mode-switch handoff (UI-34: "changing mode keeps `currentPage`"): the
  // view performs the jump once the new layout is mounted — at the moment
  // of the switch the old scroller element is gone. Effects run after the
  // DOM update, so the new scroller and its `onScrollTo` registration (the
  // effect above, declared first, runs first) are in place when this one
  // reads the nonce.
  let revealedNonce = 0;
  $effect(() => {
    const nonce = store.revealNonce;
    if (nonce === 0 || nonce === revealedNonce) return;
    revealedNonce = nonce;
    store.goToPage(store.pendingReveal);
  });

  // Edge navigation (single mode, DR-204; immediate rule per DR-227): a
  // wheel event whose direction points past a reached content edge advances
  // exactly one page through the same `goToPage` path the controls use —
  // no accumulation, and one event never advances more than one page. The
  // landing rule is unchanged: a forward step starts the next page at its
  // top, a backward step lands at the previous page's bottom edge. The
  // keyboard notch handler (UI-39) runs the same rule through `edgeStep`.
  function stepFromEdge(step: number): void {
    store.goToPage(singlePage + step);
    requestAnimationFrame(() => {
      if (!scroller) return;
      scroller.scrollTo({ top: step > 0 ? 0 : scroller.scrollHeight });
    });
  }

  function edgeNavigate(e: WheelEvent) {
    const el = scroller;
    if (!el || mode !== "single" || !measured) return;
    const step = edgeStep(e.deltaY, el.scrollTop, el.clientHeight, el.scrollHeight);
    if (step !== 0) stepFromEdge(step);
  }

  // The keyboard notch (UI-39/DR-228): the single-mode counterpart of one
  // wheel event — at a reached edge the same page step, otherwise the
  // container scrolls by the notch.
  function notchScroll(deltaPx: number): void {
    const el = scroller;
    if (!el || mode !== "single" || !measured) return;
    const step = edgeStep(deltaPx, el.scrollTop, el.clientHeight, el.scrollHeight);
    if (step !== 0) {
      stepFromEdge(step);
      return;
    }
    el.scrollBy({ top: deltaPx });
  }

  function measure() {
    if (!scroller) return;
    // DR-155: the position belongs to the store — the label and the mount
    // window both derive from it, in the same flush.
    store.scrollTop = scroller.scrollTop;
    store.viewportHeight = scroller.clientHeight;
    // Fit-width is derived from the content box (AC-66): the window minus
    // the two standard gutters (UI-19), exactly as DocumentArea measures it.
    store.fitWidth = Math.max(0, scroller.clientWidth - 2 * CONTENT_GUTTER);
  }

  $effect(() => {
    if (!scroller) return;
    // DR-158: the callback only reads; the state write goes to one
    // requestAnimationFrame per frame. Writing $state inside the observer's
    // delivery step re-renders the page stack in the same step, the
    // old-width pages transiently overflow the new scroller box, the
    // resulting scrollbar change re-triggers the observer — and Chromium ends
    // the round with "ResizeObserver loop completed with undelivered
    // notifications". Letting the delivery round finish first applies the
    // new geometry once, cleanly, at most one frame later.
    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!scroller) return;
        // Fit-width re-derives on every resize (UI-30/AC-66): the geometry is
        // computed from the new width, the mounted pages re-request at it.
        store.fitWidth = Math.max(0, scroller.clientWidth - 2 * CONTENT_GUTTER);
        // The viewport height is measured here too — `observe` fires once
        // immediately, so the first PgUp/PgDn already knows its travel
        // distance (a scroll-only measurement would make it a no-op).
        store.viewportHeight = scroller.clientHeight;
      });
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });
</script>

{#snippet pageBox(page: number, height: number)}
  {@const width = store.pageWidth(page)}
  {@const image = store.images.get(page)}
  <div class="page" style="width: {width}px; height: {height}px">
    {#if image && image.width === width}
      <img src={image.src} alt={t("reader.pageAlt", { page })} style="width: {width}px; height: {height}px" />
    {:else}
      <!-- The honest skeleton (UI-29): a neutral ground while the
           request is in flight — no fake content, no spinner copy. -->
      <div class="page-placeholder" role="img" aria-label={t("reader.pageAlt", { page })}></div>
    {/if}
  </div>
{/snippet}

{#if mode === "single"}
  <!-- Single page (UI-34, revised by DR-204): exactly one mounted page in
       a scrolling container — centered when it fits, top-aligned when
       taller, so a fit-width page is reachable to its bottom edge;
       continued wheel at a content edge navigates (edgeNavigate). The
       content gutters apply the same way; fit-width measures this box. -->
  <div class="reader-single" bind:this={scroller} onwheel={edgeNavigate}>
    {#if store.status === "ready" && measured}
      {@render pageBox(singlePage, singleHeight)}
    {/if}
  </div>
{:else}
  <div class="reader-scroll" bind:this={scroller} onscroll={measure}>
    {#if store.status === "ready" && measured && win.end > win.start}
      <div class="stack" style="height: {win.totalHeight}px">
        <div class="window" style="transform: translateY({win.padTop}px)">
          {#if mode === "facing"}
            <!-- Facing (UI-34): rows of consecutive pairs (1|2, 3|4, … —
                 DR-180); the row is the taller page's height, the pair's
                 inner gap is the standard one. An unpaired last page
                 renders alone in its row — no special case. -->
            {#each Array.from({ length: win.end - win.start }, (_, i) => win.start + i) as row (row)}
              <div class="row">
                {#each [2 * row + 1, 2 * row + 2] as page (page)}
                  {#if page <= pageCount}
                    {@render pageBox(page, heights[page - 1])}
                  {/if}
                {/each}
              </div>
            {/each}
          {:else}
            {#each Array.from({ length: win.end - win.start }, (_, i) => win.start + i) as index (index)}
              {@render pageBox(index + 1, heights[index])}
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .reader-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    /* DR-152: with a windowed mount the browser's default scroll anchoring
       compensates transient layout shifts above the viewport and drags the
       settled position a page pitch off target; the position the app
       measures must be the position it requested. */
    overflow-anchor: none;
    /* UI-19: the standard content inset; the window keeps its inset: 0
       block (padTop/padBottom and the mount bound are unaffected), and the
       pages fill the padded content box — the same rule the list follows. */
    padding: 0 var(--content-gutter);
    box-sizing: border-box;
  }

  .stack {
    position: relative;
  }

  /* Facing mode's pair row (UI-34): two pages, the standard gap, the
     shorter page top-aligned so the row's height is the taller one's.
     DR-205: auto margins center the row below fit width and collapse to
     zero above it (an over-wide row stays fully reachable). */
  .row {
    display: flex;
    align-items: flex-start;
    gap: var(--card-gap);
    margin-inline: auto;
  }

  /* Single page (UI-34, revised by DR-204): a scrolling container —
     vertical always, horizontal when zoomed beyond the width. The page
     carries auto margins on all four sides: centered when it fits,
     top-/start-aligned when larger, and every edge stays reachable
     (`place-content: center` on a grid would clip a taller page's top
     beyond scroll reach — the pattern this replaces). Inside the same
     content gutters; fit-width measures this box. */
  .reader-single {
    min-height: 0;
    overflow: auto;
    display: flex;
    padding: 0 var(--content-gutter);
    box-sizing: border-box;
  }

  .reader-single .page {
    margin: auto;
  }

  .window {
    display: flex;
    flex-direction: column;
    /* The standard 12 px gap (UI-11/UI-30): the CSS reads the token, the
       offsets read `PAGE_GAP` — the same token/constant lockstep rule
       `virtual.ts` states for `--card-gap`/`CARD_GAP`. */
    gap: var(--card-gap);
  }

  .page {
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
    /* DR-205: horizontal centering in the continuous stack — auto margins
       center a page below fit width and collapse to zero above it. */
    margin-inline: auto;
  }

  .page img {
    display: block;
  }

  .page-placeholder {
    width: 100%;
    height: 100%;
    background: var(--surface-1);
  }
</style>
