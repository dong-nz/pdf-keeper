<script lang="ts">
  // Tooltip wrapper (§3.6): the kit's Tooltip primitive around a control the app
  // already renders. The control is passed as the kit's `child` snippet and
  // receives the merged trigger props, so ONE element carries both behaviors —
  // the menu stays a menu and still shows its tooltip. Hover and keyboard focus
  // produce the same tooltip (R4.4): the kit opens on focus as well as hover.
  // Every visual here comes from tokens (R4.5); a tooltip is chrome, not an
  // overlay in the elevation sense of §5.3.7, so it carries no shadow.
  import { Tooltip as TooltipKit } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    text,
    control,
  }: {
    text: string;
    control: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();
</script>

<TooltipKit.Root>
  <TooltipKit.Trigger>
    {#snippet child({ props })}
      {@render control({ props })}
    {/snippet}
  </TooltipKit.Trigger>
  <TooltipKit.Content class="tooltip" side="bottom" sideOffset={6} align="center">
    {text}
  </TooltipKit.Content>
</TooltipKit.Root>

<!-- svelte-ignore css_unused_selector -->
<style>
  .tooltip {
    z-index: 60;
    font-size: var(--text-12);
    color: var(--text-primary);
    background: var(--surface-0);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    padding: 5px 8px;
    max-width: 260px;
  }

  .tooltip[data-state="open"] {
    animation: tooltip-in var(--duration-hover) var(--ease);
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
