// AC-09 (settings round-trip): a query change must store every setting it
// changes. One change touches four keys in the same tick, and `debounce` is
// trailing-edge by design (it keeps the arguments of the last call), so the
// store has to batch the pending keys rather than debounce one call per key —
// otherwise three of the four settings are silently dropped.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { FilterState } from "../types";

const { appSetSetting, appGetSettings } = vi.hoisted(() => ({
  appSetSetting: vi.fn(() => Promise.resolve()),
  appGetSettings: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../../api", () => ({ appSetSetting, appGetSettings }));

import { settings } from "./settings.svelte";

const filter: FilterState = {
  q: "doc",
  category_ids: [3, 1],
  favorites_only: false,
  missing_only: false,
  sort: "size",
  dir: "desc",
  sort_secondary: "title",
};

/** What the store actually asked the backend to store, as `key=value` facts. */
function written(): string[] {
  return appSetSetting.mock.calls.map(([key, value]) => `${key}=${value}`).sort();
}

describe("settings store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    appSetSetting.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("stores every key a query change modifies", () => {
    settings.rememberQuery(filter);
    expect(appSetSetting).not.toHaveBeenCalled(); // writes are debounced (R4.3)

    vi.advanceTimersByTime(300);
    expect(written()).toEqual(
      ["sort=size", "dir=desc", "sort_secondary=title", "last_filter=all&cats=3,1"].sort(),
    );
  });

  it("coalesces a burst into one write per key, holding the last value", () => {
    settings.rememberQuery({ ...filter, sort: "title", dir: "asc" });
    settings.rememberQuery({ ...filter, sort: "date_added", favorites_only: true });

    vi.advanceTimersByTime(300);
    const writes = written();
    const keys = writes.map((w) => w.split("=")[0]);
    expect(new Set(keys).size).toBe(keys.length); // no key written twice
    expect(writes).toEqual(
      [
        "sort=date_added",
        "dir=desc",
        "sort_secondary=title",
        "last_filter=favorites&cats=3,1",
      ].sort(),
    );
  });

  it("keeps a view change and a column override written together", () => {
    settings.setView("grid");
    settings.setGridColumns(4);

    vi.advanceTimersByTime(300);
    expect(written()).toEqual(["view=grid", "grid_columns=4"].sort());
  });
});
