<script lang="ts">
  // SearchBox (spec §5.3.6): local echo, 150 ms debounce, clear button,
  // Ctrl+F focus (registered in focus.ts), Esc clears when focused.
  import { library } from "$lib/state/library.svelte";
  import { debounce } from "$lib/debounce";
  import { searchFocus } from "$lib/focus";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";

  let input: HTMLInputElement;
  let text = $state(library.filter.q);

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

<div class="search-box">
  <Icon name="search" />
  <input
    bind:this={input}
    class="search-input"
    type="text"
    spellcheck="false"
    autocomplete="off"
    placeholder={t("toolbar.searchPlaceholder")}
    aria-label={t("toolbar.searchPlaceholder")}
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
  {#if text !== ""}
    <button class="icon-button clear" type="button" aria-label={t("toolbar.clearSearch")} onclick={clear}>
      <Icon name="close" />
    </button>
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
    padding: 0 8px;
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

  .clear {
    width: 24px;
    height: 24px;
  }
</style>
