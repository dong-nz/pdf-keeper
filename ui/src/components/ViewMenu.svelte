<script lang="ts">
  // View menu (UI-08 as modified): the single display control for the document
  // area — view mode, the column override, and the sort items that used to live
  // in the standalone Sort menu (now removed; FR-13 and its keys are untouched,
  // only the entry point moved). The mode writes through `settings.setView`, the
  // columns through `settings.setGridColumns`, the sort through
  // `library.setFilter` — the same paths the removed control used (R1.6).
  // Icon-only with a tooltip (UI-13); the current mode, column setting and sort
  // are shown as checked items inside the menu, never on the icon.
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { library } from "$lib/state/library.svelte";
  import { GRID_COLUMNS_MAX, GRID_COLUMNS_MIN, stepColumns } from "$lib/virtual";
  import { t, type MsgKey } from "$lib/i18n";
  import type { SortDir, SortKey, SortSecondary, ViewMode } from "$lib/types";

  const MODES: { mode: ViewMode; labelKey: "toolbar.view.list" | "toolbar.view.grid"; icon: "list" | "grid" }[] = [
    { mode: "list", labelKey: "toolbar.view.list", icon: "list" },
    { mode: "grid", labelKey: "toolbar.view.grid", icon: "grid" },
  ];

  // The released FR-13 whitelist (DR-102a): the same three keys the removed
  // Sort menu offered, the same `library.setFilter` path.
  const SORTS: { key: SortKey; labelKey: MsgKey }[] = [
    { key: "title", labelKey: "toolbar.sort.title" },
    { key: "date_added", labelKey: "toolbar.sort.date_added" },
    { key: "size", labelKey: "toolbar.sort.size" },
  ];

  const DIRS: { dir: SortDir; labelKey: MsgKey }[] = [
    { dir: "asc", labelKey: "toolbar.sortDir.asc" },
    { dir: "desc", labelKey: "toolbar.sortDir.desc" },
  ];

  // Secondary keys (FR-13): the same three plus "none" = unset. The secondary
  // follows the primary's direction (DR-81), so this submenu has no direction
  // control of its own.
  const SECONDARY: { key: SortSecondary; labelKey: MsgKey }[] = [
    { key: "none", labelKey: "toolbar.sort.secondary.none" },
    ...SORTS,
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
</script>

<DropdownMenu.Root bind:open>
  <Tooltip text={t("toolbar.view")}>
    {#snippet control({ props })}
      <DropdownMenu.Trigger
        {...props}
        class="control icon-button view-trigger"
        aria-label={t("toolbar.view")}
        data-tauri-drag-region="false"
      >
        <Icon name="grid" />
      </DropdownMenu.Trigger>
    {/snippet}
  </Tooltip>

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
        onclick={() => settings.setGridColumns(stepColumns(effective, -1))}
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
        onclick={() => settings.setGridColumns(stepColumns(effective, 1))}
      >
        <Icon name="plus" />
      </button>
    </div>

    <DropdownMenu.Separator class="menu-sep" />
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger class="menu-item">
        <span class="item-label">
          <Icon name="sort" />
          <span>{t("view.sortBy")}</span>
        </span>
        <Icon name="chevron-right" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent class="menu view-sort">
        {#each SORTS as option (option.key)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={library.filter.sort === option.key || undefined}
            onSelect={() => library.setFilter({ sort: option.key })}
          >
            <span class="item-label">
              <span>{t(option.labelKey)}</span>
            </span>
            {#if library.filter.sort === option.key}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
        <DropdownMenu.Separator class="menu-sep" />
        {#each DIRS as option (option.dir)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={library.filter.dir === option.dir || undefined}
            onSelect={() => library.setFilter({ dir: option.dir })}
          >
            <span class="item-label">
              <span>{t(option.labelKey)}</span>
            </span>
            {#if library.filter.dir === option.dir}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>

    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger class="menu-item">
        <span class="item-label">
          <Icon name="sort" />
          <span>{t("toolbar.sort.secondary")}</span>
        </span>
        <Icon name="chevron-right" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent class="menu view-thenby">
        {#each SECONDARY as option (option.key)}
          <DropdownMenu.Item
            class="menu-item"
            data-active={library.filter.sort_secondary === option.key || undefined}
            onSelect={() => library.setFilter({ sort_secondary: option.key })}
          >
            <span class="item-label">
              <span>{t(option.labelKey)}</span>
            </span>
            {#if library.filter.sort_secondary === option.key}
              <Icon name="check" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
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
