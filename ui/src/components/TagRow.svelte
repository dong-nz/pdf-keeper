<script lang="ts">
  // One row of the tags manager (UI-10): name, live count (UI-24), hover
  // actions (rename / delete) — the SAME action definitions the context menu
  // uses (R4.7). The active mark is membership in the current filter set
  // (FR-02 as modified); clicking toggles that membership.
  import Icon from "./Icon.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import { labelOf, iconOf, type UiAction } from "$lib/actions";
  import type { TagDto } from "$lib/types";

  let { tag, actions }: { tag: TagDto; actions: UiAction<TagDto>[] } = $props();

  const active = $derived(library.filter.tag_ids.includes(tag.id));

  function select() {
    library.toggleTag(tag.id);
  }
</script>

<ContextMenu items={actions} target={tag}>
  <div class="tag-row" data-active={active || undefined}>
    <button class="tag-select" onclick={select}>
      <Icon name="tag" />
      <span class="tag-name">{tag.name}</span>
    </button>
    <span class="cat-count tabular">{formatCount(tag.count)}</span>
    <span class="tag-actions">
      {#each actions as action (action.id)}
        <Tooltip text={t(labelOf(action, tag))}>
          {#snippet control({ props })}
            <button
              class="icon-button"
              class:icon-button-danger={action.danger}
              aria-label={t(labelOf(action, tag))}
              {...props}
              onclick={() => action.run(tag)}
            >
              <Icon name={iconOf(action, tag)} />
            </button>
          {/snippet}
        </Tooltip>
      {/each}
    </span>
  </div>
</ContextMenu>

<style>
  .tag-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--row-control-height);
    padding-right: 4px;
    border-radius: var(--radius-control);
  }

  .tag-row:hover {
    background: var(--surface-2);
  }

  .tag-row[data-active] .tag-select {
    /* D11 (§3.12): text on a 12% tint of its own color takes the hover value. */
    color: var(--accent-hover);
    background: var(--accent-quiet);
  }

  .tag-select {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    min-width: 0;
    padding: 0 8px;
    border-radius: var(--radius-control);
    color: var(--text-secondary);
    font-size: var(--text-13);
  }

  .tag-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* UI-24 (AC-46): the live count as quiet text — tabular figures from the
     shared `.tabular` utility, tertiary role, no ground, no border, no pill.
     The count's data path is unchanged. */
  .cat-count {
    flex: none;
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }

  .tag-actions {
    display: none;
  }

  .tag-row:hover .tag-actions,
  .tag-row:focus-within .tag-actions {
    display: inline-flex;
  }

  .icon-button-danger {
    /* §3.7/DR-198: tag rows render on menu/dialog grounds (--surface-1)
       or their hover ground (--surface-2); the hover value clears both. */
    color: var(--danger-hover);
  }
</style>
