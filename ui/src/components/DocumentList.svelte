<script lang="ts">
  // Virtualized list: mounted nodes = viewport window only (§5.3.5).
  // Arrow navigation moves roving focus between mounted rows.
  import DocumentRow from "./DocumentRow.svelte";
  import { library } from "$lib/state/library.svelte";
  import type { WindowRange } from "$lib/virtual";
  import type { UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";
  import { t } from "$lib/i18n";

  let { win, actions }: { win: WindowRange; actions: UiAction<DocumentDto>[] } = $props();

  const slice = $derived(library.rows.slice(win.start, win.end));

  // Roving tabindex: exactly one row is Tab-reachable at a time (R4.4).
  let tabId = $state<number | null>(null);

  function tabFor(doc: DocumentDto, index: number): number {
    if (tabId !== null) return doc.id === tabId ? 0 : -1;
    return index === 0 ? 0 : -1;
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
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-row-id]"));
    const index = rows.indexOf(current);
    const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    next?.focus();
  }
</script>

<!-- the roving-tabindex container delegates arrow keys from focused rows (R4.4) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="spacer" role="list" aria-label={t("a11y.documentList")} style="height: {win.totalHeight}px" onkeydown={onKeydown} onfocusin={onFocusin}>
  <div class="window" style="transform: translateY({win.padTop}px)">
    {#each slice as doc, i (doc.id)}
      <DocumentRow {doc} {actions} tabindex={tabFor(doc, i)} />
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
</style>
