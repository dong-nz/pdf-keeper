<script lang="ts">
  // View menu (UI-08): the single writer of the view mode and of the grid
  // column override — it replaces the shipped two-button ViewToggle. The mode
  // writes through `settings.setView`, the column count through
  // `settings.setGridColumns` (persisted per DR-44); the effective geometry is
  // derived in DocumentArea from `settings.gridColumns` (DR-83).
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { GRID_COLUMNS_MAX, GRID_COLUMNS_MIN } from "$lib/virtual";
  import { t } from "$lib/i18n";
  import type { ViewMode } from "$lib/types";

  const MODES: { mode: ViewMode; labelKey: "toolbar.view.list" | "toolbar.view.grid"; icon: "list" | "grid" }[] = [
    { mode: "list", labelKey: "toolbar.view.list", icon: "list" },
    { mode: "grid", labelKey: "toolbar.view.grid", icon: "grid" },
  ];

  let open = $state(false);

  // Narrowed once, so the counter arithmetic sees a number and not the
  // "auto" | number union (UI-08).
  const override = $derived(settings.gridColumns);
  const auto = $derived(override === "auto");
  // The counter always shows the count that is actually in effect (DR-86), so
  // − / + mean the same thing in Auto as in a manual override: Auto is only
  // the source of the number, not a different control.
  const effective = $derived(override === "auto" ? layout.autoColumns : override);

  function step(delta: number) {
    const next = Math.max(GRID_COLUMNS_MIN, Math.min(GRID_COLUMNS_MAX, effective + delta));
    if (next === effective && !auto) return;
    settings.setGridColumns(next);
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="control view-trigger">
    <Icon name="grid" />
    <span>{t("toolbar.view")}</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="menu view-menu">
    <OverlayAnchor />
    {#each MODES as option (option.mode)}
      <DropdownMenu.Item
        class="menu-item"
        data-active={settings.view === option.mode || undefined}
        onSelect={() => settings.setView(option.mode)}
      >
        <span class="item-label">
          <Icon name={option.icon} />
          <span>{t(option.labelKey)}</span>
        </span>
        {#if settings.view === option.mode}
          <Icon name="check" />
        {/if}
      </DropdownMenu.Item>
    {/each}

    <DropdownMenu.Separator class="menu-sep" />
    <div class="menu-label">{t("toolbar.view.columns")}</div>
    <DropdownMenu.Item class="menu-item" data-active={auto || undefined} onSelect={() => settings.setGridColumns("auto")}>
      <span class="item-label">
        <span>{t("toolbar.view.columns.auto")}</span>
      </span>
      {#if auto}
        <Icon name="check" />
      {/if}
    </DropdownMenu.Item>

    <div class="columns-row">
      <button
        class="icon-button"
        disabled={effective <= GRID_COLUMNS_MIN}
        aria-label={t("toolbar.view.columns.decrease")}
        title={t("toolbar.view.columns.decrease")}
        onclick={() => step(-1)}
      >
        <Icon name="minus" />
      </button>
      <span class="columns-count tabular" aria-label={t("toolbar.view.columns.count", { count: String(effective) })}>
        {effective}
      </span>
      <button
        class="icon-button"
        disabled={effective >= GRID_COLUMNS_MAX}
        aria-label={t("toolbar.view.columns.increase")}
        title={t("toolbar.view.columns.increase")}
        onclick={() => step(1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  .item-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .columns-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px 6px;
  }

  .columns-count {
    font-size: var(--text-13);
    color: var(--text-secondary);
    min-width: 24px;
    text-align: center;
  }
</style>
