<script lang="ts">
  // Document area (UI-02): the only scroller, the only virtualization
  // owner and the owner of every document-level dialog. Windowing math is
  // pure (virtual.ts); item sizes are the design-system constants (§5.3.5).
  import { window as windowRange, gridColumns, nearEnd } from "$lib/virtual";
  import { library } from "$lib/state/library.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { hasActiveFilter } from "$lib/types";
  import { pickFilesAndImport } from "$lib/importFlow";
  import { documentActions, type DocumentUiHost, type BulkUiHost } from "$lib/actions";
  import { t } from "$lib/i18n";
  import type { DocumentDto } from "$lib/types";
  import DocumentList from "./DocumentList.svelte";
  import DocumentGrid from "./DocumentGrid.svelte";
  import FilterChips from "./FilterChips.svelte";
  import BulkBar from "./BulkBar.svelte";
  import EmptyState from "./EmptyState.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import DetailsModal from "./DetailsModal.svelte";
  import CategoryPickerModal from "./CategoryPickerModal.svelte";
  import DeleteDialog from "./DeleteDialog.svelte";
  import RelinkDialog from "./RelinkDialog.svelte";

  // Mirrors the design tokens (--row-height, --cell-height); the windowing
  // math and the CSS MUST stay in lockstep (spec §5.3.5).
  const ROW_HEIGHT = 48;
  const CELL_HEIGHT = 401;

  let scroller: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let containerWidth = $state(0);

  let detailsTarget = $state<DocumentDto | null>(null);
  let deleteIds = $state<number[] | null>(null);
  let pickerOpen = $state(false);

  const columns = $derived(gridColumns(containerWidth));
  const listWin = $derived(windowRange(scrollTop, viewportHeight, library.rows.length, ROW_HEIGHT));
  const gridBlocks = $derived(Math.ceil(library.rows.length / columns));
  const gridWin = $derived(windowRange(scrollTop, viewportHeight, gridBlocks, CELL_HEIGHT));

  const docHost: DocumentUiHost = {
    openDetails: (doc) => (detailsTarget = doc),
    openDelete: (ids) => (deleteIds = ids),
    openRelink: (id) => feedback.openRelink(id),
  };
  const docActions = documentActions(docHost);

  const bulkHost: BulkUiHost = {
    setAllFavorites: (value) => {
      for (const id of library.selection) void library.setFavorite(id, value);
    },
    openCategoryPicker: () => (pickerOpen = true),
    openDelete: () => (deleteIds = [...library.selection]),
  };

  const showSkeleton = $derived(library.loading && library.rows.length === 0);

  interface EmptyStateView {
    title: string;
    body: string;
    actionLabel?: string;
    onaction?: () => void;
    hint?: string;
  }

  // Empty-state variant selection (§5.3.8): which filter produced the zero.
  const emptyState = $derived.by((): EmptyStateView | null => {
    if (showSkeleton || library.total > 0) return null;
    const f = library.filter;
    if (f.q !== "") {
      return {
        title: t("empty.search.title", { q: f.q }),
        body: t("empty.search.body"),
        actionLabel: t("empty.search.action"),
        onaction: () => library.clearFilters(),
      };
    }
    if (f.favorites_only) return { title: t("empty.favorites.title"), body: t("empty.favorites.body") };
    if (f.missing_only) return { title: t("empty.missing.title"), body: t("empty.missing.body") };
    if (f.category_id !== null) {
      return {
        title: t("empty.category.title"),
        body: t("empty.category.body"),
        actionLabel: t("empty.category.action"),
        onaction: () => void pickFilesAndImport(),
      };
    }
    return {
      title: t("empty.library.title"),
      body: t("empty.library.body"),
      actionLabel: t("empty.library.action"),
      onaction: () => void pickFilesAndImport(),
      hint: t("empty.library.hint"),
    };
  });

  // A query reset scrolls the list to top (§5.3.4 rule 3).
  $effect(() => {
    library.onQueryReset = () => scroller?.scrollTo({ top: 0 });
    return () => {
      library.onQueryReset = null;
    };
  });

  $effect(() => {
    const el = scroller;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      viewportHeight = el.clientHeight;
      containerWidth = el.clientWidth;
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  function onScroll() {
    if (!scroller) return;
    scrollTop = scroller.scrollTop;
    viewportHeight = scroller.clientHeight;
    const grid = settings.view === "grid";
    if (nearEnd(scrollTop, viewportHeight, grid ? gridBlocks : library.rows.length, grid ? CELL_HEIGHT : ROW_HEIGHT)) {
      void library.loadMore();
    }
  }

  // Delete on a focused selection opens the same dialog the row action uses.
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Delete" || library.selection.size === 0) return;
    event.preventDefault();
    deleteIds = [...library.selection];
  }
</script>

<main class="document-area">
  <FilterChips />
  <BulkBar host={bulkHost} />

  {#if showSkeleton}
    <SkeletonRows />
  {:else if emptyState}
    <EmptyState {...emptyState} />
  {:else}
    <!-- Delete on a focused selection is delegated from inside the region (UI-05) -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="scroller"
      role="region"
      aria-label={settings.view === "grid" ? t("a11y.documentGrid") : t("a11y.documentList")}
      bind:this={scroller}
      onscroll={onScroll}
      onkeydown={onKeydown}
    >
      {#if settings.view === "grid"}
        <DocumentGrid win={gridWin} actions={docActions} columns={columns} />
      {:else}
        <DocumentList win={listWin} actions={docActions} />
      {/if}
    </div>
  {/if}

  {#if detailsTarget}
    <DetailsModal doc={detailsTarget} ondone={() => (detailsTarget = null)} />
  {/if}
  <CategoryPickerModal bind:open={pickerOpen} />
  {#if deleteIds}
    <DeleteDialog ids={deleteIds} ondone={() => (deleteIds = null)} />
  {/if}
  <RelinkDialog />
</main>

<style>
  .document-area {
    grid-area: main;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    container-type: inline-size; /* drives the row's column-drop rules (§5.3.7) */
  }

  .scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
