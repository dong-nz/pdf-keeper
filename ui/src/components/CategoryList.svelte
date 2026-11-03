<script lang="ts">
  import CategoryRow from "./CategoryRow.svelte";
  import { library } from "$lib/state/library.svelte";
  import type { UiAction } from "$lib/actions";
  import type { CategoryDto } from "$lib/types";

  let { actions }: { actions: UiAction<CategoryDto>[] } = $props();
</script>

<div class="category-list">
  {#each library.categories as category (category.id)}
    <CategoryRow {category} {actions} />
  {/each}
</div>

<style>
  .category-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
