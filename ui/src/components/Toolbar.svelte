<script lang="ts">
  // Toolbar (UI-01): search, import, sort, view toggle. Height 52, sticky.
  import SearchBox from "./SearchBox.svelte";
  import ImportButton from "./ImportButton.svelte";
  import SortMenu from "./SortMenu.svelte";
  import ViewToggle from "./ViewToggle.svelte";
</script>

<header class="toolbar">
  <SearchBox />
  <div class="toolbar-actions">
    <ImportButton />
    <SortMenu />
    <ViewToggle />
  </div>
</header>

<style>
  .toolbar {
    grid-area: toolbar;
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--toolbar-height);
    padding: 0 12px;
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
</style>
