// The only `invoke()` caller (R1.2/R1.3): one typed function per whitelisted
// command. `COMMANDS` is the client-side mirror of the Rust router; a Rust
// integration test asserts set equality with the router's command list
// (spec §5.3.3), so the two lists cannot drift.

import { invoke } from "@tauri-apps/api/core";
import type {
  AppErrorPayload,
  AboutDto,
  CategoryDto,
  DocumentDto,
  ImportResult,
  RescanResult,
  SearchPage,
  SettingsDto,
  SortDir,
  SortKey,
  SortSecondary,
} from "./lib/types";

export const COMMANDS = [
  "library_import_paths",
  "library_import_folder",
  "library_search",
  "library_ids",
  "library_get_document",
  "library_update_document",
  "library_set_document_categories",
  "library_set_favorite",
  "library_bulk_categories",
  "library_delete_document",
  "library_delete_document_and_file",
  "library_relink_document",
  "library_rescan",
  "categories_list",
  "categories_create",
  "categories_rename",
  "categories_delete",
  "app_get_settings",
  "app_set_setting",
  "app_open_document",
  "app_about",
] as const;

export type CommandName = (typeof COMMANDS)[number];

// The keys here are the Rust command parameter names after Tauri's
// camelCase conversion (`query`, `categoryIds`, ...). `ui-smoke.mjs` drives
// these commands through the real boundary.
export interface QueryArgs {
  query: string;
  categoryIds: number[];
  favoritesOnly: boolean;
  missingOnly: boolean;
  sort: SortKey;
  dir: SortDir;
  sortSecondary: SortSecondary;
}

export function libraryImportPaths(paths: string[], categoryIds: number[]): Promise<ImportResult> {
  return invoke("library_import_paths", { paths, categoryIds });
}

export function libraryImportFolder(dir: string, categoryIds: number[]): Promise<ImportResult> {
  return invoke("library_import_folder", { dir, categoryIds });
}

export function librarySearch(args: QueryArgs, offset: number, limit: number): Promise<SearchPage> {
  return invoke("library_search", { ...args, offset, limit });
}

export function libraryIds(args: QueryArgs): Promise<number[]> {
  return invoke("library_ids", { ...args });
}

export function libraryGetDocument(id: number): Promise<DocumentDto> {
  return invoke("library_get_document", { id });
}

export function libraryUpdateDocument(
  id: number,
  title: string,
  author: string,
  notes: string,
  favorite: boolean,
  categoryIds: number[],
): Promise<DocumentDto> {
  return invoke("library_update_document", { id, title, author, notes, favorite, categoryIds });
}

export function librarySetDocumentCategories(documentId: number, categoryIds: number[]): Promise<void> {
  return invoke("library_set_document_categories", { documentId, categoryIds });
}

export function librarySetFavorite(id: number, value: boolean): Promise<DocumentDto> {
  return invoke("library_set_favorite", { id, value });
}

export function libraryBulkCategories(documentIds: number[], add: number[], remove: number[]): Promise<void> {
  return invoke("library_bulk_categories", { documentIds, add, remove });
}

export function libraryDeleteDocument(ids: number[]): Promise<void> {
  return invoke("library_delete_document", { ids });
}

export function libraryDeleteDocumentAndFile(ids: number[]): Promise<void> {
  return invoke("library_delete_document_and_file", { ids });
}

export function libraryRelinkDocument(id: number, newPath: string): Promise<DocumentDto> {
  return invoke("library_relink_document", { id, newPath });
}

export function libraryRescan(): Promise<RescanResult> {
  return invoke("library_rescan", {});
}

export function categoriesList(): Promise<CategoryDto[]> {
  return invoke("categories_list", {});
}

export function categoriesCreate(name: string): Promise<CategoryDto> {
  return invoke("categories_create", { name });
}

export function categoriesRename(id: number, name: string): Promise<CategoryDto> {
  return invoke("categories_rename", { id, name });
}

export function categoriesDelete(id: number): Promise<void> {
  return invoke("categories_delete", { id });
}

export function appGetSettings(): Promise<SettingsDto> {
  return invoke("app_get_settings", {});
}

export function appSetSetting(key: string, value: string): Promise<void> {
  return invoke("app_set_setting", { key, value });
}

export function appOpenDocument(id: number): Promise<void> {
  return invoke("app_open_document", { id });
}

/** Application name + version as the packaged app reports them (UI-12). */
export function appAbout(): Promise<AboutDto> {
  return invoke("app_about", {});
}

export type { AppErrorPayload };
