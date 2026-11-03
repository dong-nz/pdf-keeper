// R4.3: search input is debounced 150 ms — a burst of rapid calls produces
// exactly one trailing call with the LAST arguments. Fake timers make the
// timing contract deterministic (the UI smoke cannot control WebDriver
// character-dispatch speed, so it checks results, not query counts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst into one trailing call with the last arguments", () => {
    const fn = vi.fn();
    const push = debounce(fn, 150);
    push("f");
    push("fi");
    push("fixture doc");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("fixture doc");
  });

  it("each call restarts the window", () => {
    const fn = vi.fn();
    const push = debounce(fn, 150);
    push("a");
    vi.advanceTimersByTime(100);
    push("ab");
    vi.advanceTimersByTime(100);
    push("abc");
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("abc");
  });

  it("a gap longer than the delay starts a new burst", () => {
    const fn = vi.fn();
    const push = debounce(fn, 150);
    push("first");
    vi.advanceTimersByTime(150);
    push("second");
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("cancel() drops a pending call", () => {
    const fn = vi.fn();
    const push = debounce(fn, 150);
    push("x");
    push.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
