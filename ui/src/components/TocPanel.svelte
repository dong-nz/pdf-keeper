<script lang="ts">
  // The table-of-contents panel (FR-18 / UI-33 as revised by DR-218,
  // DR-223, DR-226, DR-232, DR-242 and DR-244, SPEC-v0.0.7 §3.5): the
  // released menu mechanism — a DropdownMenu anchored to the strip's
  // icon-only ToC control
  // (the UI-13 pattern with a tooltip) — rendering a collapsible tree. A
  // single toolbar row at the panel top (one menu item, `closeOnSelect`
  // false, and — per DR-242 — no activation of its own: only the control
  // button runs the action) carries the expand/collapse flip-flop toggle:
  // its icon and accessible name follow the store's
  // `tocExpandMode` (the control is icon-only per DR-244, the strip's own
  // icon grammar), its control carries the app's tooltip with the same
  // mode-following text (UI-37, DR-232), and each activation applies its
  // whole-tree action and flips the mode; per-entry toggles never touch it.
  // DR-232 re-cuts the scroll: the panel box itself never scrolls
  // (`.toc-panel` overflow hidden, base.css); the toolbar row is a fixed
  // header and the entry rows live in a `.toc-tree` region that carries the
  // scroll alone — the scrollbar never runs beside the toolbar. The items
  // stay `DropdownMenu.Item`s: the kit's roving focus works through the
  // menu's context, not DOM position. Every parent entry carries a chevron
  // that toggles its subtree without jumping the page, and ArrowRight /
  // ArrowLeft on a focused parent do the same. The panel opens collapsed to
  // the first level (the store initializes the hidden set on outline load).
  // Entries indent by outline depth
  // ((depth − 1) × 12 px, the released geometry) and carry right-aligned
  // target page numbers; activating an entry jumps through the store's
  // `goToPage` — the same path as the page field (UI-33) — and closes the
  // panel. `OverlayAnchor` registers the open overlay, so the window's `Esc`
  // closes the panel before it would close the window (the released
  // overlay-priority guard, §5.2).
  import { DropdownMenu } from "bits-ui";
  import Icon from "./Icon.svelte";
  import OverlayAnchor from "./OverlayAnchor.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { type ReaderStore } from "$lib/state/reader.svelte";
  import { t } from "$lib/i18n";

  let {
    store,
  }: {
    store: ReaderStore;
  } = $props();
</script>

<DropdownMenu.Root>
  <Tooltip text={t("reader.toc")}>
    {#snippet control({ props })}
      <DropdownMenu.Trigger
        {...props}
        class="control icon-button"
        data-tauri-drag-region="false"
        aria-label={t("reader.toc")}
      >
        <Icon name="list" />
      </DropdownMenu.Trigger>
    {/snippet}
  </Tooltip>
  <DropdownMenu.Content class="menu toc-panel">
    <OverlayAnchor />
    <!-- The toolbar (UI-33/DR-218, one row with one control per DR-223,
         rendered as chrome per DR-226): a menu item so keyboard navigation
         reaches it, `closeOnSelect={false}` so the tree updates under a
         still-open panel; the `.toc-toolbar` / `.control` styling (base.css)
         gives it the strip ground, the bottom hairline and a compact
         content-width button. The single expand/collapse toggle carries its
         own mode: its icon and label name the action it is about to
         perform, and each activation flips it. -->
    <DropdownMenu.Item
      class="menu-item toc-toolbar"
      closeOnSelect={false}
      data-tauri-drag-region="false"
      onkeydown={(event) => {
        // DR-242: keyboard parity — Enter/Space on the highlighted row runs
        // the same action the control's click runs; the kit's own selection
        // (which now does nothing) must not double-run.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          store.tocToggleAll();
        }
      }}
    >
      <!-- DR-232 (UI-37): the toolbar control carries the app's tooltip,
           its text the mode-following label — the same wrapper the strip's
           own controls use. DR-242: the control is the only activator — a
           real button whose click runs the whole-tree action (the chevron's
           stopPropagation pattern: the click must not reach the item); the
           rest of the row does nothing. -->
      <Tooltip text={t(store.tocExpandMode ? "reader.toc.expandAll" : "reader.toc.collapseAll")}>
        {#snippet control({ props })}
          <!-- DR-244: icon-only, the strip's own icon control (the same
               `control icon-button` grammar every strip control uses) — the
               mode-following text names the control through the tooltip and
               the aria-label, not a rendered label. -->
          <button
            type="button"
            class="control icon-button"
            data-tauri-drag-region="false"
            {...props}
            aria-label={t(store.tocExpandMode ? "reader.toc.expandAll" : "reader.toc.collapseAll")}
            onclick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              store.tocToggleAll();
            }}
          >
            <Icon name={store.tocExpandMode ? "expand-all" : "collapse-all"} />
          </button>
        {/snippet}
      </Tooltip>
    </DropdownMenu.Item>
    <!-- DR-232: the tree region — the entry rows and the scroll, nothing
         else. The panel box above it never scrolls. -->
    <div class="toc-tree">
      {#each store.tocVisible() as item (item.index)}
        {@const isParent = store.isTocParent(item.index)}
        {@const expanded = isParent && !store.tocCollapsed.has(item.index)}
        <DropdownMenu.Item
          class="menu-item toc-entry"
          data-tauri-drag-region="false"
          onSelect={() => store.goToPage(item.entry.page)}
          onkeydown={(event) => {
            // ArrowRight / ArrowLeft toggle a focused parent's subtree
            // (UI-33/DR-218); the kit's own handling of those keys (submenu
            // navigation) must not run for a tree row.
            if (isParent && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
              event.preventDefault();
              event.stopPropagation();
              store.toggleTocEntry(item.index);
            }
          }}
        >
          <span class="toc-indent" style="width: {(item.entry.depth - 1) * 12}px"></span>
          {#if isParent}
            <button
              type="button"
              class="toc-toggle"
              data-tauri-drag-region="false"
              aria-expanded={expanded}
              aria-label={t(expanded ? "reader.toc.collapseEntry" : "reader.toc.expandEntry")}
              onclick={(event) => {
                // The chevron toggles without jumping: the click must not
                // reach the item's activation handler.
                event.preventDefault();
                event.stopPropagation();
                store.toggleTocEntry(item.index);
              }}
            >
              <Icon name={expanded ? "chevron-down" : "chevron-right"} />
            </button>
          {/if}
          <span class="toc-title">{item.entry.title}</span>
          <span class="toc-page">{item.entry.page}</span>
        </DropdownMenu.Item>
      {/each}
    </div>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  /* DR-232 (UI-33 further MODIFIED): the tree region carries the scroll,
     the panel box never scrolls (`.toc-panel` overflow hidden, base.css).
     The region is the flex column's only shrinkable child: `min-height: 0`
     lets it shrink to the space the panel's released cap (DR-207) leaves
     after the fixed toolbar row, and the scrollbar then belongs to the tree
     area alone — it never runs beside the toolbar. Flex sizing bounds it,
     so no second magic height is introduced. */
  .toc-tree {
    min-height: 0;
    overflow-y: auto;
  }

  /* The tree indent (UI-33): the released (depth − 1) × 12 px, now a real
     indent cell so the chevron sits at the entry's own level. */
  .toc-indent {
    flex: none;
  }

  /* The parent chevron: a quiet inline control inside the row, the same
     icon-button language as the strip, without the button chrome. */
  .toc-toggle {
    flex: none;
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .toc-toggle:hover {
    color: var(--text-primary);
  }

  .toc-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The page number sits at the item's trailing end (UI-33: right-
     aligned). */
  .toc-page {
    margin-left: auto;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>
