<script lang="ts">
  import TagRow from "./TagRow.svelte";
  import { library } from "$lib/state/library.svelte";
  import type { UiAction } from "$lib/actions";
  import type { TagDto } from "$lib/types";

  let { actions }: { actions: UiAction<TagDto>[] } = $props();
</script>

<div class="tag-list">
  {#each library.tags as tag (tag.id)}
    <TagRow {tag} {actions} />
  {/each}
</div>

<style>
  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
