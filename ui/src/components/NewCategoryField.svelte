<script lang="ts">
  // Inline "New category" field at the top of the categories manager (UI-10):
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
    const created = await library.createCategory(trimmed);
    if (created === null) {
      error = t("category.errorDuplicate");
      return;
    }
    value = "";
    error = null;
  }
</script>

<form class="new-category" onsubmit={(event) => { event.preventDefault(); void create(); }}>
  <span class="new-category-input">
    <Icon name="plus" />
    <input
      class="field"
      class:field-error={error !== null}
      type="text"
      maxlength="120"
      placeholder={t("categoriesDialog.newPlaceholder")}
      aria-label={t("categoriesDialog.addTitle")}
      bind:value
      oninput={() => (error = null)}
    />
  </span>
  {#if error}
    <p class="inline-error" role="alert">{error}</p>
  {/if}
</form>

<style>
  .new-category {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .new-category-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    color: var(--text-tertiary);
  }

  .new-category-input .field {
    flex: 1;
    min-width: 0;
  }
</style>
