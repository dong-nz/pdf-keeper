// §5.2 invariant behind the global Esc handler: the kit closes its overlay
// synchronously inside the keydown dispatch, but App's window-level handler
// runs later in that same dispatch. If the decrement lands first, the Esc
// that CLOSED an overlay falls through to the "no overlay" branch and wipes
// the selection (observed in v0.0.1 verification: right-click menu + Esc
// silently dropped a 3-row selection). The deferred decrement is the fix;
// this test pins the invariant.

import { describe, expect, it } from "vitest";
import { feedback } from "$lib/state/feedback.svelte";

describe("feedback overlay stack", () => {
  it("keeps a closed overlay counted until the current task ends", () => {
    const end = feedback.beginOverlay();
    expect(feedback.overlayCount).toBe(1);

    end(); // the overlay component's cleanup, synchronous in the keydown handler
    expect(feedback.overlayCount).toBe(1); // App's window handler runs later in the same dispatch

    return Promise.resolve().then(() => {
      expect(feedback.overlayCount).toBe(0); // gone before the next task
    });
  });

  it("plain open/close without a race still balances the count", async () => {
    const first = feedback.beginOverlay();
    const second = feedback.beginOverlay();
    expect(feedback.overlayCount).toBe(2);
    first();
    second();
    await Promise.resolve();
    expect(feedback.overlayCount).toBe(0);
  });
});
