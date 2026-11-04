<script lang="ts">
  // Window controls (UI-07): the OS title bar is removed (`decorations: false`),
  // so minimize / maximize-restore / close are the app's own buttons at the
  // toolbar's right end. The capabilities file grants exactly these three
  // window commands (R1.5, spec §3.1).
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

  const win = getCurrentWindow();
  let maximized = $state(false);

  // The maximize button mirrors the window state: while maximized it is a
  // Restore button (spec §3.1). `isMaximized` is part of the granted
  // `core:window:default` set; the resize listener only re-reads it.
  $effect(() => {
    let active = true;
    void win
      .isMaximized()
      .then((value) => {
        if (active) maximized = value;
      })
      .catch(() => {});
    const unlisten = win.onResized(async () => {
      try {
        const value = await win.isMaximized();
        if (active) maximized = value;
      } catch {
        /* the glyph keeps its last known state */
      }
    });
    return () => {
      active = false;
      void unlisten.then((fn) => fn());
    };
  });
</script>

<button
  class="window-button"
  aria-label={t("window.minimize")}
  title={t("window.minimize")}
  onclick={() => void win.minimize()}
>
  <Icon name="minus" />
</button>
<button
  class="window-button"
  data-maximized={maximized || undefined}
  aria-label={maximized ? t("window.restore") : t("window.maximize")}
  title={maximized ? t("window.restore") : t("window.maximize")}
  onclick={() => void win.toggleMaximize()}
>
  <Icon name={maximized ? "restore" : "maximize"} />
</button>
<button
  class="window-button window-close"
  aria-label={t("window.close")}
  title={t("window.close")}
  onclick={() => void win.close()}
>
  <Icon name="close" />
</button>

<style>
  .window-button {
    display: grid;
    place-items: center;
    width: 44px;
    height: var(--toolbar-height);
    color: var(--text-secondary);
    border-radius: 0;
  }

  .window-button:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .window-close:hover {
    background: var(--danger);
    color: var(--text-on-accent);
  }
</style>
