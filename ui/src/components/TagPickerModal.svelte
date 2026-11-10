<script lang="ts">
  // Bulk tag assignment (UI-04): one dialog, two explicit columns —
  // add to / remove from the selection. Baseline is computed from the
  // loaded rows (the selection can exceed them via "select all matching";
  // the user confirms the result before anything is written).
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import Modal from "./Modal.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let addIds = $state<Set<number>>(new Set());
  let removeIds = $state<Set<number>>(new Set());
  let busy = $state(false);

  $effect(() => {
    if (!open) return;
    const selected = library.rows.filter((row) => library.selection.has(row.id));
    const add = new Set<number>();
    const remove = new Set<number>();
    for (const tag of library.tags) {
      const assigned = selected.filter((row) => row.tags.includes(tag.name));
      if (selected.length > 0 && assigned.length === selected.length) remove.add(tag.id);
      else if (assigned.length === 0) add.add(tag.id);
    }
    addIds = add;
    removeIds = remove;
  });

  function toggle(set: Set<number>, id: number): Set<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function apply() {
    busy = true;
    await library.bulkTags([...addIds], [...removeIds]);
    busy = false;
    open = false;
  }
</script>

{#if open}
  <Modal title={t("picker.title", { count: formatCount(library.selection.size) })} width={560} bind:open>
    {#if library.tags.length === 0}
      <p class="hint">{t("picker.noTags")}</p>
    {:else}
      <div class="picker-head" aria-hidden="true">
        <span></span>
        <span>{t("picker.add")}</span>
        <span>{t("picker.remove")}</span>
      </div>
      <div class="picker-list">
        {#each library.tags as tag (tag.id)}
          <div class="picker-row">
            <span class="picker-name">{tag.name}</span>
            <span class="picker-cell">
              <input
                type="checkbox"
                aria-label={`${t("picker.add")}: ${tag.name}`}
                checked={addIds.has(tag.id)}
                onchange={() => (addIds = toggle(addIds, tag.id))}
              />
            </span>
            <span class="picker-cell">
              <input
                type="checkbox"
                aria-label={`${t("picker.remove")}: ${tag.name}`}
                checked={removeIds.has(tag.id)}
                onchange={() => (removeIds = toggle(removeIds, tag.id))}
              />
            </span>
          </div>
        {/each}
      </div>
      <div class="dialog-actions">
        <button class="control control-primary" disabled={busy} onclick={() => void apply()}>{t("picker.confirm")}</button>
      </div>
    {/if}
  </Modal>
{/if}

<style>
  .picker-head,
  .picker-row {
    display: grid;
    grid-template-columns: 1fr 56px 56px;
    align-items: center;
    gap: 8px;
  }

  .picker-head {
    font-size: var(--text-11);
    color: var(--text-tertiary);
    padding: 4px 0;
  }

  .picker-head > span:not(:first-child) {
    text-align: center;
  }

  .picker-list {
    max-height: 320px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-name {
    font-size: var(--text-13);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-cell {
    display: grid;
    place-items: center;
  }

  .hint {
    font-size: var(--text-12);
    color: var(--text-secondary);
    margin: 0;
  }
</style>
