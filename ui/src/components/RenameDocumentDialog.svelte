<script lang="ts">
  // Rename-file dialog (FR-21, composition per DR-267). Follows the released
  // RenameTagDialog pattern: a local `open` state bound into Modal, prefill
  // from the dialog's fixed target (one dialog per rename action), inline
  // typed errors. §3.4: one filename field prefilled with the current name,
  // the folder shown read-only above it — the user renames the name, not the
  // location. Enter submits (the form), Esc closes (Modal's released rule).
  import Modal from "./Modal.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import type { DocumentDto } from "$lib/types";

  let { doc, ondone }: { doc: DocumentDto; ondone: (renamed: boolean) => void } = $props();

  let open = $state(true);
  let value = $state("");
  let error = $state<string | null>(null);
  let renamed = false;

  // Prefill with the current full name — the name is accepted as entered,
  // the extension is not pinned (FR-21 as approved, DR-265 a).
  $effect(() => {
    value = doc.filename;
  });

  $effect(() => {
    if (!open) ondone(renamed);
  });

  async function submit() {
    const kind = await library.renameDocument(doc.id, value);
    if (kind === null) {
      renamed = true;
      open = false;
    } else {
      // The typed rejections stay in the field (AC-108); the service already
      // changed nothing on disk or in the record.
      error = kind === "name_conflict" ? t("renameDialog.errorConflict") : t("renameDialog.errorInvalid");
    }
  }

  // The read-only folder line (§3.4): the row's path without the filename —
  // the DTO carries the path today, no new field. No native `title` attribute
  // (AC-87's ban): the path is shown in full, wrapping if it is long.
  const folder = $derived(doc.path.slice(0, doc.path.length - doc.filename.length).replace(/[\\/]+$/, ""));
</script>

<Modal title={t("renameDialog.title")} width={420} bind:open>
  <p class="folder-line">{folder}</p>
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      void submit();
    }}
  >
    <label>
      <span>{t("renameDialog.nameLabel")}</span>
      <input class="field" class:field-error={error !== null} bind:value />
    </label>
    {#if error}
      <p class="inline-error" role="alert">{error}</p>
    {/if}
    <div class="dialog-actions">
      <button class="control" type="button" onclick={() => (open = false)}>{t("details.discard")}</button>
      <button class="control control-primary" type="submit">{t("renameDialog.action")}</button>
    </div>
  </form>
</Modal>

<style>
  /* The folder line: secondary, selectable, shown in full (it wraps on a
     long path — the native-title ban of AC-87 rules out a hover fallback). */
  .folder-line {
    margin: 0 0 4px;
    color: var(--text-secondary);
    font-size: var(--text-12);
    overflow-wrap: anywhere;
    user-select: text;
  }
</style>
