<script lang="ts">
  // One row of the categories manager (UI-10): name, live count chip, hover
  // actions (rename / delete) — the SAME action definitions the context menu
  // uses (R4.7). The active mark is membership in the current filter set
  // (FR-02 as modified); clicking toggles that membership.
  import Icon from "./Icon.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import { labelOf, iconOf, type UiAction } from "$lib/actions";
  import type { CategoryDto } from "$lib/types";

  let { category, actions }: { category: CategoryDto; actions: UiAction<CategoryDto>[] } = $props();

  const active = $derived(library.filter.category_ids.includes(category.id));

  function select() {
    library.toggleCategory(category.id);
  }
</script>

<ContextMenu items={actions} target={category}>
  <div class="category-row" data-active={active || undefined}>
    <button class="category-select" onclick={select}>
      <Icon name="tag" />
      <span class="category-name">{category.name}</span>
    </button>
    <span class="chip tabular"><span>{formatCount(category.count)}</span></span>
    <span class="category-actions">
      {#each actions as action (action.id)}
        <button
          class="icon-button"
          class:icon-button-danger={action.danger}
          aria-label={t(labelOf(action, category))}
          title={t(labelOf(action, category))}
          onclick={() => action.run(category)}
        >
          <Icon name={iconOf(action, category)} />
        </button>
      {/each}
    </span>
  </div>
</ContextMenu>

<style>
  .category-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--row-control-height);
    padding-right: 4px;
    border-radius: var(--radius-control);
  }

  .category-row:hover {
    background: var(--surface-2);
  }

  .category-row[data-active] .category-select {
    color: var(--accent);
    background: var(--accent-quiet);
  }

  .category-select {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    min-width: 0;
    padding: 0 8px;
    border-radius: var(--radius-control);
    color: var(--text-secondary);
    font-size: var(--text-13);
  }

  .category-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-actions {
    display: none;
  }

  .category-row:hover .category-actions,
  .category-row:focus-within .category-actions {
    display: inline-flex;
  }

  .icon-button-danger {
    color: var(--danger);
  }
</style>
