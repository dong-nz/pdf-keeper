<script lang="ts">
  // ViewToggle: the only writer of the view mode; persists via settings.
  import { settings } from "$lib/state/settings.svelte";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
  import type { ViewMode } from "$lib/types";

  const MODES: { mode: ViewMode; labelKey: "toolbar.view.list" | "toolbar.view.grid"; icon: "list" | "grid" }[] = [
    { mode: "list", labelKey: "toolbar.view.list", icon: "list" },
    { mode: "grid", labelKey: "toolbar.view.grid", icon: "grid" },
  ];
</script>

<div class="view-toggle" role="group" aria-label={t("toolbar.view")}>
  {#each MODES as option (option.mode)}
    <button
      class="icon-button"
      class:active={settings.view === option.mode}
      aria-pressed={settings.view === option.mode}
      aria-label={t(option.labelKey)}
      title={t(option.labelKey)}
      onclick={() => settings.setView(option.mode)}
    >
      <Icon name={option.icon} />
    </button>
  {/each}
</div>

<style>
  .view-toggle {
    display: inline-flex;
    gap: 2px;
  }

  .active {
    background: var(--accent-quiet);
    color: var(--accent);
  }
</style>
