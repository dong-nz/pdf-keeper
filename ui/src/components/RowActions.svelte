<script lang="ts">
  // The one actions line (UI-03 as modified, DR-99e): favorite, details, delete
  // — all three hover/focus-only, all three the SAME definitions the context
  // menu uses (R4.7). The favorite keeps its kit wrapper (`StarButton`); the
  // others are plain icon buttons.
  // D4 (AC-33): every action is wrapped in the app's Tooltip component (the
  // kit merges the trigger props onto the same element, the pattern the
  // toolbar uses); the `title` attributes are gone — accessible names and
  // tooltip text are one set of catalog strings (UI-20).
  import Icon from "./Icon.svelte";
  import StarButton from "./StarButton.svelte";
  import Tooltip from "./Tooltip.svelte";
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
    {@const label = t(labelOf(action, doc))}
    {#if action.id === "favorite"}
      <Tooltip text={label}>
        {#snippet control({ props })}
          <StarButton
            {...props}
            pressed={doc.favorite}
            label={label}
            onchange={() => action.run(doc)}
          />
        {/snippet}
      </Tooltip>
    {:else}
      <Tooltip text={label}>
        {#snippet control({ props })}
          <button
            {...props}
            class="icon-button"
            class:icon-button-danger={action.danger}
            aria-label={label}
            onclick={(event) => {
              event.stopPropagation();
              action.run(doc);
            }}
          >
            <Icon name={iconOf(action, doc)} />
          </button>
        {/snippet}
      </Tooltip>
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
