<script lang="ts">
  // ImportButton: split control. Primary opens the native file picker
  // (multiple PDFs); the caret opens "Import folder…" (DR-50a). Native
  // dialogs only — no hand-rolled file UI (DR-44). The caret menu is
  // product chrome (hand-written, like chips/segmented controls), so only
  // the five wrapper files touch the kit.
  import { feedback } from "$lib/state/feedback.svelte";
  import { pickFilesAndImport, pickFolderAndImport } from "$lib/importFlow";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";

  let menuOpen = $state(false);

  $effect(() => {
    if (!menuOpen) return;
    const end = feedback.beginOverlay();
    const onDocClick = () => (menuOpen = false);
    // Defer so the opening click does not close the menu immediately.
    const timer = setTimeout(() => document.addEventListener("click", onDocClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onDocClick);
      end();
    };
  });
</script>

<div class="import-button">
  <button
    class="control control-primary"
    disabled={feedback.job !== null}
    onclick={() => void pickFilesAndImport()}
  >
    <Icon name="import" />
    <span>{feedback.job !== null ? t("toolbar.importing") : t("toolbar.import")}</span>
  </button>
  <button
    class="control control-primary caret"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label={t("toolbar.import")}
    disabled={feedback.job !== null}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <Icon name="chevron-right" />
  </button>
  {#if menuOpen}
    <div class="menu" role="menu" tabindex="-1" onkeydown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        menuOpen = false;
      }
    }}>
      <button role="menuitem" class="menu-item" onclick={() => { menuOpen = false; void pickFilesAndImport(); }}>
        <Icon name="import" />
        <span>{t("toolbar.importFiles")}</span>
      </button>
      <button role="menuitem" class="menu-item" onclick={() => { menuOpen = false; void pickFolderAndImport(); }}>
        <Icon name="folder" />
        <span>{t("toolbar.importFolder")}</span>
      </button>
    </div>
  {/if}
</div>

<!-- svelte-ignore css_unused_selector -->
<style>
  .import-button {
    display: inline-flex;
    align-items: center;
    position: relative;
  }

  .import-button > button:first-child {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }

  .caret {
    padding: 0 6px;
    border-start-start-radius: 0;
    border-end-start-radius: 0;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.25);
  }

  .caret svg {
    transform: rotate(90deg);
  }

  /* Menu chrome itself is global (base.css, DR-56); this menu only adds
     its anchor position under the split button. */
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
  }
</style>
