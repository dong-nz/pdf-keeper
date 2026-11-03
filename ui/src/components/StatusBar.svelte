<script lang="ts">
  // Status bar (UI-01): clickable count chips (they set filters — the same
  // filter state the sidebar uses), result count, Rescan (FR-15).
  import { library } from "$lib/state/library.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { t } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import Icon from "./Icon.svelte";
  import ProgressBar from "./ProgressBar.svelte";

  const counts = $derived(library.counts);
  const filtered = $derived(
    library.filter.q !== "" || library.filter.category_id !== null || library.filter.favorites_only || library.filter.missing_only,
  );

  function chipFilter(apply: () => void) {
    return () => apply();
  }
</script>

<footer class="status-bar">
  <div class="counts" role="group" aria-label={t("a11y.counts")}>
    <button
      class="count-chip"
      class:active={!library.filter.category_id && !library.filter.favorites_only && !library.filter.missing_only}
      onclick={chipFilter(() => library.setFilter({ category_id: null, favorites_only: false, missing_only: false }))}
    >
      <span>{t("sidebar.allDocuments")}</span>
      <span class="tabular">{formatCount(counts.total)}</span>
    </button>
    <button
      class="count-chip"
      class:active={library.filter.favorites_only}
      onclick={chipFilter(() => library.setFilter({ favorites_only: !library.filter.favorites_only, missing_only: false }))}
    >
      <Icon name="star" />
      <span>{t("sidebar.favorites")}</span>
      <span class="tabular">{formatCount(counts.favorites)}</span>
    </button>
    <button
      class="count-chip"
      class:active={library.filter.missing_only}
      class:warn={counts.missing > 0 && !library.filter.missing_only}
      onclick={chipFilter(() => library.setFilter({ missing_only: !library.filter.missing_only, favorites_only: false }))}
    >
      <Icon name="alert-triangle" />
      <span>{t("sidebar.missing")}</span>
      <span class="tabular">{formatCount(counts.missing)}</span>
    </button>
  </div>

  <ProgressBar />

  <span class="spacer"></span>

  {#if filtered}
    <span class="result-count" aria-live="polite">{t("status.results", { count: formatCount(library.total) })}</span>
  {/if}

  <button class="control" onclick={() => void library.rescan()} disabled={feedback.job !== null}>
    <Icon name="rescan" />
    <span>{t("status.rescan")}</span>
  </button>
</footer>

<style>
  .status-bar {
    grid-area: status;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--status-height);
    padding: 0 12px;
    background: var(--surface-0);
    border-top: 1px solid var(--border-hairline);
  }

  .counts {
    display: flex;
    gap: 4px;
  }

  .count-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-chip);
    font-size: var(--text-12);
    color: var(--text-secondary);
  }

  .count-chip:hover {
    background: var(--surface-2);
  }

  .count-chip.active {
    background: var(--accent-quiet);
    color: var(--accent);
  }

  .count-chip.warn {
    color: var(--warning);
  }

  .count-chip .tabular {
    color: inherit;
  }

  .spacer {
    flex: 1;
  }

  .result-count {
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }
</style>
