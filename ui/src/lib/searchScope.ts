// The search field's placeholder text (UI-16): a pure derivation from the
// filter state and the library counts — no DOM, no store, so the six cases are
// unit-testable against fixture counts. Display-only: the result never enters
// the query, is never persisted, and is never the input's accessible name
// (`search.label` is fixed for that).
//
// The six cases UI-16 names are exhaustive. Combinations it does not name
// (e.g. Missing together with tags) resolve to the tag case they
// are a superset of: the scope the user is searching in is the tag set.
import { t, tp, type MsgParams } from "./i18n";
import type { FilterState } from "./types";

interface TagLike {
  id: number;
  name: string;
}

/** The active tags that still exist: a restored `last_filter` may name an
 *  id that was deleted since (the same validation App applies at startup). */
function activeTags(filter: FilterState, tags: TagLike[]): string[] {
  return filter.tag_ids
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => name !== undefined);
}

export function searchPlaceholder(
  filter: FilterState,
  total: number,
  tags: TagLike[],
): string {
  const names = activeTags(filter, tags);

  if (filter.favorites_only && names.length > 0) {
    return tp("search.placeholder.favoritesTags", names.length);
  }
  if (filter.favorites_only) return t("search.placeholder.favorites");
  if (filter.reading_only && names.length > 0) {
    return tp("search.placeholder.readingTags", names.length);
  }
  if (filter.reading_only) return t("search.placeholder.reading");
  if (filter.missing_only && names.length === 0) return t("search.placeholder.missing");
  if (names.length === 1) return t("search.placeholder.tag", { name: names[0] } satisfies MsgParams);
  if (names.length > 1) return tp("search.placeholder.tags", names.length);
  return tp("search.placeholder.all", total);
}
