// One action definition per target (spec §5.3.10): the SAME definitions back
// the row buttons, the context menus and the bulk bar (R4.7). `applies`
// filters per target (e.g. Relink only for missing files).

import type { CategoryDto, DocumentDto } from "./types";
import type { MsgKey } from "./i18n";
import type { IconName } from "../components/icons";
import { library } from "$lib/state/library.svelte";

export interface UiAction<T> {
  id: string;
  labelKey: MsgKey;
  icon: IconName;
  /** Alternate label/icon when the target is in a toggled state. */
  toggle?: (target: T) => { labelKey: MsgKey; icon: IconName };
  applies?: (target: T) => boolean;
  run: (target: T) => void;
  danger?: boolean;
}

export function labelOf<T>(action: UiAction<T>, target: T): MsgKey {
  return action.toggle ? action.toggle(target).labelKey : action.labelKey;
}

export function iconOf<T>(action: UiAction<T>, target: T): IconName {
  return action.toggle ? action.toggle(target).icon : action.icon;
}

// ------------------------------------------------------------- documents

export interface DocumentUiHost {
  openDetails: (doc: DocumentDto) => void;
  openDelete: (ids: number[]) => void;
  openRelink: (id: number) => void;
}

export function documentActions(host: DocumentUiHost): UiAction<DocumentDto>[] {
  return [
    {
      id: "open",
      labelKey: "row.open",
      // UI-31 (FR-08 as modified): Open opens the built-in reader; the glyph
      // is the in-app reading symbol, not the external-link one.
      icon: "book-open",
      run: (doc) => library.open(doc.id),
    },
    {
      id: "open_external",
      labelKey: "row.openExternal",
      icon: "external-link", // UI-31: the existing OS-default path keeps this glyph
      run: (doc) => library.openExternal(doc.id),
    },
    {
      id: "details",
      labelKey: "row.details",
      icon: "info", // UI-03: the row/card action glyph; category and bulk actions keep `tag`
      run: (doc) => host.openDetails(doc),
    },
    {
      id: "favorite",
      labelKey: "row.favorite",
      icon: "star",
      toggle: (doc) => (doc.favorite ? { labelKey: "row.unfavorite", icon: "star-fill" } : { labelKey: "row.favorite", icon: "star" }),
      run: (doc) => library.setFavorite(doc.id, !doc.favorite),
    },
    {
      id: "relink",
      labelKey: "row.relink",
      icon: "relink",
      applies: (doc) => doc.missing,
      run: (doc) => host.openRelink(doc.id),
    },
    {
      id: "delete",
      labelKey: "row.delete",
      icon: "trash",
      danger: true,
      run: (doc) => host.openDelete([doc.id]),
    },
  ];
}

/** The compact set shown as row/card buttons (context menus show all).
 *  All three are hover/focus-only (UI-03, DR-99e): the star joined them when
 *  the row's own checkbox and permanent star were removed, so a favorited
 *  document carries no persistent marker in either view — the accepted
 *  consequence recorded in OQ-24. D8 (AC-37): `relink` joins the set — its
 *  `applies: doc.missing` filter and the rendering order follow
 *  `documentActions`, so the row shows the same sequence the context menu
 *  shows, for missing documents only. */
export const ROW_ACTION_IDS = ["favorite", "details", "delete", "relink"] as const;

// ------------------------------------------------------------- categories

export interface CategoryUiHost {
  openRename: (category: CategoryDto) => void;
  openDelete: (category: CategoryDto) => void;
}

export function categoryActions(host: CategoryUiHost): UiAction<CategoryDto>[] {
  return [
    {
      id: "rename",
      labelKey: "categoriesDialog.rename",
      icon: "tag",
      run: (category) => host.openRename(category),
    },
    {
      id: "delete",
      labelKey: "categoriesDialog.delete",
      icon: "trash",
      danger: true,
      run: (category) => host.openDelete(category),
    },
  ];
}

// ---------------------------------------------------------------- bulk

export interface BulkUiHost {
  setAllFavorites: (value: boolean) => void;
  openCategoryPicker: () => void;
  openDelete: () => void;
}

export interface BulkAction {
  id: string;
  labelKey: MsgKey;
  icon: IconName;
  run: () => void;
  danger?: boolean;
}

export function bulkActions(host: BulkUiHost): BulkAction[] {
  return [
    { id: "favorite", labelKey: "bulk.favorite", icon: "star", run: () => host.setAllFavorites(true) },
    { id: "unfavorite", labelKey: "bulk.unfavorite", icon: "star-fill", run: () => host.setAllFavorites(false) },
    { id: "categories", labelKey: "bulk.categories", icon: "tag", run: () => host.openCategoryPicker() },
    { id: "delete", labelKey: "bulk.delete", icon: "trash", danger: true, run: () => host.openDelete() },
  ];
}
