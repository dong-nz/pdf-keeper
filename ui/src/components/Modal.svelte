<script lang="ts">
  // Kit wrapper (DR-45): Dialog primitive + our tokens. Every modal in the
  // app goes through this file; no other component imports the kit.
  import type { Snippet } from "svelte";
  import { Dialog } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import { t } from "$lib/i18n";

  let {
    title,
    width = 560,
    open = $bindable(false),
    onEscapeKeydown,
    children,
  }: {
    title: string;
    width?: number;
    open?: boolean;
    /** Override to intercept Esc (e.g. the unsaved-changes confirm). */
    onEscapeKeydown?: (event: KeyboardEvent) => void;
    children: Snippet;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" style="width: {width}px" {onEscapeKeydown}>
      <OverlayAnchor />
      <Dialog.Title class="modal-title">{title}</Dialog.Title>
      <Dialog.Close class="modal-close" type="button" aria-label={t("a11y.dismiss")}>
        <Icon name="close" />
      </Dialog.Close>
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

