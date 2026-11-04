<script lang="ts">
  // Browse menu (UI-09): the app's navigation entry point — saved searches and
  // the active category set, replacing the removed sidebar. Selections go
  // through the single filter path (`library.setFilter` / `toggleCategory`,
  // §5.3.4 rule 3); the checked state is read from `library.filter`, the one
  // source of truth.
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import CategoriesDialog from "./CategoriesDialog.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import type { MsgKey } from "$lib/i18n";

  const MODES: { mode: "all" | "favorites" | "missing"; labelKey: MsgKey; icon: "list" | "star" | "alert-triangle" }[] = [
    { mode: "all", labelKey: "browse.allDocuments", icon: "list" },
    { mode: "favorites", labelKey: "browse.favorites", icon: "star" },
    { mode: "missing", labelKey: "browse.missing", icon: "alert-triangle" },
  ];

  let open = $state(false);
  let managing = $state(false);

  // "All documents" is the no-saved-search state — the same rule the status-bar
  // chip uses. A search term is not a saved search.
  const isAll = $derived(
    library.filter.category_ids.length === 0 && !library.filter.favorites_only && !library.filter.missing_only,
  );

  const modeActive = (mode: "all" | "favorites" | "missing"): boolean =>
    mode === "all"
      ? isAll
      : mode === "favorites"
        ? library.filter.favorites_only
        : library.filter.missing_only;

  const modeCount = (mode: "all" | "favorites" | "missing"): string =>
    formatCount(mode === "all" ? library.counts.total : mode === "favorites" ? library.counts.favorites : library.counts.missing);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="control browse-trigger">
    <Icon name="filter" />
    <span>{t("browse.menu")}</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="menu browse-menu">
    <OverlayAnchor />
    {#each MODES as option (option.mode)}
      <DropdownMenu.Item
        class="menu-item"
        data-active={modeActive(option.mode) || undefined}
        onSelect={() => library.selectMode(option.mode)}
      >
        <span class="item-label">
          <Icon name={option.icon} />
          <span>{t(option.labelKey)}</span>
        </span>
        <span class="item-count tabular">{modeCount(option.mode)}</span>
        {#if modeActive(option.mode)}
          <Icon name="check" />
        {/if}
      </DropdownMenu.Item>
    {/each}

    {#if library.categories.length > 0}
      <DropdownMenu.Separator class="menu-sep" />
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger class="menu-item">
          <span class="item-label">
            <Icon name="tag" />
            <span>{t("browse.categories")}</span>
          </span>
          <Icon name="chevron-right" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent class="menu browse-sub">
          {#each library.categories as category (category.id)}
            <DropdownMenu.Item
              class="menu-item"
              data-active={library.filter.category_ids.includes(category.id) || undefined}
              onSelect={(event) => {
                // Multi-select: the menu stays open so several categories can
                // be combined into one filter (FR-02 as modified, DR-82).
                event.preventDefault();
                library.toggleCategory(category.id);
              }}
            >
              <span class="item-label">
                <span>{category.name}</span>
              </span>
              <span class="item-count tabular">{formatCount(category.count)}</span>
              {#if library.filter.category_ids.includes(category.id)}
                <Icon name="check" />
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>
    {/if}

    <DropdownMenu.Separator class="menu-sep" />
    <DropdownMenu.Item class="menu-item" onSelect={() => (managing = true)}>
      <span class="item-label">
        <span>{t("browse.manage")}</span>
      </span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

{#if managing}
  <CategoriesDialog ondone={() => (managing = false)} />
{/if}

<style>
  .item-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .item-count {
    margin-left: auto;
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }
</style>
