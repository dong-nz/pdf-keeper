<script lang="ts">
  // Details / metadata editor (UI-07): the only writer of a document's
  // editable fields. Empty title is caught here inline and re-validated by
  // the command (R2.1). Esc with unsaved changes routes through the inline
  // discard confirm instead of closing (§5.2).
  import { library } from "$lib/state/library.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { t } from "$lib/i18n";
  import Modal from "./Modal.svelte";
  import DeleteDialog from "./DeleteDialog.svelte";
  import StarButton from "./StarButton.svelte";
  import type { DocumentDto } from "$lib/types";

  let { doc, ondone }: { doc: DocumentDto; ondone: () => void } = $props();

  let open = $state(true);
  let title = $state("");
  let author = $state("");
  let notes = $state("");
  let favorite = $state(false);
  let categoryIds = $state<number[]>([]);
  let titleError = $state<string | null>(null);
  let discardBar = $state(false);
  let deleteOpen = $state(false);

  // (Re)initialize whenever the target document changes.
  $effect(() => {
    title = doc.title;
    author = doc.author;
    notes = doc.notes;
    favorite = doc.favorite;
    categoryIds = idsForNames(doc.categories);
    titleError = null;
  });

  function idsForNames(names: string[]): number[] {
    return library.categories.filter((category) => names.includes(category.name)).map((category) => category.id);
  }

  const baselineIds = $derived(idsForNames(doc.categories));
  // UI-02: while the title is still auto-derived and untouched, explain its
  // provenance; the hint disappears on the first edit.
  const titleHint = $derived(doc.title_source === "auto" && title === doc.title);
  let notesEl = $state<HTMLTextAreaElement | null>(null);
  function growNotes() {
    const el = notesEl;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(84, el.scrollHeight)}px`;
  }
  // Size the field to the stored content when the editor opens or reloads.
  $effect(() => {
    notes;
    growNotes();
  });
  const dirty = $derived(
    title !== doc.title ||
      author !== doc.author ||
      notes !== doc.notes ||
      favorite !== doc.favorite ||
      categoryIds.length !== baselineIds.length ||
      !baselineIds.every((id) => categoryIds.includes(id)),
  );

  // The kit closed the dialog (close button / plain-Esc): report upward.
  $effect(() => {
    if (!open) ondone();
  });

  async function save() {
    if (title.trim() === "") {
      titleError = t("details.errorTitleEmpty");
      return;
    }
    const saved = await library.updateDocument(doc.id, title.trim(), author, notes, favorite, categoryIds);
    if (saved) ondone();
  }

  function toggleCategory(id: number) {
    categoryIds = categoryIds.includes(id) ? categoryIds.filter((x) => x !== id) : [...categoryIds, id];
  }
</script>

<Modal title={t("details.title")} width={560} bind:open onEscapeKeydown={(event) => {
  if (dirty) {
    event.preventDefault();
    discardBar = true;
  }
}}>
  <form
    class="dialog-form"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    {#if discardBar}
      <div class="discard-bar" role="alertdialog">
        <span>{t("details.discardConfirm")}</span>
        <button class="control" type="button" onclick={() => (discardBar = false)}>{t("details.discardKeep")}</button>
        <button class="control control-primary" type="button" onclick={ondone}>{t("details.discardDiscard")}</button>
      </div>
    {/if}

    <label>
      <span>{t("details.fieldTitle")}</span>
      <input class="field" class:field-error={titleError !== null} bind:value={title} />
      {#if titleHint}
        <span class="quiet-hint">{t("details.titleFromFilename")}</span>
      {/if}
    </label>
    {#if titleError}
      <p class="inline-error" role="alert">{titleError}</p>
    {/if}

    <label>
      <span>{t("details.fieldAuthor")}</span>
      <input class="field" bind:value={author} />
    </label>

    <label>
      <span>{t("details.fieldNotes")}</span>
      <textarea class="field notes-field" bind:this={notesEl} bind:value={notes} oninput={growNotes}></textarea>
    </label>

    <div class="field-row">
      <span>{t("details.fieldFavorite")}</span>
      <StarButton pressed={favorite} label={t("details.fieldFavorite")} onchange={(value) => (favorite = value)} />
    </div>

    <fieldset class="categories-field">
      <legend>{t("details.fieldCategories")}</legend>
      {#if library.categories.length === 0}
        <p class="hint">{t("picker.noCategories")}</p>
      {:else}
        <div class="category-checks">
          {#each library.categories as category (category.id)}
            <label class="check-row">
              <input type="checkbox" checked={categoryIds.includes(category.id)} onchange={() => toggleCategory(category.id)} />
              <span>{category.name}</span>
            </label>
          {/each}
        </div>
      {/if}
    </fieldset>

    <p class="path-line">
      <span class="hint">{t("details.pathLabel")}</span>
      <code>{doc.path}</code>
    </p>

    <div class="dialog-actions">
      {#if doc.missing}
        <button
          class="control"
          type="button"
          onclick={() => {
            // Close this editor first: the relink dialog owns the entry until
            // it resolves, and the editor's snapshot would go stale.
            open = false;
            feedback.openRelink(doc.id);
          }}
        >
          {t("details.relink")}
        </button>
      {/if}
      <button class="control control-danger" type="button" onclick={() => (deleteOpen = true)}>
        {t("details.delete")}
      </button>
      <button class="control control-primary" type="submit">{t("details.save")}</button>
    </div>
  </form>
</Modal>

{#if deleteOpen}
  <DeleteDialog
    ids={[doc.id]}
    ondone={(deleted) => {
      deleteOpen = false;
      // Cancel keeps the editor open; a completed deletion closes it (UI-02).
      if (deleted) ondone();
    }}
  />
{/if}

<style>
  .quiet-hint {
    font-size: var(--text-12);
    color: var(--muted);
  }

  .notes-field {
    min-height: 84px;
    resize: vertical;
  }

  .discard-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    background: var(--surface-2);
  }

  .discard-bar > span {
    flex: 1;
    font-size: var(--text-13);
  }

  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-12);
    color: var(--text-secondary);
  }

  .categories-field {
    border: none;
    padding: 0;
    margin: 0;
  }

  .categories-field legend {
    font-size: var(--text-12);
    color: var(--text-secondary);
    padding: 0;
  }

  .category-checks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 4px 12px;
    margin-top: 6px;
    max-height: 160px;
    overflow: auto;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-13);
    min-width: 0;
  }

  .check-row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
  }

  .path-line code {
    font-family: var(--font-mono);
    font-size: var(--text-12);
    color: var(--text-tertiary);
    user-select: all;
    overflow-wrap: anywhere;
  }

  .hint {
    font-size: var(--text-11);
    color: var(--text-tertiary);
    margin: 0;
  }
</style>
