<script lang="ts">
  // Virtualized grid: the window unit is a block of `columns` cards — one
  // row block is 401px tall, so the same windowing math applies (§5.3.5).
  import DocumentCard from "./DocumentCard.svelte";
  import { library } from "$lib/state/library.svelte";
  import type { WindowRange } from "$lib/virtual";
  import type { UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";
  import { t } from "$lib/i18n";

  let { win, actions, columns }: { win: WindowRange; actions: UiAction<DocumentDto>[]; columns: number } = $props();

  const blocks = $derived.by(() => {
    const out: DocumentDto[][] = [];
    for (let block = win.start; block < win.end; block++) {
      const docs = library.rows.slice(block * columns, (block + 1) * columns);
      if (docs.length > 0) out.push(docs);
    }
    return out;
  });

  // Roving tabindex, same rule as the list (R4.4).
  let tabId = $state<number | null>(null);

  function tabFor(doc: DocumentDto, flatIndex: number): number {
    if (tabId !== null) return doc.id === tabId ? 0 : -1;
    return flatIndex === 0 ? 0 : -1;
  }

  function onFocusin(event: FocusEvent) {
    const target = event.target;
    const el = target instanceof Element ? target.closest<HTMLElement>("[data-row-id]") : null;
    if (el) tabId = Number(el.dataset.rowId);
  }

  function onKeydown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const current = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
    if (!current) return;
    event.preventDefault();
    const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row-id]"));
    const index = cards.indexOf(current);
    cards[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  }
</script>

<!-- the roving-tabindex container delegates arrow keys from focused cards (R4.4) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="spacer" role="list" aria-label={t("a11y.documentGrid")} style="height: {win.totalHeight}px" onkeydown={onKeydown} onfocusin={onFocusin}>
  <div class="window" style="transform: translateY({win.padTop}px)">
    {#each blocks as block, blockIndex (block[0].id)}
      <div class="block">
        {#each block as doc, colIndex (doc.id)}
          <DocumentCard {doc} {actions} tabindex={tabFor(doc, blockIndex * columns + colIndex)} />
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .spacer {
    position: relative;
    width: 100%;
  }

  .window {
    position: absolute;
    inset: 0;
    height: max-content;
  }

  .block {
    display: flex;
    gap: var(--card-gap);
    padding: 0 12px var(--card-gap);
    height: var(--cell-height);
    align-items: flex-start;
  }
</style>
