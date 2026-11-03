<script lang="ts">
  // Category rename dialog (FR-02). Follows the DeleteDialog pattern: a local
  // `open` state bound into Modal — Modal mounts CLOSED otherwise, which is
  // how this dialog silently never appeared (DR-63, user-reported).
  import Modal from "./Modal.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import type { CategoryDto } from "$lib/types";

  let { category, ondone }: { category: CategoryDto; ondone: (renamed: boolean) => void } = $props();

  let open = $state(true);
  let value = $state("");
  let error = $state<string | null>(null);
  let renamed = false;

  // Prefill from the dialog's fixed target (the `category` prop never changes
  // for a mounted instance — one dialog per rename action).
  $effect(() => {
    value = category.name;
  });

  $effect(() => {
    if (!open) ondone(renamed);
  });

  async function submit() {
    const ok = await library.renameCategory(category.id, value);
    if (ok) {
      renamed = true;
      open = false;
    } else {
      error = t("category.errorDuplicate");
    }
  }
</script>

<Modal title={t("sidebar.renameCategoryTitle")} width={420} bind:open>
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <label>
      <span>{t("category.nameLabel")}</span>
      <input class="field" class:field-error={error !== null} bind:value maxlength="120" />
    </label>
    {#if error}
      <p class="inline-error" role="alert">{error}</p>
    {/if}
    <div class="dialog-actions">
      <button class="control" type="button" onclick={() => (open = false)}>{t("details.discard")}</button>
      <button class="control control-primary" type="submit">{t("category.renameAction")}</button>
    </div>
  </form>
</Modal>
