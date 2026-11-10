// AC-112 (UI-41) unit half: the bulk bar's ONE favorite control derives its
// label, icon and action from the selection state — remove only when every
// selected document is already a favorite, add otherwise (the row/card
// toggle's rule, applied to the selection).

import { describe, expect, it, vi } from "vitest";

// The bulk derivation touches no store state; the library module is mocked so
// the test exercises `bulkActions` as a pure function of its host.
vi.mock("./state/library.svelte", () => ({ library: {} }));

import { bulkActions, type BulkUiHost } from "./actions";

function host(allSelectedFavorite: boolean): { host: BulkUiHost; favoriteCalls: boolean[] } {
  const favoriteCalls: boolean[] = [];
  return {
    favoriteCalls,
    host: {
      setAllFavorites: (value) => favoriteCalls.push(value),
      allSelectedFavorite: () => allSelectedFavorite,
      openTagPicker: () => {},
      openDelete: () => {},
    },
  };
}

const favoriteEntry = (h: BulkUiHost) => {
  const entries = h && bulkActions(h).filter((a) => a.id === "favorite" || a.id === "unfavorite");
  expect(entries).toHaveLength(1); // exactly one favorite control, whatever the state
  return entries[0];
};

describe("bulk favorite toggle (UI-41, AC-112)", () => {
  it("adds favorites for a non-favorite selection — outline star, Add label", () => {
    const { host: h, favoriteCalls } = host(false);
    const action = favoriteEntry(h);
    expect(action.labelKey).toBe("bulk.favorite");
    expect(action.icon).toBe("star");
    action.run();
    expect(favoriteCalls).toEqual([true]);
  });

  it("removes favorites for an all-favorite selection — filled star, Remove label", () => {
    const { host: h, favoriteCalls } = host(true);
    const action = favoriteEntry(h);
    expect(action.labelKey).toBe("bulk.unfavorite");
    expect(action.icon).toBe("star-fill");
    action.run();
    expect(favoriteCalls).toEqual([false]);
  });

  it("the control is re-derived per call, not frozen at first render", () => {
    const { host: h } = host(false);
    expect(favoriteEntry(h).labelKey).toBe("bulk.favorite");
    // The same host now reports an all-favorite selection (the add landed):
    // the next derivation must follow it.
    (h as BulkUiHost).allSelectedFavorite = () => true;
    expect(favoriteEntry(h).labelKey).toBe("bulk.unfavorite");
  });
});
