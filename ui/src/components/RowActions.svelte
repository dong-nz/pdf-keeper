<script lang="ts">
  // The one actions line (UI-03 as modified, DR-99e): favorite, details, delete
  // — all three hover/focus-only, all three the SAME definitions the context
  // menu uses (R4.7). The favorite keeps its kit wrapper (`StarButton`); the
  // others are plain icon buttons.
  import Icon from "./Icon.svelte";
  import StarButton from "./StarButton.svelte";
  import { t } from "$lib/i18n";
  import { labelOf, iconOf, ROW_ACTION_IDS, type UiAction } from "$lib/actions";
  import type { DocumentDto } from "$lib/types";

  let { doc, actions }: { doc: DocumentDto; actions: UiAction<DocumentDto>[] } = $props();

  const shown = $derived(
    actions.filter(
      (action) => ROW_ACTION_IDS.includes(action.id as (typeof ROW_ACTION_IDS)[number]) && (!action.applies || action.applies(doc)),
    ),
  );
</script>

<span class="row-actions">
  {#each shown as action (action.id)}
    {#if action.id === "favorite"}
      <StarButton
        pressed={doc.favorite}
        label={t(labelOf(action, doc))}
        onchange={() => action.run(doc)}
      />
    {:else}
      <button
        class="icon-button"
        class:icon-button-danger={action.danger}
        aria-label={t(labelOf(action, doc))}
        title={t(labelOf(action, doc))}
        onclick={(event) => {
          event.stopPropagation();
          action.run(doc);
        }}
      >
        <Icon name={iconOf(action, doc)} />
      </button>
    {/if}
  {/each}
</span>

<style>
  .row-actions {
    display: none;
    flex: none;
  }

  :global(.row:hover) .row-actions,
  :global(.row:focus-within) .row-actions,
  :global(.card:hover) .row-actions,
  :global(.card:focus-within) .row-actions {
    display: inline-flex;
  }

  .icon-button-danger {
    color: var(--danger);
  }
</style>
