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

  let content = $state<HTMLElement | null>(null);

  // A dialog owns the keyboard while it is open (AC-16, AC-29: Tab stays inside
  // it). The kit does claim focus on open — but on the next animation frame,
  // and only while its focus scope is the active one. A menu that opened this
  // dialog closes in the same cycle and returns focus to its own trigger, which
  // wins that race and leaves the dialog un-focused. The guard re-claims it:
  // focus back on whatever the dialog had, or on its first control. Two things
  // are left alone — focus that moved into another overlay the app owns (a
  // nested dialog, or a menu a row inside the tags manager opens), and
  // the hand-back to the element that was focused before the dialog opened —
  // that is the close, not an escape: the row that pressed Delete has to keep
  // the keyboard when the delete dialog goes away.
  $effect(() => {
    if (!open) return;
    // The element the app had focused before this dialog opened. When the kit
    // hands the keyboard back to it on close, that is the end of the dialog's
    // claim on focus, not an escape from it.
    const preFocused = document.activeElement as HTMLElement | null;
    let held: HTMLElement | null = null;
    const claim = () => {
      if (held?.isConnected) {
        held.focus({ preventScroll: true });
        return;
      }
      const first = content?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (first ?? content)?.focus({ preventScroll: true });
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!content?.isConnected) return;
      const active = document.activeElement as HTMLElement | null;
      if (content.contains(active)) {
        held = active;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest(".modal, .menu, .tooltip")) return;
      if (active && active === preFocused) return;
      claim();
    };
    document.addEventListener("focusin", onFocusIn, true);
    // The kit defers its own claim to the next animation frame, and that claim
    // is skipped when focus is already somewhere it considers inside the scope.
    // Opening a dialog with Enter on a menu item is exactly that case: the menu
    // closes and puts focus back on its trigger before the dialog has one. The
    // claim follows on the frame the content is there.
    requestAnimationFrame(claim);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  });

  // Escape belongs to the dialog (AC-16, AC-29). The kit answers it through a
  // global layer stack (bits-ui use-escape-layer.svelte.js): the last registered
  // layer whose behavior is close/ignore answers the key. A layer left in that
  // stack by an overlay whose content is gone — the probe in the smoke harness
  // found one with a null ref and no layer for the open dialog — outranks this
  // dialog, consumes the key and closes nothing. The app decides it here instead,
  // in the capture phase, before that stack is consulted. Three rules: only the
  // topmost dialog that is not already closing answers (a nested one owns the
  // key); a menu that is genuinely open keeps its own kit-handled Escape; and a
  // dialog's own override — the unsaved-changes confirm in DetailsModal — gets
  // first say and keeps the dialog open when it consumes the key.
  $effect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !content?.isConnected) return;
      // A menu that is still open owns its own Escape (the kit handles it). A
      // menu that is already closing does not: its element is on its way out,
      // and deferring to it leaves the key with nobody.
      const menuOpen = Array.from(document.querySelectorAll(".menu"))
        .some((el) => el.getAttribute("data-state") !== "closed");
      if (menuOpen) return;
      const openModals = Array.from(document.querySelectorAll(".modal"))
        .filter((el) => el.getAttribute("data-state") !== "closed");
      if (openModals[openModals.length - 1] !== content) return;
      onEscapeKeydown?.(event);
      event.stopPropagation();
      if (event.defaultPrevented) return;
      event.preventDefault();
      open = false;
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="modal-overlay" />
    <Dialog.Content class="modal" style="width: {width}px" bind:ref={content}>
      <OverlayAnchor />
      <Dialog.Title class="modal-title">{title}</Dialog.Title>
      <Dialog.Close class="modal-close" type="button" aria-label={t("a11y.dismiss")}>
        <Icon name="close" />
      </Dialog.Close>
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

