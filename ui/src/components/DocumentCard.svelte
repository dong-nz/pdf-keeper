<script lang="ts">
  // Grid card (UI-02): 220×389 — cover 220×311 (A4), 10px padding, 2-line
  // title clamp, chips + meta. Subscribes to its document only (R4.3).
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatBytes, formatDate } from "$lib/format";
  import ContextMenu from "./ContextMenu.svelte";
  import Cover from "./Cover.svelte";
  import CategoryChips from "./CategoryChips.svelte";
  import MissingBadge from "./MissingBadge.svelte";
  import StarButton from "./StarButton.svelte";
  import RowActions from "./RowActions.svelte";
  import Icon from "./Icon.svelte";
  import type { UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";

  let {
    doc,
    actions,
    tabindex = -1,
  }: { doc: DocumentDto; actions: UiAction<DocumentDto>[]; tabindex?: number } = $props();

  const selected = $derived(library.selection.has(doc.id));

  function cardClick(event: MouseEvent) {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      library.toggleSelection(doc.id, event.shiftKey);
      return;
    }
    void library.open(doc.id);
  }
</script>

<ContextMenu items={actions} target={doc}>
  <div
    class="card"
    data-row-id={doc.id}
    data-selected={selected || undefined}
    data-missing={doc.missing || undefined}
    tabindex={tabindex}
    role="button"
    aria-label={doc.title}
    onclick={cardClick}
    onkeydown={(event) => {
      if (event.key === "Enter") void library.open(doc.id);
      else if (event.key === " ") {
        event.preventDefault();
        library.toggleSelection(doc.id, event.shiftKey);
      }
    }}
  >
    <span class="cover-wrap">
      <Cover coverPath={doc.cover_path} width={218} height={309} alt={t("card.coverAlt", { title: doc.title })} />
      <button
        class="checkbox overlay"
        class:checked={selected}
        role="checkbox"
        aria-checked={selected}
        aria-label={t("row.select")}
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
      <span class="card-star overlay">
        <StarButton
          pressed={doc.favorite}
          label={doc.favorite ? t("row.unfavorite") : t("row.favorite")}
          onchange={(value) => library.setFavorite(doc.id, value)}
        />
      </span>
      {#if doc.missing}
        <span class="missing overlay">
          <MissingBadge {doc} />
        </span>
      {/if}
    </span>

    <span class="body">
      <span class="title">{doc.title}</span>
      <CategoryChips {doc} />
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
    width: var(--card-width);
    height: var(--card-height);
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

  .checkbox.overlay {
    left: 18px;
    top: 18px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    background: var(--surface-0);
    color: var(--text-on-accent);
    opacity: 0;
  }

  .card:hover .checkbox.overlay,
  .card:focus-within .checkbox.overlay,
  .checkbox:checked {
    opacity: 1;
  }

  .checkbox:checked {
    background: var(--accent);
    border-color: var(--accent);
  }

  .card-star {
    right: 14px;
    top: 14px;
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
