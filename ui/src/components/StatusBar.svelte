<script lang="ts">
  // Status bar (UI-15 as modified by DR-210): conditional content only. With
  // nothing to say it shows the document count labeled with its unit —
  // "1,234 documents" / "1 document" through the plural catalog, same
  // tertiary style and tabular figures; the missing-document warning appears
  // only when the missing count is above zero; the progress bar only while a
  // job runs; the result count only while a filter is active. The count chips
  // and the Rescan button are gone — the counts and the rescan control now
  // live in the Browse menu (UI-09, DR-96b). Counts still come only from
  // `status_updated` and stay library-wide, never filter-dependent (FR-15's
  // invariant unchanged).
  import { library } from "$lib/state/library.svelte";
  import { t, tp } from "$lib/i18n";
  import { formatCount } from "$lib/format";
  import Icon from "./Icon.svelte";
  import ProgressBar from "./ProgressBar.svelte";

  const counts = $derived(library.counts);
  const filtered = $derived(
    library.filter.q !== "" ||
      library.filter.category_ids.length > 0 ||
      library.filter.favorites_only ||
      library.filter.missing_only,
  );
</script>

<footer class="status-bar">
  <span class="doc-count tabular">{tp("status.documents", counts.total)}</span>

  {#if counts.missing > 0}
    <span class="missing-warning" aria-live="polite">
      <Icon name="alert-triangle" />
      <span>{tp("status.missingFiles", counts.missing)}</span>
    </span>
  {/if}

  <ProgressBar />

  <span class="spacer"></span>

  {#if filtered}
    <span class="result-count" aria-live="polite">{t("status.results", { count: formatCount(library.total) })}</span>
  {/if}
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

  .doc-count {
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }

  .missing-warning {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-12);
    color: var(--warning);
  }

  .spacer {
    flex: 1;
  }

  .result-count {
    font-size: var(--text-12);
    color: var(--text-tertiary);
  }
</style>
