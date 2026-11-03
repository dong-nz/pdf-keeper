<script lang="ts">
  // Category badges on rows/cards: max 3 + "+N" (UI-03).
  import { t } from "$lib/i18n";
  import type { DocumentDto } from "$lib/types";

  let { doc }: { doc: DocumentDto } = $props();

  const shown = $derived(doc.categories.slice(0, 3));
  const extra = $derived(doc.categories.length - shown.length);
</script>

{#if shown.length > 0}
  <span class="category-chips">
    {#each shown as name (name)}
      <span class="chip"><span>{name}</span></span>
    {/each}
    {#if extra > 0}
      <span class="chip more">{t("row.categoryMore", { count: extra })}</span>
    {/if}
  </span>
{/if}

<style>
  .category-chips {
    display: inline-flex;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }
</style>
