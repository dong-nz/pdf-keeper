<script lang="ts">
  // List row (UI-02, §5.3.7 metrics, UI-06, UI-03 as modified): height is the
  // windowing slot — 64 px, plus one 18 px line per metadata field the
  // document has (DR-85) — so the reserved offsets and the rendered box are the
  // same number. No checkbox and no tag badges (UI-03); the actions line
  // carries favorite, details and delete. This component is one of only two
  // that subscribe to a document (R4.3); selection state is derived here, so
  // theme/hover/bulk changes never re-render other rows.
  import { library } from "$lib/state/library.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { rowHeight, ROW_COVER_WIDTH, ROW_COVER_HEIGHT } from "$lib/virtual";
  import { formatBytes, formatDate } from "$lib/format";
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
    tabindex = -1,
    nextId,
  }: {
    doc: DocumentDto;
    actions: UiAction<DocumentDto>[];
    tabindex?: number;
    // The id of the document rendered directly below this row (DR-246);
    // undefined for the last row of the library.
    nextId?: number;
  } = $props();

  const selected = $derived(library.selection.has(doc.id));
  // DR-246: this row's bottom separator is the shared boundary with the row
  // below it — it carries the accent when that row is selected. Derived from
  // the selection store (R5.1) — the kit's ContextMenu.Trigger wraps each
  // row, so a CSS sibling rule cannot reach the row below.
  const boundarySelected = $derived(nextId !== undefined && library.selection.has(nextId));
  let rowEl = $state<HTMLDivElement | undefined>();

  function rowClick(event: MouseEvent) {
    // Select mode (UI-18, DR-99d, §3.9): off — the default — a plain click only
    // takes the roving-tabindex focus the row already takes; Ctrl/Meta/Shift is
    // the pointer path to a selection in BOTH modes. Activation is identical in
    // both: double-click, Enter or the Open action (the released D1 alignment,
    // FR-08 untouched).
    if (!layout.selectMode && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      rowEl?.focus();
      return;
    }
    library.toggleSelection(doc.id, event.shiftKey);
  }
</script>

<ContextMenu items={actions} target={doc}>
  <div
    class="row"
    bind:this={rowEl}
    style="height: {rowHeight(doc)}px"
    data-row-id={doc.id}
    data-selected={selected || undefined}
    data-boundary-selected={boundarySelected || undefined}
    data-missing={doc.missing || undefined}
    tabindex={tabindex}
    role="button"
    aria-label={doc.title}
    onclick={rowClick}
    ondblclick={() => void library.open(doc.id)}
    onkeydown={(event) => {
      if (event.key === "Enter") void library.open(doc.id);
      else if (event.key === " ") {
        event.preventDefault();
        library.toggleSelection(doc.id, event.shiftKey);
      }
    }}
  >
    <Cover coverPath={doc.cover_path} width={ROW_COVER_WIDTH} height={ROW_COVER_HEIGHT} alt="" />

    <span class="main">
      <span class="title-cell">
        <!-- UI-37 (AC-87): full text through the app's own tooltip (the D4
             wrapper pattern); no native title on any text line. -->
        <Tooltip text={doc.title}>
          {#snippet control({ props })}
            <span class="title-line" {...props}>{doc.title}</span>
          {/snippet}
        </Tooltip>
        {#if doc.author}
          <Tooltip text={doc.author}>
            {#snippet control({ props })}
              <span class="author-line" {...props}>{doc.author}</span>
            {/snippet}
          </Tooltip>
        {/if}
        {#if doc.notes}
          <Tooltip text={doc.notes}>
            {#snippet control({ props })}
              <span class="notes-line" {...props}>{doc.notes}</span>
            {/snippet}
          </Tooltip>
        {/if}
      </span>
      <MissingBadge {doc} />
    </span>

    <span class="filename">{doc.filename}</span>

    <span class="meta tabular">
      <span class="size">{formatBytes(doc.size)}</span>
      <span class="date">{formatDate(doc.added_at)}</span>
    </span>

    <RowActions {doc} {actions} />
  </div>
</ContextMenu>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    /* The height is set inline from `rowHeight()` so it can never drift from
       the windowing slot (DR-85); --row-height / --row-line are the same
       numbers in the design layer. */
    min-height: var(--row-height);
    padding: 0 12px;
    border-bottom: 1px solid var(--border-hairline);
    cursor: default;
    outline: none;
  }

  .row:hover {
    background: var(--surface-1);
  }

  /* UI-38 (DR-220, the row treatment re-cut by DR-246): the dedicated
     selection ground stays; the boundary is the separator itself — the
     selected row's bottom border and the border of the row directly before a
     selected row render in the ramp's accent, so every boundary adjacent to a
     selection is exactly one accent line, including between two adjacent
     selected rows (the separator is shared by construction). No inset ring on
     rows: ring + separator read as the double line the user reported. */
  .row[data-selected] {
    background: var(--selection-tint);
    border-bottom-color: var(--accent);
  }

  .row[data-boundary-selected] {
    border-bottom-color: var(--accent);
  }

  .row[data-missing] .title-line,
  .row[data-missing] .filename {
    color: var(--text-tertiary);
  }

  /* UI-38 (DR-220, the DR-198 danger rule extended): the missing-file flag
     on the stronger selection ground takes the hover value — the base value
     measures 4.16 on the 20 % tint, the hover value 5.31. */
  .row[data-selected] :global(.missing-flag) {
    color: var(--warning-hover);
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Title cell (UI-06): the title, then one line per stored field that has a
     value. An empty field renders no line and reserves no space. */
  .title-cell {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title-line {
    font-size: var(--text-14);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author-line,
  .notes-line {
    height: var(--row-line);
    line-height: var(--row-line);
    font-size: var(--text-12);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author-line {
    color: var(--text-secondary);
  }

  .notes-line {
    color: var(--text-tertiary);
  }

  .filename {
    font-family: var(--font-mono);
    font-size: var(--text-12);
    color: var(--text-secondary);
    max-width: 220px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: none;
  }

  .meta {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    font-size: var(--text-12);
    color: var(--text-tertiary);
    /* UI-23 (AC-45): the fixed column — 96 px reserves the widest shipped
       figure string with room, and the content is right-aligned, so the
       column's left edge and the figures' right edge are the same on every
       row regardless of filename length. The text column flexes with the
       existing ellipsis rules; the width-based column drop is unchanged. */
    flex: none;
    width: 96px;
    text-align: right;
  }

  /* Width-based column drop (§5.3.7): title and cover never give way. */
  @container (max-width: 1100px) {
    .filename {
      display: none;
    }
  }

  @container (max-width: 900px) {
    .meta {
      display: none;
    }
  }
</style>
