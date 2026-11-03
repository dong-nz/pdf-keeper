<script lang="ts" generics="T extends { id: number }">
  // Kit wrapper (DR-45): ContextMenu primitive. Wraps the row/card content so
  // right-click (and Shift+F10 on a focused row) opens the SAME action set
  // the buttons use (R4.7).
  import type { Snippet } from "svelte";
  import { ContextMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import { t } from "$lib/i18n";
  import { labelOf, iconOf, type UiAction } from "$lib/actions";

  let {
    items,
    target,
    open = $bindable(false),
    children,
  }: {
    items: UiAction<T>[];
    target: T;
    open?: boolean;
    children: Snippet;
  } = $props();

  const applicable = $derived(items.filter((action) => !action.applies || action.applies(target)));
</script>

<ContextMenu.Root bind:open>
  <ContextMenu.Trigger class="ctx-trigger">{@render children()}</ContextMenu.Trigger>
  <ContextMenu.Content class="menu">
    <OverlayAnchor />
    {#each applicable as action (action.id)}
      <ContextMenu.Item class="menu-item" data-danger={action.danger || undefined} onSelect={() => action.run(target)}>
        <Icon name={iconOf(action, target)} />
        <span>{t(labelOf(action, target))}</span>
      </ContextMenu.Item>
    {/each}
  </ContextMenu.Content>
</ContextMenu.Root>

