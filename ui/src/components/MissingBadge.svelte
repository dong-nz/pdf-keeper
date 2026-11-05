<script lang="ts">
  // Missing-file badge (UI-06; one treatment per UI-25): the single source of
  // the missing state (R1.6), rendered two ways — as plain text in a list row
  // (the same treatment the Browse submenu and the Settings Library row use),
  // or as a filled overlay badge over a card cover, where it needs a ground to
  // stay readable on the image. The tooltip carries the stored path; the
  // `data-path` hook is what the relink entry points read.
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
  import type { DocumentDto } from "$lib/types";

  let { doc, variant = "row" }: { doc: DocumentDto; variant?: "row" | "card" } = $props();
</script>

{#if doc.missing}
  <span class="missing-flag" class:over-image={variant === "card"} data-path={doc.path} title={doc.path}>
    <Icon name="alert-triangle" />
    <span>{t("row.missingBadge")}</span>
  </span>
{/if}

<style>
  /* UI-25 (AC-47): the row flag is the glyph and the catalog label as plain
     text in the warning role — no ground, no pill. */
  .missing-flag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-12);
    color: var(--warning);
    flex: none;
  }

  /* Over a card cover the same state keeps a filled ground: the 12% warning
     tint, the hover text value (the D11 rule for text on a tint of its own
     color), `border-radius` at half the badge's height — not a 999 px pill. */
  .missing-flag.over-image {
    font-size: var(--text-11);
    color: var(--warning-hover);
    background: var(--warning-quiet);
    border-radius: 8px;
    padding: 2px 8px;
  }
</style>
