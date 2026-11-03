<script lang="ts">
  // Overlay lifecycle anchor (DR-45 wrappers): the kit unmounts Content when
  // the overlay closes, so mount/unmount IS the open/close signal — no
  // dependence on the kit's `open` binding semantics.
  // Found in v0.0.1 verification: the previous registration (an `$effect`
  // calling `feedback.beginOverlay()` while an `open` signal was true) read
  // and wrote the `$state` counter inside its own effect body — a reactive
  // loop (thousands of begin/end cycles per open overlay) whose oscillating
  // count let the window-level Esc handler see 0 while a menu was open,
  // wiping the selection (§5.2). This component reads no state, so its
  // effect runs exactly once per mount and cleans up exactly once per
  // unmount; the counter itself is plain (see feedback.svelte.ts).
  import { feedback } from "$lib/state/feedback.svelte";

  $effect(() => {
    const end = feedback.beginOverlay();
    return end;
  });
</script>
