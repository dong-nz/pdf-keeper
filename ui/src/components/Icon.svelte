<script lang="ts">
  // Renders one path set from icons.ts at 16/20px, stroke 1.6, currentColor
  // (§5.3.7). Decorative by default: aria-hidden, no role. A path listed in
  // FILLED_PATHS (v0.0.7, UI-17) renders filled while the icon's other
  // paths stay stroke-only — the `auto` glyph's half disc.
  import { FILLED, FILLED_PATHS, ICONS, type IconName } from "./icons";

  let {
    name,
    size = 16,
    filled = false,
  }: {
    name: IconName;
    size?: 16 | 20;
    filled?: boolean;
  } = $props();

  const useFill = $derived(filled || FILLED.includes(name) && name === "star-fill");
  const filledPaths = $derived(FILLED_PATHS[name] ?? []);
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill={useFill ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as d, index (index)}
    <path {d} fill={filledPaths.includes(index) ? "currentColor" : undefined} />
  {/each}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
