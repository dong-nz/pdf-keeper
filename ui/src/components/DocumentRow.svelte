<script lang="ts">
  // List row (UI-02, §5.3.7 metrics, UI-06): height is the windowing slot —
  // 48 px, plus one 18 px line per metadata field the document has (DR-85), so
  // the reserved offsets and the rendered box are the same number. This
  // component is one of only two that subscribe to a document (R4.3);
  // selection state is derived here, so theme/hover/bulk changes never
  // re-render other rows.
  import { library } from "$lib/state/library.svelte";
  import { rowHeight } from "$lib/virtual";
  import { t } from "$lib/i18n";
  import { formatBytes, formatDate } from "$lib/format";
  import ContextMenu from "./ContextMenu.svelte";
  import Cover from "./Cover.svelte";
  import CategoryChips from "./CategoryChips.svelte";
  import MissingBadge from "./MissingBadge.svelte";
  import StarButton from "./StarButton.svelte";
  import RowActions from "./RowActions.svelte";
  import type { UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";

  let {
    doc,
    actions,
    tabindex = -1,
  }: { doc: DocumentDto; actions: UiAction<DocumentDto>[]; tabindex?: number } = $props();

  const selected = $derived(library.selection.has(doc.id));

  function rowClick(event: MouseEvent) {
    // D1 (DR-66): a click selects; activation is double-click, Enter or the
    // Open action — the released spec's rule. Shift/Ctrl selection unchanged.
    library.toggleSelection(doc.id, event.shiftKey);
  }
</script>

<ContextMenu items={actions} target={doc}>
  <div
    class="row"
    style="height: {rowHeight(doc)}px"
    data-row-id={doc.id}
    data-selected={selected || undefined}
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
    <button
      class="checkbox"
      class:checked={selected}
      role="checkbox"
      aria-checked={selected}
      aria-label={t("row.select")}
      title={t("row.selectRangeHint")}
      onclick={(event) => {
        event.stopPropagation();
        library.toggleSelection(doc.id, event.shiftKey);
      }}
    >
      {#if selected}
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      {/if}
    </button>

    <StarButton
      pressed={doc.favorite}
      label={doc.favorite ? t("row.unfavorite") : t("row.favorite")}
      onchange={(value) => library.setFavorite(doc.id, value)}
    />

    <Cover coverPath={doc.cover_path} width={34} height={48} alt="" />

    <span class="main">
      <span class="title-cell">
        <span class="title-line" title={doc.title}>{doc.title}</span>
        {#if doc.author}
          <span class="author-line" title={doc.author}>{doc.author}</span>
        {/if}
        {#if doc.notes}
          <span class="notes-line" title={doc.notes}>{doc.notes}</span>
        {/if}
      </span>
      <CategoryChips {doc} />
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

  .row[data-selected] {
    background: var(--accent-quiet);
  }

  .row[data-missing] .title-line,
  .row[data-missing] .filename {
    color: var(--text-tertiary);
  }

  .checkbox {
    width: 18px;
    height: 18px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    color: var(--text-on-accent);
    background: transparent;
  }

  .checkbox:checked,
  .checkbox.checked {
    background: var(--accent);
    border-color: var(--accent);
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
    gap: 12px;
    font-size: var(--text-12);
    color: var(--text-tertiary);
    flex: none;
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
