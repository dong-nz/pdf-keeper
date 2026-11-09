<script lang="ts">
  // The reader window surface (SPEC-v0.0.6 §3.3 UI-30, layout as modified
  // by SPEC-v0.0.7 §3.3): reached only through the `?reader=<docId>` route
  // (main.ts), it carries no library surface — no toolbar, no menus, no
  // status bar. The window chrome (drag region + document name + the
  // released WindowControls, DR-140) sits at the top edge, the page stack
  // fills the middle, and the reader control strip renders at the window's
  // bottom edge below the stack. The chrome and control strips take the
  // app's own chrome height — no new metric, the same token the toolbar
  // uses. The control strip renders only in the `ready` state; the error
  // state renders no controls.
  import { onMount } from "svelte";
  import { Tooltip as TooltipKit } from "bits-ui"; // the app's own `Tooltip` component is the window's wrapper
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import WindowControls from "./components/WindowControls.svelte";
  import ReaderControls from "./components/ReaderControls.svelte";
  import ReaderView from "./components/ReaderView.svelte";
  import ToastStack from "./components/ToastStack.svelte";
  import Icon from "./components/Icon.svelte";
  import Tooltip from "./components/Tooltip.svelte";
  import { ReaderStore, SCROLL_NOTCH } from "$lib/state/reader.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { applyTheme, onSystemThemeChange } from "$lib/theme";
  import { isTextTarget } from "$lib/focus";
  import { t } from "$lib/i18n";
  import * as api from "./api";
  import { asAppError } from "$lib/types";

  let { docId }: { docId: number } = $props();
  // One store per reader window: `docId` is the route parameter this window
  // was created with and never changes for its lifetime, so capturing it at
  // construction is the intent (the warning is about reactive re-reads).
  // svelte-ignore state_referenced_locally
  const store = new ReaderStore(docId);
  const win = getCurrentWindow();

  // Theme through the released path (DR-101): the stored choice wins,
  // "system" follows the OS — the same ramps, including the dark ramp, in
  // every window. settings.load() is the existing read; the reader window
  // never writes settings.
  $effect(() => {
    const choice = settings.theme;
    applyTheme(choice);
    if (choice !== "system") return;
    return onSystemThemeChange(() => applyTheme("system"));
  });

  onMount(() => {
    // DR-230/AC-99: the reader window subscribes to the settings broadcast
    // like every other window — a theme change made elsewhere re-applies
    // here live. The subscription comes before the read, App.svelte's
    // startup order unchanged.
    void (async () => {
      await settings.initEvents();
      await settings.load();
      await store.load();
    })();
  });

  // The reader window's own key map (UI-30). Esc closes this window —
  // with the ToC panel open it closes the panel first and the window
  // stays open (UI-33, the released overlay-priority guard of §5.2: the
  // kit's own handler consumes the key, and `overlayCount` — decremented
  // only after the current task — covers the window listener in the same
  // dispatch). With no overlay open the behavior is unchanged. The
  // navigation keys are guarded (typing in the page field owns them).
  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (event.defaultPrevented || feedback.overlayCount > 0) return;
      void win.close();
      return;
    }
    if (isTextTarget(event.target)) return;
    if (event.key === "PageDown") {
      event.preventDefault();
      store.scrollViewport(1);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      store.scrollViewport(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      store.goToPage(1);
    } else if (event.key === "End") {
      event.preventDefault();
      store.goToPage(store.doc?.page_count ?? 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Page navigation (UI-39/DR-228): exactly the strip's prev/next —
      // the same `stepPage` path. With an overlay open the arrows belong
      // to it (the ToC panel's entry keys, every menu's own keys).
      if (feedback.overlayCount > 0) return;
      event.preventDefault();
      store.stepPage(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // The wheel's keyboard counterpart (UI-39/DR-228): one notch. The
      // store routes the mode — stack scroll in continuous/facing, the
      // view's edge rule in single (DR-227).
      if (feedback.overlayCount > 0) return;
      event.preventDefault();
      store.scrollNotch(event.key === "ArrowDown" ? SCROLL_NOTCH : -SCROLL_NOTCH);
    } else if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (event.key === "=" || event.key === "+" || event.key === "-")
    ) {
      // Zoom keys (UI-30/DR-221, AC-96): Ctrl + / Ctrl − walk the ladder —
      // the same `changeZoom` path the − / + buttons use. `=` is the
      // unshifted pair of `+` on every layout; the numpad sends it directly.
      event.preventDefault();
      store.changeZoom(event.key === "-" ? -1 : 1);
    } else if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (event.key === "0" || event.key === "1" || event.key === "2")
    ) {
      // Ctrl 0 / 1 / 2 = Fit width / Fit page / Actual Size (AC-96).
      event.preventDefault();
      store.setZoomMode(
        event.key === "0" ? "fit-width" : event.key === "1" ? "fit-page" : "actual",
      );
    }
  }

  // The error state's action (AC-69): the external path, its own command —
  // the same call the library window's "Open in external viewer" makes.
  function openExternally(): void {
    void api.appOpenDocument(store.docId).catch((error: unknown) => {
      feedback.reportError(asAppError(error));
    });
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- One Tooltip.Provider per window (the released §3.6 pattern): each window
     is its own app root, and the reader's control strip uses Tooltips. -->
<TooltipKit.Provider delayDuration={300}>
<div class="reader">
  <header class="chrome" data-tauri-drag-region="deep">
    <Icon name="book-open" />
    <Tooltip text={store.documentName}>
      {#snippet control({ props })}
        <span class="name" {...props}>{store.documentName}</span>
      {/snippet}
    </Tooltip>
    <span class="chrome-spacer"></span>
    <WindowControls />
  </header>

  {#if store.status === "ready"}
    <ReaderView {store} />
    <ReaderControls {store} />
  {:else if store.status === "error"}
    <!-- The error state (UI-31/AC-69): the typed failure rendered in the
         window, with the external-open action FR-17 requires for an
         unrenderable file. -->
    <div class="error-state">
      <Icon name="alert-triangle" />
      <p class="error-title">{t("reader.error")}</p>
      <p class="error-detail">{store.error?.message}</p>
      <button type="button" class="control control-primary" onclick={openExternally}>
        {t("row.openExternal")}
      </button>
    </div>
  {/if}
</div>
</TooltipKit.Provider>

<!-- Toasts only for the error state's action failing (the external open
     rejecting after the window was already open). The mechanism is the
     released one, not a reader variant. -->
<ToastStack />

<style>
  .reader {
    display: grid;
    /* DR-214: the column is clamped to the viewport. An implicit auto
       track takes the chrome's intrinsic min-content (the nowrap name +
       the control groups' minimums) as its minimum, which let the strip
       exceed the window instead of ellipsizing the name (DR-206). */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: var(--toolbar-height) minmax(0, 1fr) auto;
    height: 100dvh;
    background: var(--surface-0);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-13);
  }

  .chrome {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 var(--content-gutter);
    border-bottom: 1px solid var(--border-hairline);
  }

  /* Name display (DR-206): no fixed character cap — the name keeps its
     content width while the strip has room (the spacer absorbs the free
     space) and shrinks with an ellipsis only on real overflow; the app
     tooltip carries the full name either way (UI-37/AC-87). */
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-size: var(--text-14);
  }

  .chrome-spacer {
    flex: 1;
  }

  .error-state {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--text-secondary);
  }

  .error-title {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-16);
  }

  .error-detail {
    margin: 0 0 8px;
    font-size: var(--text-12);
  }
</style>
