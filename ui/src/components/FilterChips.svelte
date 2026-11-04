<script lang="ts">
  // FilterChips (UI-09): the active filter, visible in the toolbar and
  // removable one at a time. One surface for the whole filter state — the
  // chips render from `library.filter`, the single source of truth (§5.3.4).
  // No chips at all is the "All documents" state.
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
    for (const id of f.category_ids) {
      const category = library.categories.find((c) => c.id === id);
      list.push({
        id: `category-${id}`,
        label: category?.name ?? t("error.categoryGone"),
        remove: () => library.setFilter({ category_ids: f.category_ids.filter((other) => other !== id) }),
      });
    }
    if (f.favorites_only)
      list.push({ id: "favorites", label: t("browse.favorites"), remove: () => library.setFilter({ favorites_only: false }) });
    if (f.missing_only)
      list.push({ id: "missing", label: t("browse.missing"), remove: () => library.setFilter({ missing_only: false }) });
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
    min-width: 0;
  }
</style>
