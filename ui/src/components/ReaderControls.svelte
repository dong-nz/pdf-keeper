<script lang="ts">
  // The reader control strip (UI-30): page navigation (prev / next, the
  // `n / N` page field) and zoom controls (fit-width — the 100 % default —,
  // the fixed steps walked by − / +). The order here is the order UI-30
  // specifies. Values flow through the reader store only.
  import Icon from "./Icon.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { FIT_ZOOM, type ReaderStore } from "$lib/state/reader.svelte";
  import { t } from "$lib/i18n";

  let {
    store,
  }: {
    store: ReaderStore;
  } = $props();

  const pageCount = $derived(store.doc?.page_count ?? 0);
  // DR-155: the page number is read from the store's single scroll-position
  // source — the same one the mount window derives from, never a relayed
  // copy that could lag it.
  const currentPage = $derived(store.currentPage);

  // The page field shows the page actually in view; while the user is
  // typing, their text owns the field, and it resolves on Enter/blur.
  let field = $state("1");
  let editing = $state(false);
  $effect(() => {
    if (!editing) field = String(currentPage);
  });

  function commitField(): void {
    editing = false;
    const value = Number.parseInt(field, 10);
    if (Number.isFinite(value)) store.goToPage(value);
    field = String(currentPage);
  }

  const atFit = $derived(store.zoom === FIT_ZOOM);
</script>

<div class="reader-controls">
  <div class="group">
    <Tooltip text={t("reader.previous")}>
      {#snippet control({ props })}
        <button
          {...props}
          type="button"
          class="control icon-button"
          data-tauri-drag-region="false"
          disabled={currentPage <= 1}
          onclick={() => store.goToPage(currentPage - 1)}
        >
          <Icon name="chevron-left" />
        </button>
      {/snippet}
    </Tooltip>
    <input
      class="control page-field"
      type="text"
      inputmode="numeric"
      data-tauri-drag-region="false"
      aria-label={t("reader.pageField", { page: currentPage, count: pageCount })}
      value={field}
      oninput={(event) => {
        editing = true;
        field = event.currentTarget.value;
      }}
      onkeydown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitField();
        }
      }}
      onblur={commitField}
    />
    <span class="page-total">/ {pageCount}</span>
    <Tooltip text={t("reader.next")}>
      {#snippet control({ props })}
        <button
          {...props}
          type="button"
          class="control icon-button"
          data-tauri-drag-region="false"
          disabled={currentPage >= pageCount}
          onclick={() => store.goToPage(currentPage + 1)}
        >
          <Icon name="chevron-right" />
        </button>
      {/snippet}
    </Tooltip>
  </div>

  <span class="spacer"></span>

  <div class="group">
    <button
      type="button"
      class="control"
      data-tauri-drag-region="false"
      data-active={atFit || undefined}
      onclick={() => store.fitWidthZoom()}
    >
      {t("reader.fitWidth")}
    </button>
    <Tooltip text={t("reader.zoomOut")}>
      {#snippet control({ props })}
        <button
          {...props}
          type="button"
          class="control icon-button"
          data-tauri-drag-region="false"
          aria-label={t("reader.zoomOut")}
          onclick={() => store.changeZoom(-1)}
        >
          <Icon name="minus" />
        </button>
      {/snippet}
    </Tooltip>
    <span class="zoom-value" aria-label={t("reader.zoom", { percent: store.zoom })}>{store.zoom}%</span>
    <Tooltip text={t("reader.zoomIn")}>
      {#snippet control({ props })}
        <button
          {...props}
          type="button"
          class="control icon-button"
          data-tauri-drag-region="false"
          aria-label={t("reader.zoomIn")}
          onclick={() => store.changeZoom(1)}
        >
          <Icon name="plus" />
        </button>
      {/snippet}
    </Tooltip>
  </div>
</div>

<style>
  .reader-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    height: var(--toolbar-height);
    padding: 0 var(--content-gutter);
    border-bottom: 1px solid var(--border-hairline);
    background: var(--surface-0);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .spacer {
    flex: 1;
  }

  .page-field {
    width: 56px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .page-total {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .zoom-value {
    min-width: 48px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }
</style>
