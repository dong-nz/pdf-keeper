<script lang="ts">
  // Tags manager (UI-10): the tag CRUD that used to live in the
  // sidebar, now a dialog. Same components, same store calls, same dialogs —
  // only its home changed (spec §3.3). Dialog mount rule per DR-63: this
  // component owns `open` and reports the close through `ondone`.
  import Modal from "./Modal.svelte";
  import TagList from "./TagList.svelte";
  import NewTagField from "./NewTagField.svelte";
  import RenameTagDialog from "./RenameTagDialog.svelte";
  import DeleteTagDialog from "./DeleteTagDialog.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { tagActions, type TagUiHost } from "$lib/actions";
  import type { TagDto } from "$lib/types";

  let { ondone }: { ondone: () => void } = $props();

  let open = $state(true);
  let renaming = $state<TagDto | null>(null);
  let deleting = $state<TagDto | null>(null);

  const host: TagUiHost = {
    openRename: (tag) => (renaming = tag),
    openDelete: (tag) => (deleting = tag),
  };
  const actions = tagActions(host);

  $effect(() => {
    if (!open) ondone();
  });
</script>

<Modal title={t("tagsDialog.title")} width={420} bind:open>
  <div class="tags-dialog">
    <NewTagField />
    {#if library.tags.length === 0}
      <p class="empty">{t("tagsDialog.empty")}</p>
    {:else}
      <TagList {actions} />
    {/if}
  </div>

  {#if renaming}
    <RenameTagDialog tag={renaming} ondone={() => (renaming = null)} />
  {/if}

  {#if deleting}
    {@const target = deleting}
    <DeleteTagDialog
      name={target.name}
      ondone={(confirmed) => {
        if (confirmed) void library.deleteTag(target.id);
        deleting = null;
      }}
    />
  {/if}
</Modal>

<style>
  .tags-dialog {
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
