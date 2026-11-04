<script lang="ts">
  // App shell (UI-01 as modified by UI-07/UI-09): three rows (toolbar /
  // document area / status bar), the startup sequence (§5.3.4 rule 8), the
  // global shortcuts (§5.2 guard: never while typing, never while an overlay is
  // open) and drag&drop import.
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import Toolbar from "./components/Toolbar.svelte";
  import DocumentArea from "./components/DocumentArea.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import ToastStack from "./components/ToastStack.svelte";
  import { library } from "$lib/state/library.svelte";
  import { settings, decodeFilter } from "$lib/state/settings.svelte";
  import { feedback } from "$lib/state/feedback.svelte";
  import { pickFilesAndImport } from "$lib/importFlow";
  import { isTextTarget, searchFocus } from "$lib/focus";
  import { t } from "$lib/i18n";
  import type { SortDir, SortKey, SortSecondary } from "$lib/types";

  const VALID_SORTS: SortKey[] = ["title", "date_added", "size"];
  const VALID_DIRS: SortDir[] = ["asc", "desc"];
  const VALID_SECONDARIES: SortSecondary[] = ["none", "title", "date_added", "size"];

  /** Restored `last_filter` → filter state, after validating it against the
   *  real category list (§5.3.4 rule 8): an id that no longer exists is
   *  dropped, exactly as the shipped single-id case did. */
  function applyRestoredFilter(encoded: string): void {
    const restored = decodeFilter(encoded);
    if (restored.mode === "favorites") library.filter.favorites_only = true;
    if (restored.mode === "missing") library.filter.missing_only = true;
    const ids = restored.categoryIds.filter((id) => library.categories.some((c) => c.id === id));
    if (ids.length > 0) library.filter.category_ids = ids;
  }

  onMount(async () => {
    await library.initEvents();
    const restored = await settings.load();
    await library.loadCategories();
    if (restored) {
      if (VALID_SORTS.includes(restored.sort as SortKey)) library.filter.sort = restored.sort as SortKey;
      if (VALID_DIRS.includes(restored.dir as SortDir)) library.filter.dir = restored.dir as SortDir;
      // The secondary key belongs to the same preference (FR-13): storing it
      // without applying it would restore half an order.
      if (VALID_SECONDARIES.includes(restored.sort_secondary as SortSecondary)) {
        library.filter.sort_secondary = restored.sort_secondary as SortSecondary;
      }
      // after loadCategories: a restored category set (any `last_filter` form,
      // including the v0.0.1 `cat:<id>` one) is validated against the real
      // category list before it is applied.
      applyRestoredFilter(restored.last_filter);
    }
    await library.refresh();
  });

  function onGlobalKeydown(event: KeyboardEvent) {
    // The global key map lives behind one guard (§5.2, spec §5.3): no
    // binding fires while a text input or contenteditable owns focus —
    // typing Ctrl+F in the notes field must not steal focus. SearchBox
    // handles its own Ctrl+F/Esc internally; overlay Esc is consumed by
    // the overlay's kit handler before this window-level listener runs.
    if (isTextTarget(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchFocus.register();
      return;
    }
    if (mod && event.key.toLowerCase() === "i") {
      event.preventDefault();
      void pickFilesAndImport();
      return;
    }
    if (event.key === "Escape") {
      // Dialogs and menus consume Escape themselves. Two independent
      // signals defer to the overlay (§5.2): the kit marks the event
      // handled (defaultPrevented), and the overlay count still holds an
      // overlay — including one whose unmount already ran in this
      // dispatch, since the decrement is deferred (feedback.beginOverlay).
      // A dialog's close chain drains microtasks before this window-level
      // listener runs, so the count alone can read 0; defaultPrevented
      // covers that, and the count covers Escape while focus sits outside
      // the overlay. Only an unconsumed Escape clears the selection.
      if (event.defaultPrevented || feedback.overlayCount > 0) return;
      if (library.selection.size > 0) {
        event.preventDefault();
        library.clearSelection();
      }
      return;
    }
  }

  // Drag-and-drop per spec (importing-pdfs UI): Tauri's native drag events
  // carry real filesystem paths; non-.pdf drops pass through to the pipeline,
  // which reports them as skipped (FR-11) — never silently ignored here.
  let dragging = $state(false);
  let unlisten: UnlistenFn[] = [];

  const dropCategoryNames = $derived(
    library.filter.category_ids.length === 0
      ? null
      : library.filter.category_ids
          .map((id) => library.categories.find((category) => category.id === id)?.name)
          .filter((name): name is string => name !== undefined)
          .join(", "),
  );

  onMount(async () => {
    unlisten = (
      await Promise.all([
        listen("tauri://drag-enter", () => {
          dragging = true;
        }),
        listen("tauri://drag-leave", () => {
          dragging = false;
        }),
        listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
          dragging = false;
          if (event.payload.paths.length > 0) void library.importPaths(event.payload.paths);
        }),
      ])
    ).filter((un): un is UnlistenFn => un !== undefined);
  });

  onDestroy(() => {
    for (const un of unlisten) un();
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="app" data-dragging={dragging || undefined}>
  <Toolbar />
  <DocumentArea />
  <StatusBar />
  <ToastStack />
  {#if dragging}
    <div class="drop-overlay" role="presentation">
      <p class="drop-title">{t("drop.title")}</p>
      {#if dropCategoryNames}
        <p class="drop-sub">{t("drop.toCategory", { categories: dropCategoryNames })}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "toolbar"
      "main"
      "status";
    height: 100dvh;
    background: var(--surface-0);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-13);
  }

  .drop-overlay {
    position: fixed;
    inset: 8px;
    z-index: 70;
    display: grid;
    place-content: center;
    gap: 4px;
    border: 2px dashed var(--accent);
    background: var(--surface-0);
    pointer-events: none;
  }

  .drop-title {
    margin: 0;
    font-size: var(--text-16);
    font-weight: 600;
    color: var(--text-primary);
  }

  .drop-sub {
    margin: 0;
    font-size: var(--text-13);
    color: var(--text-secondary);
  }
</style>
