<script lang="ts">
  // Kit wrapper (DR-45): Switch primitive styled as the star toggle.
  // role="switch" + aria-checked come from the kit (R4.4).
  // D4 (AC-33): the merged Tooltip trigger props (the kit's `control` snippet
  // contract, same as the toolbar) are applied to Switch.Root — one element
  // carries both the switch behavior and the tooltip trigger.
  import { Switch } from "bits-ui";
  import Icon from "./Icon.svelte";

  let {
    pressed,
    label,
    onchange,
    ...rest
  }: {
    pressed: boolean;
    label: string;
    onchange: (value: boolean) => void;
  } & Record<string, unknown> = $props();
</script>

<Switch.Root
  {...rest}
  class="star"
  checked={pressed}
  aria-label={label}
  onclick={(event) => event.stopPropagation()}
  onCheckedChange={(value) => onchange(value)}
>
  <Switch.Thumb class="star-thumb">
    <Icon name={pressed ? "star-fill" : "star"} />
  </Switch.Thumb>
</Switch.Root>

