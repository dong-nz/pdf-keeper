<script lang="ts">
  // Cover (UI-06): the cached PNG via the asset protocol (DR-51); a missing
  // or unreadable file falls back to the generic glyph (R5.3) — never a
  // broken-image state.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";

  let {
    coverPath,
    width,
    height,
    alt,
  }: {
    coverPath: string;
    width: number;
    height: number;
    alt: string;
  } = $props();

  let failed = $state(false);
  const src = $derived(coverPath ? convertFileSrc(coverPath) : null);
  // DR-235 (AC-100): a changed cover path is a fresh attempt — the fallback
  // belongs to the old file, not to the document. Rows are keyed by document
  // id, so a cover that finishes while the view is open must replace the
  // glyph in the mounted row; an empty path renders the glyph directly.
  let lastPath: string | null = null;
  $effect(() => {
    if (coverPath !== lastPath) {
      lastPath = coverPath;
      failed = false;
    }
  });
</script>

<span class="cover" style="width: {width}px; height: {height}px">
  {#if src && !failed}
    <img {src} {alt} loading="lazy" decoding="async" onerror={() => (failed = true)} />
  {:else}
    <span class="glyph"><Icon name="pdf-glyph" size={20} /></span>
  {/if}
</span>

<style>
  .cover {
    display: inline-block;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: 3px;
    background: var(--surface-2);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .glyph {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--text-tertiary);
  }
</style>
