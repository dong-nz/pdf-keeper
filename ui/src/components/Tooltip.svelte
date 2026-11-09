<script lang="ts">
  // Tooltip wrapper (§3.6): the kit's Tooltip primitive around a control the app
  // already renders. The control is passed as the kit's `child` snippet and
  // receives the merged trigger props, so ONE element carries both behaviors —
  // the menu stays a menu and still shows its tooltip. Hover and keyboard focus
  // produce the same tooltip (R4.4): the kit opens on focus as well as hover.
  // Every visual comes from tokens (R4.5); UI-37 (§3.11, DR-187) corrects the
  // released "chrome, not an overlay" ruling: a tooltip IS a small floating
  // overlay and carries the ramps' overlay recipe — the menus' and modals'
  // --surface-1 ground, hairline and --shadow-overlay shadow. The content node
  // is rendered by the kit, so the recipe lives in the design-system layer
  // (`base.css` ".tooltip" chrome), exactly like `.menu` and `.modal`.
  // DR-212/DR-213: `strategy="fixed"` — the content positions against the
  // viewport and never extends the scroll overflow of the surface it
  // annotates (the `.modal` skin carries no transform so nothing intercepts
  // the viewport as containing block).
  import { Tooltip as TooltipKit } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    text,
    control,
  }: {
    text: string;
    control: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();

  // The kit's merged trigger props carry `tabindex=0` — right for a control,
  // wrong for a wrapped text line (the row/card is the control; its text
  // lines must not become tab stops). Real controls stay focusable without
  // it, so the prop is dropped for every consumer.
  const withoutTabindex = (props: Record<string, unknown>) => {
    const { tabindex: _tabindex, ...rest } = props;
    return rest;
  };
</script>

<TooltipKit.Root>
  <TooltipKit.Trigger>
    {#snippet child({ props })}
      {@render control({ props: withoutTabindex(props) })}
    {/snippet}
  </TooltipKit.Trigger>
  <TooltipKit.Content class="tooltip" side="bottom" sideOffset={6} align="center" strategy="fixed">
    {text}
  </TooltipKit.Content>
</TooltipKit.Root>
