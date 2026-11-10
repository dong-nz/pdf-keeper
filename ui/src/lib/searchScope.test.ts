// AC-25 (UI-16): the placeholder derivation over the six named scopes, with
// fixture counts. The strings asserted are the catalog's own text — the test
// reads them through the same `t`/`tp` path the component uses, so it checks
// the scope selection (which key, which count, which name), not the wording.

import { describe, expect, it } from "vitest";

import { searchPlaceholder } from "./searchScope";
import { t, tp } from "./i18n";
import type { FilterState } from "./types";

const TAGS = [
  { id: 1, name: "Invoices" },
  { id: 2, name: "Contracts" },
  { id: 3, name: "Standards" },
];

function filter(overrides: Partial<FilterState> = {}): FilterState {
  return {
    q: "",
    tag_ids: [],
    favorites_only: false,
    missing_only: false,
    reading_only: false,
    sort: "title",
    dir: "asc",
    sort_secondary: "none",
    ...overrides,
  };
}

describe("search placeholder (UI-16)", () => {
  it("names the whole library when no filter is active", () => {
    expect(searchPlaceholder(filter(), 42, TAGS)).toBe(tp("search.placeholder.all", 42));
    expect(searchPlaceholder(filter(), 42, TAGS)).toBe("Search in 42 documents");
    expect(searchPlaceholder(filter(), 1, TAGS)).toBe("Search in 1 document");
    expect(searchPlaceholder(filter(), 0, TAGS)).toBe("Search in 0 documents");
  });

  it("names the one active tag", () => {
    expect(searchPlaceholder(filter({ tag_ids: [2] }), 42, TAGS)).toBe(
      t("search.placeholder.tag", { name: "Contracts" }),
    );
    expect(searchPlaceholder(filter({ tag_ids: [2] }), 42, TAGS)).toBe("Search in Contracts");
  });

  it("counts several active tags", () => {
    expect(searchPlaceholder(filter({ tag_ids: [1, 3] }), 42, TAGS)).toBe(
      tp("search.placeholder.tags", 2),
    );
    expect(searchPlaceholder(filter({ tag_ids: [1, 3] }), 42, TAGS)).toBe("Search in 2 tags");
  });

  it("names Favorites, and the combination with tags", () => {
    expect(searchPlaceholder(filter({ favorites_only: true }), 42, TAGS)).toBe("Search in Favorites");
    expect(searchPlaceholder(filter({ favorites_only: true, tag_ids: [1, 2] }), 42, TAGS)).toBe(
      "Search in Favorites · 2 tags",
    );
    // One tag with Favorites is still the combination — the count is what
    // changes, not the case (the plural rule picks the singular wording).
    expect(searchPlaceholder(filter({ favorites_only: true, tag_ids: [1] }), 42, TAGS)).toBe(
      "Search in Favorites · 1 tag",
    );
  });

  it("names Missing", () => {
    expect(searchPlaceholder(filter({ missing_only: true }), 42, TAGS)).toBe("Search in Missing");
    // Missing together with tags (a combination UI-16 does not name) is
    // the tag scope it is a superset of.
    expect(searchPlaceholder(filter({ missing_only: true, tag_ids: [1, 2] }), 42, TAGS)).toBe(
      "Search in 2 tags",
    );
  });

  // FR-19 (AC-102): the Reading view composes with search like the other
  // modes — the same combination structure the Favorites case has.
  it("names Reading, and the combination with tags", () => {
    expect(searchPlaceholder(filter({ reading_only: true }), 42, TAGS)).toBe("Search in Reading");
    expect(searchPlaceholder(filter({ reading_only: true, tag_ids: [1] }), 42, TAGS)).toBe(
      "Search in Reading · 1 tag",
    );
    expect(searchPlaceholder(filter({ reading_only: true, tag_ids: [1, 2] }), 42, TAGS)).toBe(
      "Search in Reading · 2 tags",
    );
  });

  it("ignores a tag id that no longer exists", () => {
    // A restored `last_filter` may name a deleted tag; the placeholder
    // must not claim a scope the app cannot search.
    expect(searchPlaceholder(filter({ tag_ids: [99] }), 42, TAGS)).toBe("Search in 42 documents");
    expect(searchPlaceholder(filter({ tag_ids: [2, 99] }), 42, TAGS)).toBe("Search in Contracts");
  });

  it("the query text never changes the scope", () => {
    // Typing hides the placeholder natively; the derivation is independent of
    // `q`, so the two can never disagree.
    expect(searchPlaceholder(filter({ q: "invoice", favorites_only: true }), 42, TAGS)).toBe(
      "Search in Favorites",
    );
  });
});
