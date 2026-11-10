<script lang="ts">
  // Tag delete confirmation (FR-02): documents keep their files — the
  // dialog states it. DeleteDialog pattern: local `open` bound into Modal
  // (Modal mounts CLOSED otherwise — DR-63).
  import Modal from "./Modal.svelte";
  import { t } from "$lib/i18n";

  let { name, ondone }: { name: string; ondone: (confirmed: boolean) => void } = $props();

  let open = $state(true);
  let confirmed = false;

  $effect(() => {
    if (!open) ondone(confirmed);
  });
</script>

<Modal title={t("tag.deleteTitle", { name })} width={420} bind:open>
  <p class="dialog-body">{t("tag.deleteBody")}</p>
  <div class="dialog-actions">
    <button class="control" type="button" onclick={() => (open = false)}>{t("details.discard")}</button>
    <button
      class="control control-danger"
      type="button"
      onclick={() => {
        confirmed = true;
        open = false;
      }}
    >
      {t("tag.deleteAction")}
    </button>
  </div>
</Modal>
