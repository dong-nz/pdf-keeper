<script lang="ts">
  // Missing-file badge (UI-06): warning color + tooltip with the stored path.
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
  import type { DocumentDto } from "$lib/types";

  let { doc }: { doc: DocumentDto } = $props();
</script>

{#if doc.missing}
  <span class="missing-badge" data-path={doc.path} title={doc.path}>
    <Icon name="alert-triangle" />
    <span>{t("row.missingBadge")}</span>
  </span>
{/if}

<style>
  .missing-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-11);
    color: var(--warning);
    background: var(--warning-quiet);
    border-radius: var(--radius-chip);
    padding: 1px 8px;
    flex: none;
  }
</style>
