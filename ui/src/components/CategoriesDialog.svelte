<script lang="ts">
  // Categories manager (UI-10): the category CRUD that used to live in the
  // sidebar, now a dialog. Same components, same store calls, same dialogs —
  // only its home changed (spec §3.3). Dialog mount rule per DR-63: this
  // component owns `open` and reports the close through `ondone`.
  import Modal from "./Modal.svelte";
  import CategoryList from "./CategoryList.svelte";
  import NewCategoryField from "./NewCategoryField.svelte";
  import RenameCategoryDialog from "./RenameCategoryDialog.svelte";
  import DeleteCategoryDialog from "./DeleteCategoryDialog.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { categoryActions, type CategoryUiHost } from "$lib/actions";
  import type { CategoryDto } from "$lib/types";

  let { ondone }: { ondone: () => void } = $props();

  let open = $state(true);
  let renaming = $state<CategoryDto | null>(null);
  let deleting = $state<CategoryDto | null>(null);

  const host: CategoryUiHost = {
    openRename: (category) => (renaming = category),
    openDelete: (category) => (deleting = category),
  };
  const actions = categoryActions(host);

  $effect(() => {
    if (!open) ondone();
  });
</script>

<Modal title={t("categoriesDialog.title")} width={420} bind:open>
  <div class="categories-dialog">
    <NewCategoryField />
    {#if library.categories.length === 0}
      <p class="empty">{t("categoriesDialog.empty")}</p>
    {:else}
      <CategoryList {actions} />
    {/if}
  </div>

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
</Modal>

<style>
  .categories-dialog {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: min(480px, 60dvh);
    overflow: auto;
  }

  .empty {
    margin: 8px 0;
    font-size: var(--text-13);
    color: var(--text-tertiary);
  }
</style>
