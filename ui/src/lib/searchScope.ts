// The search field's placeholder text (UI-16): a pure derivation from the
// filter state and the library counts — no DOM, no store, so the six cases are
// unit-testable against fixture counts. Display-only: the result never enters
// the query, is never persisted, and is never the input's accessible name
// (`search.label` is fixed for that).
//
// The six cases UI-16 names are exhaustive. Combinations it does not name
// (e.g. Missing together with categories) resolve to the category case they
// are a superset of: the scope the user is searching in is the category set.
import { t, tp, type MsgParams } from "./i18n";
import type { FilterState } from "./types";

interface CategoryLike {
  id: number;
  name: string;
}

/** The active categories that still exist: a restored `last_filter` may name an
 *  id that was deleted since (the same validation App applies at startup). */
function activeCategories(filter: FilterState, categories: CategoryLike[]): string[] {
  return filter.category_ids
    .map((id) => categories.find((category) => category.id === id)?.name)
    .filter((name): name is string => name !== undefined);
}

export function searchPlaceholder(
  filter: FilterState,
  total: number,
  categories: CategoryLike[],
): string {
  const names = activeCategories(filter, categories);

  if (filter.favorites_only && names.length > 0) {
    return tp("search.placeholder.favoritesCategories", names.length);
  }
  if (filter.favorites_only) return t("search.placeholder.favorites");
  if (filter.missing_only && names.length === 0) return t("search.placeholder.missing");
  if (names.length === 1) return t("search.placeholder.category", { name: names[0] } satisfies MsgParams);
  if (names.length > 1) return tp("search.placeholder.categories", names.length);
  return tp("search.placeholder.all", total);
}
