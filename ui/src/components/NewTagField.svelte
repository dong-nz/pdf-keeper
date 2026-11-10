<script lang="ts">
  // Inline "New tag" field at the top of the tags manager (UI-10):
  // Enter creates; a duplicate name shows the inline field error
  // (status-feedback.md).
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";

  let value = $state("");
  let error = $state<string | null>(null);

  async function create() {
    const trimmed = value.trim();
    if (trimmed === "") return;
    const created = await library.createTag(trimmed);
    if (created === null) {
      error = t("tag.errorDuplicate");
      return;
    }
    value = "";
    error = null;
  }
</script>

<form class="new-tag" onsubmit={(event) => { event.preventDefault(); void create(); }}>
  <span class="new-tag-input">
    <Icon name="plus" />
    <input
      class="field"
      class:field-error={error !== null}
      type="text"
      maxlength="120"
      placeholder={t("tagsDialog.newPlaceholder")}
      aria-label={t("tagsDialog.addTitle")}
      bind:value
      oninput={() => (error = null)}
    />
  </span>
  {#if error}
    <p class="inline-error" role="alert">{error}</p>
  {/if}
</form>

<style>
  .new-tag {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .new-tag-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    color: var(--text-tertiary);
  }

  .new-tag-input .field {
    flex: 1;
    min-width: 0;
  }
</style>
