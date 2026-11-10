<script lang="ts">
  // Document area (UI-02): the only scroller, the only virtualization
  // owner and the owner of every document-level dialog. Windowing math is
  // pure (virtual.ts); list rows come from the row metrics, grid blocks from
  // the card width the container produces (§5.3.5 as modified by DR-99).
  import { window as windowRange, gridLayout, nearEnd, rowOffsets, uniformOffsets, cellHeight, CONTENT_GUTTER } from "$lib/virtual";
  import { library } from "$lib/state/library.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { layout } from "$lib/state/layout.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { hasActiveFilter } from "$lib/types";
  import { pickFilesAndImport, pickFolderAndImport } from "$lib/importFlow";
  import { documentActions, type DocumentUiHost, type BulkUiHost } from "$lib/actions";
  import { t } from "$lib/i18n";
  import type { DocumentDto } from "$lib/types";
  import DocumentList from "./DocumentList.svelte";
  import DocumentGrid from "./DocumentGrid.svelte";
  import BulkBar from "./BulkBar.svelte";
  import EmptyState from "./EmptyState.svelte";
  import SkeletonRows from "./SkeletonRows.svelte";
  import DetailsModal from "./DetailsModal.svelte";
  import TagPickerModal from "./TagPickerModal.svelte";
  import DeleteDialog from "./DeleteDialog.svelte";
  import RenameDocumentDialog from "./RenameDocumentDialog.svelte";
  import RelinkDialog from "./RelinkDialog.svelte";

  // Item sizes are the design-system constants exported by virtual.ts, so the
  // CSS and the windowing math cannot drift (§5.3.5). List rows are sized by
  // the metadata they render (DR-85); grid blocks are uniform.
  let scroller: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let viewportHeight = $state(0);

  let detailsTarget = $state<DocumentDto | null>(null);
  let deleteIds = $state<number[] | null>(null);
  let renameTarget = $state<DocumentDto | null>(null);
  let pickerOpen = $state(false);

  // Grid geometry (UI-08, DR-83): Auto is width-computed; a manual count from
  // the View menu wins as far as the window allows and shrinks the cards.
  const grid = $derived(
    gridLayout(layout.areaWidth, typeof settings.gridColumns === "number" ? settings.gridColumns : null),
  );
  const gridCell = $derived(cellHeight(grid.cardWidth));
  const listOffsets = $derived(rowOffsets(library.rows));
  const listWin = $derived(windowRange(scrollTop, viewportHeight, listOffsets));
  const gridBlocks = $derived(Math.ceil(library.rows.length / grid.columns));
  const blockOffsets = $derived(uniformOffsets(gridBlocks, gridCell));
  const gridWin = $derived(windowRange(scrollTop, viewportHeight, blockOffsets));

  const docHost: DocumentUiHost = {
    openDetails: (doc) => (detailsTarget = doc),
    openDelete: (ids) => (deleteIds = ids),
    openRelink: (id) => feedback.openRelink(id),
    openRename: (doc) => (renameTarget = doc),
  };
  const docActions = documentActions(docHost);

  // DR-267: after a completed rename, an open Details dialog follows the new
  // name — the target is re-derived from the updated row, and the editor's
  // re-initialization effect re-reads the form from it.
  function followRenamed(id: number): void {
    const fresh = library.rows.find((row) => row.id === id);
    if (fresh && detailsTarget && detailsTarget.id === id) detailsTarget = fresh;
  }

  const bulkHost: BulkUiHost = {
    setAllFavorites: (value) => {
      for (const id of library.selection) void library.setFavorite(id, value);
    },
    // UI-41 (AC-112): the selection is always a subset of the loaded rows
    // (#pruneSelectionToVisible), so the favorites are read from the rows.
    allSelectedFavorite: () =>
      library.selection.size > 0 &&
      [...library.selection].every((id) => library.rows.find((row) => row.id === id)?.favorite === true),
    openTagPicker: () => (pickerOpen = true),
    openDelete: () => (deleteIds = [...library.selection]),
  };

  const showSkeleton = $derived(library.loading && library.rows.length === 0);

  interface EmptyStateView {
    title: string;
    body: string;
    actionLabel?: string;
    onaction?: () => void;
    keys?: string;
    /** UI-29 as modified (AC-115, DR-272): the second import action button. */
    actionLabel2?: string;
    onaction2?: () => void;
    keys2?: string;
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
    if (f.reading_only) return { title: t("empty.reading.title"), body: t("empty.reading.body") };
    if (f.missing_only) return { title: t("empty.missing.title"), body: t("empty.missing.body") };
    if (f.tag_ids.length > 0) {
      return {
        title: t("empty.tag.title"),
        body: t("empty.tag.body"),
        actionLabel: t("empty.tag.action"),
        onaction: () => void pickFilesAndImport(),
      };
    }
    return {
      title: t("empty.library.title"),
      body: t("empty.library.body"),
      actionLabel: t("empty.library.action"),
      onaction: () => void pickFilesAndImport(),
      keys: t("empty.library.keys"),
      // UI-29 as modified (AC-115, DR-272): the folder path offered as an
      // action button beside the files path — the same two code paths the
      // menu and the shortcuts use.
      actionLabel2: t("empty.library.action.folder"),
      onaction2: () => void pickFolderAndImport(),
      keys2: t("empty.library.keys.folder"),
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
    // DR-158: read in the callback, write in one requestAnimationFrame per
    // frame — the same delivery-loop reasoning as the reader scroller.
    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        viewportHeight = el.clientHeight;
        // UI-19 (AC-39): every consumer of `areaWidth` (gridLayout, the row
        // width, the block offsets) receives the CONTENT width — `clientWidth`
        // includes padding, which is why the inset cannot be applied as scroller
        // padding while the raw width is still handed to the math. The visual
        // inset lives on the window containers (DocumentList/DocumentGrid).
        layout.setAreaWidth(el.clientWidth - 2 * CONTENT_GUTTER);
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });

  function onScroll() {
    if (!scroller) return;
    scrollTop = scroller.scrollTop;
    viewportHeight = scroller.clientHeight;
    if (nearEnd(scrollTop, viewportHeight, settings.view === "grid" ? blockOffsets : listOffsets)) {
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
        <DocumentGrid win={gridWin} actions={docActions} columns={grid.columns} cardWidth={grid.cardWidth} cellHeight={gridCell} />
      {:else}
        <DocumentList win={listWin} actions={docActions} />
      {/if}
    </div>
  {/if}

  {#if detailsTarget}
    <DetailsModal doc={detailsTarget} ondone={() => (detailsTarget = null)} onrenamed={followRenamed} />
  {/if}
  <TagPickerModal bind:open={pickerOpen} />
  {#if deleteIds}
    <DeleteDialog ids={deleteIds} ondone={() => (deleteIds = null)} />
  {/if}
  {#if renameTarget}
    <RenameDocumentDialog
      doc={renameTarget}
      ondone={(renamed) => {
        const id = renameTarget?.id ?? -1;
        renameTarget = null;
        if (renamed) followRenamed(id);
      }}
    />
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
    /* DR-152: same virtualization hazard as the reader scroller — the
       windowed mount swap must not let the browser adjust scrollTop. */
    overflow-anchor: none;
  }
</style>
