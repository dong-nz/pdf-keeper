<script lang="ts">
  // Grid card (UI-02 as modified by UI-03/UI-08/UI-18): its width and height
  // are the geometry `DocumentGrid` derived from the container (§3.10) — the
  // cover scales with the card at the shipped 218:309 ratio (DR-83), and the
  // text block stays a fixed height so the windowing unit stays computable.
  // Subscribes to its document only (R4.3).
  import { library } from "$lib/state/library.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { cardHeight, coverHeight, coverWidth } from "$lib/virtual";
  import { t } from "$lib/i18n";
  import ContextMenu from "./ContextMenu.svelte";
  import Cover from "./Cover.svelte";
  import MissingBadge from "./MissingBadge.svelte";
  import RowActions from "./RowActions.svelte";
  import Tooltip from "./Tooltip.svelte";
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

  // Cover geometry (UI-08/DR-83 as re-derived by DR-99 and DR-245): the inset
  // cover box from the same pure helpers the grid's windowing math uses —
  // 208×295 at a 220 card, 308×437 at the 320 cap.
  const coverW = $derived(coverWidth(cardWidth));
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
          <MissingBadge {doc} variant="card" />
        </span>
      {/if}
    </span>

    <span class="body">
      <!-- UI-37 (AC-87): the full text is the app's own tooltip (the D4
           wrapper pattern), not a native title — the OS theme never draws
           anything in this app. -->
      <Tooltip text={doc.title}>
        {#snippet control({ props })}
          <span class="title" {...props}>{doc.title}</span>
        {/snippet}
      </Tooltip>
      {#if doc.author}
        <Tooltip text={doc.author}>
          {#snippet control({ props })}
            <span class="author-line" {...props}>{doc.author}</span>
          {/snippet}
        </Tooltip>
      {/if}
      <!-- UI-03 as modified (DR-183, §3.8): no size/date meta line — the
           freed space stays inside the fixed text block (geometry unchanged).
           The list row's meta column is formatBytes/formatDate's only
           remaining consumer. -->
    </span>

    <span class="actions-slot"><RowActions {doc} {actions} /></span>
  </div>
</ContextMenu>

<style>
  .card {
    position: relative;
    /* Width and height are both inline from the derived grid geometry (§3.10,
       DR-99) — the card box and the windowing block are the same numbers.
       UI-03 as modified (DR-245): the content is inset 5 px from the card's
       own edges — the card ground (the selection tint when selected) renders
       as a visible frame around the cover and text. box-sizing: border-box
       (base.css) keeps the inline box exact. */
    display: flex;
    flex-direction: column;
    padding: var(--card-content-pad);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    background: var(--surface-1);
    cursor: default;
    outline: none;
  }

  .card:hover {
    background: var(--surface-2);
  }

  /* UI-38 (DR-220): the dedicated selection ground; the card's 1 px border
     already turns accent, the inset ring is the same treatment as the row
     (a card has no border on the unselected ground the row uses). */
  .card[data-selected] {
    border-color: var(--accent);
    background: var(--selection-tint);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .card[data-missing] .title {
    color: var(--text-tertiary);
  }

  .cover-wrap {
    position: relative;
    display: block;
    /* UI-03 as modified (DR-245): the card's 5 px content inset (its padding)
       frames the cover; the cover box is `coverWidth(cardWidth)` — the inner
       width minus the inset — from the shared helper. The superseded D6 rule
       ("no padding — the cover starts at the card's inner top-left") is
       recorded in DR-245. */
  }

  /* Inside a card the cover carries no border of its own (the user's decision,
     DR-245) and keeps its radius rule — now a rounded image on the card's
     ground, no longer merged with the card border. The list row's cover keeps
     its own border and 3 px radius (the row has no card border to merge with). */
  .cover-wrap :global(.cover) {
    border: none;
    border-radius: calc(var(--radius-control) - 1px);
  }

  .overlay {
    position: absolute;
    z-index: 2;
  }

  .missing.overlay {
    /* 8 px from the cover's left edge — the same visual offset the old
       10 px padding + 8 px produced. */
    left: 8px;
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

  .actions-slot {
    position: absolute;
    right: 8px;
    bottom: 8px;
  }

  /* UI-03 as modified (DR-184, §3.8): the action ground — one compact pill
     behind the whole actions group, on the card side only. The app's
     existing overlay language (the menus' and dialogs' fill/border/shadow
     triple) on --surface-0, the surface every ramp's icon colors were
     authored against (the shipped contrast guard covers it). The pill
     appears exactly when the actions line does (RowActions' hover/focus
     rule) — at rest the slot is empty and must not paint a box. The
     buttons themselves are untouched: same 32×32 boxes, colors and hover
     fills (AC-33 parity unchanged). List rows carry no action ground. */
  :global(.card:hover) .actions-slot,
  :global(.card:focus-within) .actions-slot {
    background: var(--surface-0);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    padding: 4px;
    box-shadow: var(--shadow-overlay);
  }
</style>
