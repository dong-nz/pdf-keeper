<script lang="ts">
  // Toolbar (UI-01 as modified by UI-07, UI-09 and UI-12): the single top row
  // — Browse, search, Import, Sort, View, the active-filter chips, the app
  // menu, window controls. The strip is the window drag region; controls are
  // not (spec §3.1). Height is the `--toolbar-height` token; wrapping chips
  // may grow the row, which the layout tolerates (no layout math reads it).
  import BrowseMenu from "./BrowseMenu.svelte";
  import SearchBox from "./SearchBox.svelte";
  import ImportButton from "./ImportButton.svelte";
  import SortMenu from "./SortMenu.svelte";
  import ViewMenu from "./ViewMenu.svelte";
  import FilterChips from "./FilterChips.svelte";
  import AppMenu from "./AppMenu.svelte";
  import WindowControls from "./WindowControls.svelte";
</script>

<header class="toolbar" data-tauri-drag-region>
  <BrowseMenu />
  <SearchBox />
  <div class="toolbar-actions">
    <ImportButton />
    <SortMenu />
    <ViewMenu />
  </div>
  <FilterChips />
  <span class="toolbar-spacer"></span>
  <AppMenu />
  <WindowControls />
</header>

<style>
  .toolbar {
    grid-area: toolbar;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--toolbar-height);
    padding: 0 0 0 12px;
    background: var(--surface-0);
    border-bottom: 1px solid var(--border-hairline);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }

  .toolbar-spacer {
    flex: 1 1 0;
    min-width: 0;
  }
</style>
