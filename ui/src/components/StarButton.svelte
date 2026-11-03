<script lang="ts">
  // Kit wrapper (DR-45): Switch primitive styled as the star toggle.
  // role="switch" + aria-checked come from the kit (R4.4).
  import { Switch } from "bits-ui";
  import Icon from "./Icon.svelte";

  let {
    pressed,
    label,
    onchange,
  }: {
    pressed: boolean;
    label: string;
    onchange: (value: boolean) => void;
  } = $props();
</script>

<Switch.Root
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

