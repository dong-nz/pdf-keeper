// One action definition per target (spec §5.3.10): the SAME definitions back
// the row buttons, the context menus and the bulk bar (R4.7). `applies`
// filters per target (e.g. Relink only for missing files).

import type { TagDto, DocumentDto } from "./types";
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
  openRename: (doc: DocumentDto) => void;
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
      // UI-40 (AC-111): reveal the file in the system file manager. Applies
      // only when the file exists — a missing document has no folder to show.
      // Context menu and Details only; it does not join the row/card set.
      id: "open_folder",
      labelKey: "row.openFolder",
      icon: "folder",
      applies: (doc) => !doc.missing,
      run: (doc) => library.revealInFolder(doc.id),
    },
    {
      id: "details",
      labelKey: "row.details",
      icon: "info", // UI-03: the row/card action glyph; tag and bulk actions keep `tag`
      run: (doc) => host.openDetails(doc),
    },
    {
      // FR-21 (DR-267): Rename… — applies only when the file exists (a
      // missing file is relinked, not renamed). It does not join the
      // row/card compact set; the context menu shows it with the rest.
      id: "rename",
      labelKey: "row.rename",
      icon: "pencil",
      applies: (doc) => !doc.missing,
      run: (doc) => host.openRename(doc),
    },
    {
      id: "favorite",
      labelKey: "row.favorite",
      icon: "star",
      toggle: (doc) => (doc.favorite ? { labelKey: "row.unfavorite", icon: "star-fill" } : { labelKey: "row.favorite", icon: "star" }),
      run: (doc) => library.setFavorite(doc.id, !doc.favorite),
    },
    {
      // FR-19 (UI-43): Reading membership toggle — the same state-following
      // mechanism as the favorite; opening a document never marks it (the
      // flag is written only from this action and the Browse view).
      id: "reading",
      labelKey: "row.reading",
      icon: "bookmark",
      toggle: (doc) => (doc.reading ? { labelKey: "row.unreading", icon: "bookmark-fill" } : { labelKey: "row.reading", icon: "bookmark" }),
      run: (doc) => library.setReading([doc.id], !doc.reading),
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
 *  shows, for missing documents only. FR-19 (UI-43): `reading` joins the
 *  compact set beside the favorite — the same toggle mechanism, the same
 *  hover/focus-only rendering. */
export const ROW_ACTION_IDS = ["favorite", "reading", "details", "delete", "relink"] as const;

// ------------------------------------------------------------- tags

export interface TagUiHost {
  openRename: (tag: TagDto) => void;
  openDelete: (tag: TagDto) => void;
}

export function tagActions(host: TagUiHost): UiAction<TagDto>[] {
  return [
    {
      id: "rename",
      labelKey: "tagsDialog.rename",
      icon: "tag",
      run: (tag) => host.openRename(tag),
    },
    {
      id: "delete",
      labelKey: "tagsDialog.delete",
      icon: "trash",
      danger: true,
      run: (tag) => host.openDelete(tag),
    },
  ];
}

// ---------------------------------------------------------------- bulk

export interface BulkUiHost {
  setAllFavorites: (value: boolean) => void;
  /** UI-41 (AC-112): the state the one favorite control derives its action
   *  from — true only when the selection is non-empty and every selected
   *  document is already a favorite. */
  allSelectedFavorite: () => boolean;
  openTagPicker: () => void;
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
  // UI-41 (AC-112, M5): ONE favorite control replaces the two static items.
  // Its label, icon and action follow the selection — the same rule the
  // row/card favorite toggle follows: remove when everything selected is a
  // favorite, add otherwise.
  const allFavorite = host.allSelectedFavorite();
  return [
    {
      id: "favorite",
      labelKey: allFavorite ? "bulk.unfavorite" : "bulk.favorite",
      icon: allFavorite ? "star-fill" : "star",
      run: () => host.setAllFavorites(!allFavorite),
    },
    { id: "tags", labelKey: "bulk.tags", icon: "tag", run: () => host.openTagPicker() },
    { id: "delete", labelKey: "bulk.delete", icon: "trash", danger: true, run: () => host.openDelete() },
  ];
}
