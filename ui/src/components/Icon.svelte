<script lang="ts">
  // Renders one path set from icons.ts at 16/20px, stroke 1.6, currentColor
  // (§5.3.7). Decorative by default: aria-hidden, no role.
  import { ICONS, FILLED, type IconName } from "./icons";

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
  {#each ICONS[name] as d}
    <path {d} />
  {/each}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
