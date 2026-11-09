<script lang="ts">
  // The reader control strip (UI-30 as modified by SPEC-v0.0.7 §3.3): the
  // table-of-contents control first when the document has an outline
  // (UI-33, position per DR-207), then page navigation (prev / next, the
  // `n / N` page field), the zoom control (UI-30 as re-anchored by DR-221:
  // a zoom select carrying Fit width / Fit page / Actual Size and the fixed
  // ladder, the numeric readout in its trigger, with − / + walking the
  // ladder), and the view-mode control (UI-34: three icon-only toggle
  // buttons, active mode active). The order here is the order the modified
  // requirement specifies. Values flow through the reader store only.
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import TocPanel from "./TocPanel.svelte";
  import Tooltip from "./Tooltip.svelte";
  import {
    ZOOM_STEPS,
    type ReaderStore,
    type ReaderViewMode,
    type ReaderZoomMode,
  } from "$lib/state/reader.svelte";
  import { t, type MsgKey } from "$lib/i18n";
  import type { IconName } from "./icons";

  // The view-mode control (UI-34): icon-only buttons with tooltips, the
  // UI-13 pattern; the active mode renders active through the released
  // toggle state (`aria-pressed`, UI-09).
  const MODE_BUTTONS: { mode: ReaderViewMode; icon: IconName; labelKey: MsgKey }[] = [
    { mode: "single", icon: "page-single", labelKey: "reader.view.single" },
    { mode: "continuous", icon: "page-stack", labelKey: "reader.view.continuous" },
    { mode: "facing", icon: "page-spread", labelKey: "reader.view.facing" },
  ];

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

  // The zoom select's fit-mode items (UI-30/DR-221), in menu order.
  const ZOOM_MODES: ReaderZoomMode[] = ["fit-width", "fit-page", "actual"];
  const MODE_LABELS: Record<ReaderZoomMode, MsgKey> = {
    "fit-width": "reader.fitWidth",
    "fit-page": "reader.zoom.fitPage",
    actual: "reader.zoom.actual",
  };
  const zoomLabel = $derived(
    store.zoom.mode === "percent" ? `${store.zoom.percent}%` : t(MODE_LABELS[store.zoom.mode]),
  );
  const zoomModeActive = (mode: ReaderZoomMode): boolean => store.zoom.mode === mode;
</script>

<div class="reader-controls">
  <!-- The table-of-contents control (UI-33): rendered only when the
       document carries an outline — a document without one offers no
       control. Position per DR-207: the first control of the strip,
       before the page-navigation group. The panel itself is `TocPanel`. -->
  {#if store.outline.length > 0}
    <TocPanel {store} />
  {/if}

  <div class="group">
    <Tooltip text={t("reader.previous")}>
      {#snippet control({ props })}
        <button
          {...props}
          type="button"
          class="control icon-button"
          data-tauri-drag-region="false"
          aria-label={t("reader.previous")}
          disabled={currentPage <= 1}
          onclick={() => store.stepPage(-1)}
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
          aria-label={t("reader.next")}
          disabled={currentPage >= pageCount}
          onclick={() => store.stepPage(1)}
        >
          <Icon name="chevron-right" />
        </button>
      {/snippet}
    </Tooltip>
  </div>

  <span class="spacer"></span>

  <div class="group">
    <!-- The zoom select (UI-30 as re-anchored by DR-221): the trigger
         carries the readout - the current mode's name or the fixed
         percentage - and the menu offers exactly Fit width / Fit page /
         Actual Size and the fixed ladder, the current state checked (the
         released menu skin). -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="control zoom-select" data-tauri-drag-region="false">
        <span class="zoom-value">{zoomLabel}</span>
        <Icon name="chevron-down" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="menu zoom-menu">
        <!-- Registered like every other open menu (DR-228): with the zoom
             select open the arrow keys belong to it — the reader key map's
             arrows no-op, the kit's own menu navigation owns the keys. -->
        <OverlayAnchor />
        {#each ZOOM_MODES as mode (mode)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={zoomModeActive(mode) || undefined}
            onSelect={() => store.setZoomMode(mode)}
          >
            <span class="item-label">
              <span>{t(MODE_LABELS[mode])}</span>
            </span>
            {#if zoomModeActive(mode)}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
        <DropdownMenu.Separator class="menu-sep" />
        {#each ZOOM_STEPS as percent (percent)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={store.zoom.mode === "percent" && store.zoom.percent === percent || undefined}
            onSelect={() => store.setZoomPercent(percent)}
          >
            <span class="item-label">
              <span>{percent}%</span>
            </span>
            {#if store.zoom.mode === "percent" && store.zoom.percent === percent}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
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

  <div class="group">
    {#each MODE_BUTTONS as button (button.mode)}
      <Tooltip text={t(button.labelKey)}>
        {#snippet control({ props })}
          <button
            {...props}
            type="button"
            class="control icon-button"
            data-tauri-drag-region="false"
            aria-pressed={store.viewMode === button.mode}
            aria-label={t(button.labelKey)}
            onclick={() => store.setViewMode(button.mode)}
          >
            <Icon name={button.icon} />
          </button>
        {/snippet}
      </Tooltip>
    {/each}
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

  /* The zoom select trigger (UI-30/DR-221): the readout label plus the
     chevron, laid out like the released text buttons with a trailing glyph
     (the menu sub-triggers' pattern). */
  .zoom-select {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .zoom-value {
    font-variant-numeric: tabular-nums;
  }
</style>
