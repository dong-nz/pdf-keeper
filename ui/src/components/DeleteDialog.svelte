<script lang="ts">
  // Delete confirmation (UI-05, FR-14): two explicit actions — the file is
  // only touched when the user picks "Delete with files".
  import { library } from "$lib/state/library.svelte";
  import { t, tp } from "$lib/i18n";
  import Modal from "./Modal.svelte";

  let { ids, ondone }: { ids: number[]; ondone: (deleted: boolean) => void } = $props();

  let open = $state(true);
  let busy = $state(false);
  let deleted = false;

  $effect(() => {
    if (!open) ondone(deleted);
  });

  async function run(deleteFiles: boolean) {
    if (busy) return;
    busy = true;
    deleted = await library.delete(ids, deleteFiles);
    open = false;
  }
</script>

<Modal title={tp("delete.title", ids.length)} width={420} bind:open>
  <div class="dialog-body">
    <p>{t("delete.body")}</p>
    <div class="dialog-actions">
      <button class="control" disabled={busy} onclick={() => void run(false)}>{t("delete.fromLibrary")}</button>
      <button class="control control-danger" disabled={busy} title={t("delete.fileNote")} onclick={() => void run(true)}>
        {t("delete.withFiles")}
      </button>
    </div>
  </div>
</Modal>

<style>
  .dialog-body > p {
    font-size: var(--text-13);
    color: var(--text-secondary);
    margin: 0;
  }
</style>
