<script lang="ts">
  // Grid card (UI-02 as modified by UI-03/UI-08/UI-18): its width and height
  // are the geometry `DocumentGrid` derived from the container (§3.10) — the
  // cover scales with the card at the shipped 218:309 ratio (DR-83), and the
  // text block stays a fixed height so the windowing unit stays computable.
  // Subscribes to its document only (R4.3).
  import { library } from "$lib/state/library.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { cardHeight, coverHeight } from "$lib/virtual";
  import { t } from "$lib/i18n";
  import { formatBytes, formatDate } from "$lib/format";
  import ContextMenu from "./ContextMenu.svelte";
  import Cover from "./Cover.svelte";
  import MissingBadge from "./MissingBadge.svelte";
  import RowActions from "./RowActions.svelte";
  import type { UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";

  let {
    doc,
    actions,
    cardWidth,
    tabindex = -1,
  }: {
    doc: DocumentDto;
    actions: UiAction<DocumentDto>[];
    cardWidth: number;
    tabindex?: number;
  } = $props();

  const selected = $derived(library.selection.has(doc.id));
  let cardEl = $state<HTMLDivElement | undefined>();

  // Cover geometry (UI-08/DR-83 as re-derived by DR-99): the inner width of the
  // card at the shipped 218:309 ratio, from the same pure helpers the grid's
  // windowing math uses — 218×309 at 220, 318×451 at the 320 cap.
  const coverW = $derived(cardWidth - 2);
  const coverH = $derived(coverHeight(cardWidth));
  const cardH = $derived(cardHeight(cardWidth));

  function cardClick(event: MouseEvent) {
    // Select mode (UI-18, DR-99d, §3.9): off — the default — a plain click only
    // takes the roving-tabindex focus the card already takes; Ctrl/Meta/Shift is
    // the pointer path to a selection in BOTH modes. Activation is identical in
    // both: double-click, Enter or the Open action (the released D1 alignment,
    // FR-08 untouched).
    if (!layout.selectMode && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      cardEl?.focus();
      return;
    }
    library.toggleSelection(doc.id, event.shiftKey);
  }
</script>

<ContextMenu items={actions} target={doc}>
  <div
    class="card"
    bind:this={cardEl}
    style="width: {cardWidth}px; height: {cardH}px"
    data-row-id={doc.id}
    data-selected={selected || undefined}
    data-missing={doc.missing || undefined}
    tabindex={tabindex}
    role="button"
    aria-label={doc.title}
    onclick={cardClick}
    ondblclick={() => void library.open(doc.id)}
    onkeydown={(event) => {
      if (event.key === "Enter") void library.open(doc.id);
      else if (event.key === " ") {
        event.preventDefault();
        library.toggleSelection(doc.id, event.shiftKey);
      }
    }}
  >
    <span class="cover-wrap">
      <Cover coverPath={doc.cover_path} width={coverW} height={coverH} alt={t("card.coverAlt", { title: doc.title })} />
      {#if doc.missing}
        <span class="missing overlay">
          <MissingBadge {doc} />
        </span>
      {/if}
    </span>

    <span class="body">
      <span class="title" title={doc.title}>{doc.title}</span>
      {#if doc.author}
        <span class="author-line" title={doc.author}>{doc.author}</span>
      {/if}
      <span class="meta tabular">
        <span>{formatBytes(doc.size)}</span>
        <span>·</span>
        <span>{formatDate(doc.added_at)}</span>
      </span>
    </span>

    <span class="actions-slot"><RowActions {doc} {actions} /></span>
  </div>
</ContextMenu>

<style>
  .card {
    position: relative;
    /* Width and height are both inline from the derived grid geometry (§3.10,
       DR-99) — the card box and the windowing block are the same numbers. */
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    background: var(--surface-1);
    cursor: default;
    outline: none;
  }

  .card:hover {
    background: var(--surface-2);
  }

  .card[data-selected] {
    border-color: var(--accent);
    background: var(--accent-quiet);
  }

  .card[data-missing] .title {
    color: var(--text-tertiary);
  }

  .cover-wrap {
    position: relative;
    display: block;
    padding: 10px 10px 0;
  }

  .overlay {
    position: absolute;
    z-index: 2;
  }

  .missing.overlay {
    left: 18px;
    bottom: 8px;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px 10px;
  }

  .title {
    font-size: var(--text-13);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: calc(2 * 19px);
  }

  .author-line {
    font-size: var(--text-12);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    gap: 6px;
    font-size: var(--text-12);
    color: var(--text-tertiary);
    margin-top: auto;
  }

  .actions-slot {
    position: absolute;
    right: 8px;
    bottom: 8px;
  }
</style>
