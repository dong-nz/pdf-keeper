<script lang="ts">
  // SearchBox (spec §5.3.6, UI-14, UI-16): local echo, 150 ms debounce, clear
  // button, Ctrl+F focus (registered in focus.ts), Esc clears when focused.
  // The field now carries the import control at its trailing end behind a
  // divider (UI-14): the plus opens *Import files…* / *Import folder…*, and the
  // clear button takes that same slot while the field holds text. The
  // placeholder names the current scope (UI-16, `searchScope.ts`); the
  // accessible name is the fixed "Search" label, never the placeholder.
  import { DropdownMenu } from "bits-ui";
  import { library } from "$lib/state/library.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { debounce } from "$lib/debounce";
  import { searchFocus } from "$lib/focus";
  import { searchPlaceholder } from "$lib/searchScope";
  import { pickFilesAndImport, pickFolderAndImport } from "$lib/importFlow";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import Tooltip from "./Tooltip.svelte";

  let input: HTMLInputElement;
  let text = $state(library.filter.q);

  const placeholder = $derived(
    searchPlaceholder(library.filter, library.counts.total, library.categories),
  );

  const pushQuery = debounce((value: string) => {
    if (value !== library.filter.q) library.setFilter({ q: value });
  }, 150);

  searchFocus.register = () => {
    input?.focus();
    input?.select();
  };

  function clear() {
    pushQuery.cancel();
    text = "";
    library.setFilter({ q: "" });
    input?.focus();
  }
</script>

<div class="search-box" data-tauri-drag-region="false">
  <Icon name="search" />
  <input
    bind:this={input}
    class="search-input"
    type="text"
    spellcheck="false"
    autocomplete="off"
    placeholder={placeholder}
    aria-label={t("search.label")}
    bind:value={text}
    oninput={() => pushQuery(text)}
    onkeydown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        clear();
      }
      // Ctrl+F while the box already owns focus: select the text (§5.3).
      // The global Ctrl+F guard skips text targets, so this lives here.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        (event.currentTarget as HTMLInputElement).select();
      }
    }}
  />

  <span class="field-divider" aria-hidden="true"></span>

  {#if text !== ""}
    <button class="icon-button field-action" type="button" aria-label={t("toolbar.clearSearch")} onclick={clear}>
      <Icon name="close" />
    </button>
  {:else}
    <DropdownMenu.Root>
      <Tooltip text={t("toolbar.import")}>
        {#snippet control({ props })}
          <DropdownMenu.Trigger
            {...props}
            class="icon-button field-action"
            aria-label={t("toolbar.import")}
            disabled={feedback.job !== null}
          >
            <Icon name="plus" />
          </DropdownMenu.Trigger>
        {/snippet}
      </Tooltip>
      <DropdownMenu.Content class="menu import-menu">
        <OverlayAnchor />
        <DropdownMenu.Item class="menu-item" onSelect={() => void pickFilesAndImport()}>
          <span class="item-label">
            <Icon name="import" />
            <span>{t("toolbar.importFiles")}</span>
          </span>
        </DropdownMenu.Item>
        <DropdownMenu.Item class="menu-item" onSelect={() => void pickFolderAndImport()}>
          <span class="item-label">
            <Icon name="folder" />
            <span>{t("toolbar.importFolder")}</span>
          </span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</div>

<style>
  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 320px;
    max-width: 560px;
    height: var(--control-height);
    padding: 0 4px 0 8px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-control);
    background: var(--surface-1);
    color: var(--text-tertiary);
  }

  .search-box:focus-within {
    border-color: var(--accent);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: var(--text-13);
    color: var(--text-primary);
    outline: none;
  }

  /* The trailing slot (UI-14): a 1 px divider, then the clear button or the
     import control — never both. */
  .field-divider {
    width: 1px;
    height: 18px;
    flex: none;
    background: var(--border-strong);
  }

  .field-action {
    width: 26px;
    height: 26px;
  }
</style>
