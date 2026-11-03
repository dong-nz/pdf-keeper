<script lang="ts">
  // FilterChips (spec §5.3.6): the active filter combination above the list,
  // each chip individually removable.
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";

  interface Chip {
    id: string;
    label: string;
    remove: () => void;
  }

  const chips = $derived.by(() => {
    const f = library.filter;
    const list: Chip[] = [];
    if (f.q !== "") list.push({ id: "q", label: `“${f.q}”`, remove: () => library.setFilter({ q: "" }) });
    if (f.category_id !== null) {
      const category = library.categories.find((c) => c.id === f.category_id);
      list.push({
        id: "category",
        label: category?.name ?? t("error.categoryGone"),
        remove: () => library.setFilter({ category_id: null }),
      });
    }
    if (f.favorites_only) list.push({ id: "favorites", label: t("sidebar.favorites"), remove: () => library.setFilter({ favorites_only: false }) });
    if (f.missing_only) list.push({ id: "missing", label: t("sidebar.missing"), remove: () => library.setFilter({ missing_only: false }) });
    return list;
  });
</script>

{#if chips.length > 0}
  <div class="filter-chips" role="group" aria-label={t("filter.active")}>
    {#each chips as chip (chip.id)}
      <button class="chip chip-accent" onclick={chip.remove}>
        <span>{chip.label}</span>
        <Icon name="close" />
      </button>
    {/each}
  </div>
{/if}

<style>
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px 0;
  }
</style>
