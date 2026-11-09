<script lang="ts">
  // Bulk bar (UI-04): appears on selection; count, "Select all N matching"
  // when the selection is partial, and the shared bulk action set.
  import { library } from "$lib/state/library.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import Icon from "./Icon.svelte";
  import { bulkActions, type BulkUiHost } from "$lib/actions";

  let { host }: { host: BulkUiHost } = $props();

  const count = $derived(library.selection.size);
  const partial = $derived(count > 0 && count < library.total);
  const actions = $derived(bulkActions(host));
</script>

{#if count > 0}
  <div class="bulk-bar" role="toolbar" aria-label={t("bulk.selected", { count: formatCount(count) })}>
    <span class="bulk-count tabular">{t("bulk.selected", { count: formatCount(count) })}</span>
    {#if partial}
      <button class="control" onclick={() => void library.selectAllMatching()}>
        {t("bulk.selectAllMatching", { total: formatCount(library.total) })}
      </button>
    {/if}
    <span class="spacer"></span>
    {#each actions as action (action.id)}
      <button
        class="control"
        class:danger={action.danger}
        onclick={() => {
          if (action.id === "favorite") host.setAllFavorites(true);
          else if (action.id === "unfavorite") host.setAllFavorites(false);
          else action.run();
        }}
      >
        <Icon name={action.icon} />
        <span>{t(action.labelKey)}</span>
      </button>
    {/each}
    <button class="icon-button" aria-label={t("bulk.clear")} onclick={() => library.clearSelection()}>
      <Icon name="close" />
    </button>
  </div>
{/if}

<style>
  .bulk-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--accent-quiet);
    border-bottom: 1px solid var(--border-hairline);
  }

  .bulk-count {
    font-size: var(--text-13);
    /* D11 (§3.12): the bar's background is a tint of the accent color, so
       the count always sits on its own tint and takes the hover value
       (measured 4.20 light as accent; DR-145). */
    color: var(--accent-hover);
  }

  .spacer {
    flex: 1;
  }

  .danger {
    /* §3.7/DR-198: the bar's ground is the accent-quiet tint; the hover
       value measures 5.5:1 there, the base 4.0:1. */
    color: var(--danger-hover);
  }
</style>
