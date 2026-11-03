<script lang="ts">
  // Kit wrapper (DR-45): DropdownMenu for sort key + direction. The only
  // sort entry point (R1.6); it writes through library.setFilter — the same
  // reset path as every other filter change (§5.3.4 rule 3).
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import { t, type MsgKey } from "$lib/i18n";
  import { library } from "$lib/state/library.svelte";
  import type { SortKey } from "$lib/types";

  const KEYS: { key: SortKey; labelKey: MsgKey }[] = [
    { key: "title", labelKey: "toolbar.sort.title" },
    { key: "date_added", labelKey: "toolbar.sort.date_added" },
    { key: "size", labelKey: "toolbar.sort.size" },
  ];

  let open = $state(false);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="control">
    <Icon name="sort" />
    <span>{t("toolbar.sort")}</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="menu sort-menu">
    <OverlayAnchor />
    {#each KEYS as option (option.key)}
      <DropdownMenu.Item
        class="menu-item"
        data-active={library.filter.sort === option.key || undefined}
        onSelect={() => library.setFilter({ sort: option.key })}
      >
        <span>{t(option.labelKey)}</span>
        {#if library.filter.sort === option.key}
          <Icon name="check" />
        {/if}
      </DropdownMenu.Item>
    {/each}
    <DropdownMenu.Separator class="menu-sep" />
    <DropdownMenu.Item
      class="menu-item"
      data-active={library.filter.dir === "asc" || undefined}
      onSelect={() => library.setFilter({ dir: "asc" })}
    >
      <span>{t("toolbar.sortDir.asc")}</span>
      {#if library.filter.dir === "asc"}
        <Icon name="check" />
      {/if}
    </DropdownMenu.Item>
    <DropdownMenu.Item
      class="menu-item"
      data-active={library.filter.dir === "desc" || undefined}
      onSelect={() => library.setFilter({ dir: "desc" })}
    >
      <span>{t("toolbar.sortDir.desc")}</span>
      {#if library.filter.dir === "desc"}
        <Icon name="check" />
      {/if}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

