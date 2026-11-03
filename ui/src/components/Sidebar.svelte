<script lang="ts">
  // Sidebar (UI-01): saved searches (All / Favorites / Missing), the live
  // category list, and the inline "+ New category" field. Active state is
  // derived from the library filter — the single source (§5.3.4).
  import { library } from "$lib/state/library.svelte";
  import CategoryList from "./CategoryList.svelte";
  import NewCategoryField from "./NewCategoryField.svelte";
  import RenameCategoryDialog from "./RenameCategoryDialog.svelte";
  import DeleteCategoryDialog from "./DeleteCategoryDialog.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import { categoryActions, type CategoryUiHost } from "$lib/actions";
  import type { CategoryDto } from "$lib/types";

  let collapsed = $state(false);

  // Rename / delete dialogs owned here (as components — a bare <Modal> from
  // a {#if} block mounts CLOSED; see DR-63); CategoryRow gets the host actions.
  let renaming = $state<CategoryDto | null>(null);
  let deleting = $state<CategoryDto | null>(null);

  const host: CategoryUiHost = {
    openRename: (category) => (renaming = category),
    openDelete: (category) => (deleting = category),
  };
  const actions = categoryActions(host);

  const isAll = $derived(
    library.filter.category_id === null && !library.filter.favorites_only && !library.filter.missing_only,
  );

  function selectSavedSearch(kind: "all" | "favorites" | "missing") {
    library.setFilter({
      category_id: null,
      favorites_only: kind === "favorites",
      missing_only: kind === "missing",
    });
  }
</script>

<aside class="sidebar" class:collapsed data-bits-variant={collapsed ? "rail" : "open"}>
  <nav aria-label={t("sidebar.library")}>
    <button class="side-row" data-active={isAll} onclick={() => selectSavedSearch("all")}>
      <Icon name="list" />
      <span class="side-label">{t("sidebar.allDocuments")}</span>
      <span class="count tabular">{formatCount(library.counts.total)}</span>
    </button>
    <button
      class="side-row"
      data-active={library.filter.favorites_only || undefined}
      onclick={() => selectSavedSearch("favorites")}
    >
      <Icon name="star" />
      <span class="side-label">{t("sidebar.favorites")}</span>
      <span class="count tabular">{formatCount(library.counts.favorites)}</span>
    </button>
    <button
      class="side-row"
      data-active={library.filter.missing_only || undefined}
      onclick={() => selectSavedSearch("missing")}
    >
      <Icon name="alert-triangle" />
      <span class="side-label">{t("sidebar.missing")}</span>
      <span class="count tabular">{formatCount(library.counts.missing)}</span>
    </button>

    <div class="section-label">{t("sidebar.categories")}</div>
    <CategoryList actions={actions} />
    <NewCategoryField />
  </nav>

  <button
    class="icon-button collapse"
    aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
    aria-expanded={!collapsed}
    onclick={() => (collapsed = !collapsed)}
  >
    <Icon name={collapsed ? "chevron-right" : "chevron-left"} />
  </button>

  {#if renaming}
    <RenameCategoryDialog category={renaming} ondone={() => (renaming = null)} />
  {/if}

  {#if deleting}
    {@const target = deleting}
    <DeleteCategoryDialog
      name={target.name}
      ondone={(confirmed) => {
        if (confirmed) void library.deleteCategory(target.id);
        deleting = null;
      }}
    />
  {/if}
</aside>

<style>
  .sidebar {
    grid-area: side;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: var(--side-width);
    background: var(--surface-1);
    border-right: 1px solid var(--border-hairline);
    padding: 12px 8px;
    overflow: hidden;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow: auto;
  }

  .side-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--sidebar-row-height);
    padding: 0 8px;
    border-radius: var(--radius-control);
    color: var(--text-secondary);
    font-size: var(--text-13);
    text-align: left;
    transition: background var(--duration-hover) var(--ease), color var(--duration-hover) var(--ease);
  }

  .side-row:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .side-row[data-active] {
    background: var(--accent-quiet);
    color: var(--accent);
  }

  .side-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    font-size: var(--text-11);
    color: var(--text-tertiary);
  }

  .side-row[data-active] .count {
    color: var(--accent);
  }

  .section-label {
    margin: 14px 8px 4px;
    font-size: var(--text-11);
    color: var(--text-tertiary);
  }

  .collapse {
    align-self: flex-end;
  }

  .collapsed nav {
    width: calc(var(--side-rail) - 16px);
  }

  .collapsed .side-label,
  .collapsed .count,
  .collapsed .section-label {
    display: none;
  }

  /* Child-component DOM needs :global() to be reached (DR-56 lesson): in the
     icon rail a category row is its icon only — name and count chip hidden,
     exactly like the sidebar's own labels/counts above. The :hover /
     :focus-within variants are spelled out because CategoryRow's own
     `.category-row:hover .category-actions { display: inline-flex }` is more
     specific than the plain rule and would re-introduce the buttons on hover,
     overflowing the rail and bringing the horizontal scrollbar back (DR-62,
     user-reported). */
  .collapsed :global(.new-category),
  .collapsed :global(.category-name),
  .collapsed :global(.category-row .chip),
  .collapsed :global(.category-actions),
  .collapsed :global(.category-row:hover .category-actions),
  .collapsed :global(.category-row:focus-within .category-actions) {
    display: none;
  }

  .collapsed {
    width: var(--side-rail);
    padding: 12px 4px;
  }
</style>
