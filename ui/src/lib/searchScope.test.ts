// AC-25 (UI-16): the placeholder derivation over the six named scopes, with
// fixture counts. The strings asserted are the catalog's own text — the test
// reads them through the same `t`/`tp` path the component uses, so it checks
// the scope selection (which key, which count, which name), not the wording.

import { describe, expect, it } from "vitest";

import { searchPlaceholder } from "./searchScope";
import { t, tp } from "./i18n";
import type { FilterState } from "./types";

const CATEGORIES = [
  { id: 1, name: "Invoices" },
  { id: 2, name: "Contracts" },
  { id: 3, name: "Standards" },
];

function filter(overrides: Partial<FilterState> = {}): FilterState {
  return {
    q: "",
    category_ids: [],
    favorites_only: false,
    missing_only: false,
    sort: "title",
    dir: "asc",
    sort_secondary: "none",
    ...overrides,
  };
}

describe("search placeholder (UI-16)", () => {
  it("names the whole library when no filter is active", () => {
    expect(searchPlaceholder(filter(), 42, CATEGORIES)).toBe(tp("search.placeholder.all", 42));
    expect(searchPlaceholder(filter(), 42, CATEGORIES)).toBe("Search in 42 documents");
    expect(searchPlaceholder(filter(), 1, CATEGORIES)).toBe("Search in 1 document");
    expect(searchPlaceholder(filter(), 0, CATEGORIES)).toBe("Search in 0 documents");
  });

  it("names the one active category", () => {
    expect(searchPlaceholder(filter({ category_ids: [2] }), 42, CATEGORIES)).toBe(
      t("search.placeholder.category", { name: "Contracts" }),
    );
    expect(searchPlaceholder(filter({ category_ids: [2] }), 42, CATEGORIES)).toBe("Search in Contracts");
  });

  it("counts several active categories", () => {
    expect(searchPlaceholder(filter({ category_ids: [1, 3] }), 42, CATEGORIES)).toBe(
      tp("search.placeholder.categories", 2),
    );
    expect(searchPlaceholder(filter({ category_ids: [1, 3] }), 42, CATEGORIES)).toBe("Search in 2 categories");
  });

  it("names Favorites, and the combination with categories", () => {
    expect(searchPlaceholder(filter({ favorites_only: true }), 42, CATEGORIES)).toBe("Search in Favorites");
    expect(searchPlaceholder(filter({ favorites_only: true, category_ids: [1, 2] }), 42, CATEGORIES)).toBe(
      "Search in Favorites · 2 categories",
    );
    // One category with Favorites is still the combination — the count is what
    // changes, not the case (the plural rule picks the singular wording).
    expect(searchPlaceholder(filter({ favorites_only: true, category_ids: [1] }), 42, CATEGORIES)).toBe(
      "Search in Favorites · 1 category",
    );
  });

  it("names Missing", () => {
    expect(searchPlaceholder(filter({ missing_only: true }), 42, CATEGORIES)).toBe("Search in Missing");
    // Missing together with categories (a combination UI-16 does not name) is
    // the category scope it is a superset of.
    expect(searchPlaceholder(filter({ missing_only: true, category_ids: [1, 2] }), 42, CATEGORIES)).toBe(
      "Search in 2 categories",
    );
  });

  it("ignores a category id that no longer exists", () => {
    // A restored `last_filter` may name a deleted category; the placeholder
    // must not claim a scope the app cannot search.
    expect(searchPlaceholder(filter({ category_ids: [99] }), 42, CATEGORIES)).toBe("Search in 42 documents");
    expect(searchPlaceholder(filter({ category_ids: [2, 99] }), 42, CATEGORIES)).toBe("Search in Contracts");
  });

  it("the query text never changes the scope", () => {
    // Typing hides the placeholder natively; the derivation is independent of
    // `q`, so the two can never disagree.
    expect(searchPlaceholder(filter({ q: "invoice", favorites_only: true }), 42, CATEGORIES)).toBe(
      "Search in Favorites",
    );
  });
});
