<script lang="ts">
  // List row (UI-02, §5.3.7 metrics): 48px fixed height. This component is
  // one of only two that subscribe to a document (R4.3); selection state is
  // derived here, so theme/hover/bulk changes never re-render other rows.
  import { library } from "$lib/state/library.svelte";
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
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      library.toggleSelection(doc.id, event.shiftKey);
      return;
    }
    void library.open(doc.id);
  }
</script>

<ContextMenu items={actions} target={doc}>
  <div
    class="row"
    data-row-id={doc.id}
    data-selected={selected || undefined}
    data-missing={doc.missing || undefined}
    tabindex={tabindex}
    role="button"
    aria-label={doc.title}
    onclick={rowClick}
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
      <span class="title">{doc.title}</span>
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
    height: var(--row-height);
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

  .row[data-missing] .title,
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

  .title {
    font-size: var(--text-14);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
