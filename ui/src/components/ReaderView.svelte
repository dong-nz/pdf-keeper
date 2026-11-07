<script lang="ts">
  // The reader's page stack (UI-30): a continuous vertical stack with the
  // standard 12 px gap and the standard scrollbar (base.css global rules),
  // mounting only viewport-near pages — the same spacer + translateY pattern
  // the document views use, with per-page geometry from the store's exact
  // math (never measured).
  import { CONTENT_GUTTER, window as mountWindow } from "$lib/virtual";
  import { type ReaderStore } from "$lib/state/reader.svelte";
  import { t } from "$lib/i18n";

  let {
    store,
  }: {
    store: ReaderStore;
  } = $props();

  let scroller: HTMLDivElement | undefined = $state();

  const heights = $derived(store.pageHeights());
  const offsets = $derived(store.pageOffsets());
  // DR-155: the mount window and the page label derive from the store's
  // own scroll position — one source, one flush, never read inconsistent.
  const win = $derived(mountWindow(store.scrollTop, store.viewportHeight, offsets));
  const pageWidth = $derived(store.pageWidth());
  // DR-154: until the first measurement there is no geometry — a zero-height
  // stack makes `pageAt` report the last page and a width-0 request waste a
  // raster. The page rendering and the page requests wait for the measured
  // width; the window shows its loading surface until then, and the store's
  // page position stays at page 1, where the scroller actually is.
  const measured = $derived(pageWidth > 0);

  // The mount rule (UI-30/AC-65): images are requested for the mounted
  // window only, never for the whole document — at 1 000 pages this stays
  // bounded by the viewport. `requestPage` no-ops for pages already fetched
  // at the current width, so scrolling and re-renders re-request nothing.
  // The order (NFR-08 / DR-150): the current page is requested first, and
  // the rest of the window follows only after it has arrived — the page the
  // user asked for leads its queue, and a raster at a zoom the user has
  // left behind is never requested.
  $effect(() => {
    if (!measured) return;
    store.requestPage(store.currentPage);
    const image = store.images.get(store.currentPage);
    if (!(image && image.width === pageWidth)) return;
    for (let index = win.start; index < win.end; index++) {
      if (index + 1 !== store.currentPage) store.requestPage(index + 1);
    }
  });

  // Navigation plumbing (UI-30): the store computes targets, the scroller
  // performs the motion — same callback pattern as `library.onQueryReset`.
  $effect(() => {
    store.onScrollTo = (offsetPx) => scroller?.scrollTo({ top: offsetPx });
    store.onScrollBy = (deltaPx) => scroller?.scrollBy({ top: deltaPx });
    return () => {
      store.onScrollTo = null;
      store.onScrollBy = null;
    };
  });

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

<div class="reader-scroll" bind:this={scroller} onscroll={measure}>
  {#if store.status === "ready" && measured && win.end > win.start}
    <div class="stack" style="height: {win.totalHeight}px">
      <div class="window" style="transform: translateY({win.padTop}px)">
        {#each Array.from({ length: win.end - win.start }, (_, i) => win.start + i) as index (index)}
          {@const page = index + 1}
          {@const height = heights[index]}
          {@const image = store.images.get(page)}
          <div class="page" style="width: {pageWidth}px; height: {height}px">
            {#if image && image.width === pageWidth}
              <img src={image.src} alt={t("reader.pageAlt", { page })} style="width: {pageWidth}px; height: {height}px" />
            {:else}
              <!-- The honest skeleton (UI-29): a neutral ground while the
                   request is in flight — no fake content, no spinner copy. -->
              <div class="page-placeholder" role="img" aria-label={t("reader.pageAlt", { page })}></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

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
