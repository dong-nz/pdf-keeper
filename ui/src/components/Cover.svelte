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
  const src = $derived(convertFileSrc(coverPath));
</script>

<span class="cover" style="width: {width}px; height: {height}px">
  {#if !failed}
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
