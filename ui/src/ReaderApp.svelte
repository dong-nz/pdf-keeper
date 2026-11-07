<script lang="ts">
  // The reader window surface (SPEC-v0.0.6 §3.3, UI-30): reached only
  // through the `?reader=<docId>` route (main.ts), it carries no library
  // surface — no toolbar, no menus, no status bar. Two strips above the
  // pages: the window chrome (drag region + document name + the released
  // WindowControls, DR-140) and the reader control strip; below them the
  // page stack. Both strips take the app's own chrome height — no new
  // metric, the same token the toolbar uses.
  import { onMount } from "svelte";
  import { Tooltip } from "bits-ui";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import WindowControls from "./components/WindowControls.svelte";
  import ReaderControls from "./components/ReaderControls.svelte";
  import ReaderView from "./components/ReaderView.svelte";
  import ToastStack from "./components/ToastStack.svelte";
  import Icon from "./components/Icon.svelte";
  import { ReaderStore } from "$lib/state/reader.svelte";
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
    void settings.load().then(() => store.load());
  });

  // The reader window's own key map (UI-30). Esc closes this window —
  // there are no overlays here it could belong to, so it is not guarded;
  // the navigation keys are guarded (typing in the page field owns them).
  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
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
<Tooltip.Provider delayDuration={300}>
<div class="reader">
  <header class="chrome" data-tauri-drag-region="deep">
    <Icon name="book-open" />
    <span class="name" title={store.documentName}>{store.documentName}</span>
    <span class="chrome-spacer"></span>
    <WindowControls />
  </header>

  {#if store.status === "ready"}
    <ReaderControls {store} />
    <ReaderView {store} />
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
</Tooltip.Provider>

<!-- Toasts only for the error state's action failing (the external open
     rejecting after the window was already open). The mechanism is the
     released one, not a reader variant. -->
<ToastStack />

<style>
  .reader {
    display: grid;
    grid-template-rows: var(--toolbar-height) auto minmax(0, 1fr);
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

  .name {
    max-width: 60ch;
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
