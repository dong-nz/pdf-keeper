<script lang="ts">
  // First-paint placeholder (UI-08): skeleton rows, never a spinner (§5.3.7).
  // UI-28 (AC-50): the placeholder draws the REAL row geometry — the same
  // constants `DocumentRow` measures from (R1.6), the same insets the document
  // views use (UI-19), so when data arrives the content does not move.
  import { ROW_HEIGHT, ROW_COVER_WIDTH, ROW_COVER_HEIGHT, ROW_LINE } from "$lib/virtual";

  let { rows = 8 }: { rows?: number } = $props();
</script>

<div class="skeletons" aria-hidden="true">
  {#each Array(rows) as _, i (i)}
    <div class="skeleton-row" style="height: {ROW_HEIGHT}px">
      <span class="box cover" style="width: {ROW_COVER_WIDTH}px; height: {ROW_COVER_HEIGHT}px"></span>
      <span class="line title" style="height: {ROW_LINE}px"></span>
      <span class="line meta" style="height: {ROW_LINE}px"></span>
    </div>
  {/each}
</div>

<style>
  .skeletons {
    /* The same insets the real views carry: the window gutter and the
       symmetric vertical inset (UI-19 as modified, §3.10, DR-200) and the
       row's own 12 px — the cover placeholder lands where a real cover
       lands. */
    padding: var(--content-gutter);
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: 8px; /* the real row gap (DocumentRow) */
    padding: 0 12px; /* the real row padding */
    /* height inline from ROW_HEIGHT — the windowing slot it stands in */
  }

  .box,
  .line {
    border-radius: var(--radius-control);
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s var(--ease) infinite;
  }

  /* 45×64 at the real row block height — width/height inline from the
     constants, like the real cover. */
  .cover {
    flex: none;
  }

  /* The real text column: flexes to the remaining width (its ellipsis rules
     have no cap), so the meta placeholder lands at the same right edge the
     real figures occupy. A max-width here would park the meta bar mid-row —
     the opposite of the fixed column it is meant to reserve. */
  .title {
    flex: 1;
    min-width: 0;
  }

  /* UI-23's fixed meta column: the placeholder reserves the same 96 px box,
     right-aligned like the real figures. */
  .meta {
    flex: none;
    width: 96px;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
</style>
