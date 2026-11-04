// DTOs mirroring the Rust serde types one-to-one (spec §5.3.3; the
// categories/cover_path fields are the DR-51 extension). Field names match
// the Rust serde output exactly (snake_case — the Rust structs carry no
// `rename_all`); only command ARGUMENTS use camelCase, per Tauri's own
// conversion (see api.ts).

export interface DocumentDto {
  id: number;
  path: string;
  filename: string;
  title: string;
  author: string;
  notes: string;
  favorite: boolean;
  size: number;
  added_at: number;
  missing: boolean;
  title_source: string;
  categories: string[];
  cover_path: string;
}

export interface CategoryDto {
  id: number;
  name: string;
  count: number;
}

export interface CountsDto {
  total: number;
  favorites: number;
  missing: number;
}

export interface ImportResult {
  imported: number;
  skipped: string[];
}

export interface RescanResult {
  missing_found: number;
  restored: number;
}

export interface JobProgress {
  kind: string; // "import" | "rescan" | "cover"
  processed: number;
  total: number;
}

export interface SearchPage {
  rows: DocumentDto[];
  total: number;
}

export interface SettingsDto {
  view: string;
  sort: string;
  dir: string;
  /** Secondary sort key, `"none"` when unset (FR-13). */
  sort_secondary: string;
  /** Grid column override, `"auto"` or a manual count as a string (UI-08). */
  grid_columns: string;
  /** Color ramp override, `"system" | "light" | "dark"` (UI-17). */
  theme: string;
  last_filter: string;
}

export interface AboutDto {
  name: string;
  version: string;
}

export interface AppErrorPayload {
  kind: string;
  message: string;
  document_id: number | null;
}

export type SortKey = "title" | "date_added" | "size";
export type SortDir = "asc" | "desc";
/** Secondary key (FR-13): the primary keys plus "none" = unset. */
export type SortSecondary = "none" | SortKey;
export type ViewMode = "list" | "grid";
/** Grid column count override (UI-08): "auto" = width-computed. */
export type GridOverride = "auto" | number;
/** Color ramp (UI-17): "system" follows the OS, the other two override it. */
export type Theme = "system" | "light" | "dark";

/** Current query state (spec §5.3.4 rule 1). `category_ids` is the active
 *  category set (FR-02 as modified, DR-82): normalized ascending, deduplicated,
 *  and a document matches when it carries at least one of them. */
export interface FilterState {
  q: string;
  category_ids: number[];
  favorites_only: boolean;
  missing_only: boolean;
  sort: SortKey;
  dir: SortDir;
  sort_secondary: SortSecondary;
}

/** True when any filter is active (drives chips and empty-state variants). */
export function hasActiveFilter(f: FilterState): boolean {
  return f.q !== "" || f.category_ids.length > 0 || f.favorites_only || f.missing_only;
}

/** Discriminates a rejected `invoke()` value (R4.6 turns these into toasts). */
export function asAppError(e: unknown): AppErrorPayload {
  if (typeof e === "object" && e !== null && typeof (e as AppErrorPayload).kind === "string") {
    return e as AppErrorPayload;
  }
  return { kind: "internal", message: String(e), document_id: null };
}
