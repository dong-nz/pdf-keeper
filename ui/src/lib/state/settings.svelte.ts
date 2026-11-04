// Settings store (spec §5.3.4 rule 7): view mode, sort (primary + secondary),
// grid column override, color ramp (UI-17) and last filter are read once at
// startup via app_get_settings and written via app_set_setting, debounced 300 ms.
// localStorage is never used (DR-44); a failed settings write is silent (a lost
// preference is not a user-facing error).

import * as api from "../../api";
import { debounce } from "../debounce";
import type { FilterState, GridOverride, Theme, ViewMode } from "../types";

/** Values restored from the settings table at startup. */
export interface RestoredQuery {
  sort: string;
  dir: string;
  sort_secondary: string;
  last_filter: string;
}

/** Manual grid counts are clamped to the range the View menu offers (UI-08). */
const GRID_MIN = 2;
const GRID_MAX = 10;

function parseGridColumns(value: string): GridOverride {
  const count = Number(value);
  return Number.isInteger(count) && count >= GRID_MIN && count <= GRID_MAX ? count : "auto";
}

class SettingsStore {
  view = $state<ViewMode>("list");
  gridColumns = $state<GridOverride>("auto");
  theme = $state<Theme>("system");
  loaded = $state(false);

  // Settings writes are debounced (R4.3) as one batch: a 300 ms window collects
  // every key changed in it and writes each distinct key once with its last
  // value. A query change touches sort, dir, sort_secondary and last_filter in
  // the same tick, and `debounce` is trailing-edge — one debounced function per
  // key would keep only the last call and silently drop the other three.
  #pending = new Map<string, string>();
  #flush = debounce(() => {
    void this.#writeBatch();
  }, 300);

  async #writeBatch(): Promise<void> {
    const batch = [...this.#pending];
    this.#pending.clear();
    await Promise.all(
      batch.map(([key, value]) =>
        api.appSetSetting(key, value).catch(() => {
          /* silent by spec: a lost preference is not an error */
        }),
      ),
    );
  }

  /** True while a batch is still waiting — the window close has to wait for it
   *  (AC-28: a choice made and the window closed moments later is still the
   *  choice the next start reads). */
  hasPendingWrites(): boolean {
    return this.#pending.size > 0;
  }

  /** Writes everything pending now. */
  async flushNow(): Promise<void> {
    this.#flush.cancel();
    await this.#writeBatch();
  }

  #persist(key: string, value: string): void {
    this.#pending.set(key, value);
    this.#flush();
  }

  /** Startup read; undefined on failure (defaults stand). */
  async load(): Promise<RestoredQuery | undefined> {
    try {
      const settings = await api.appGetSettings();
      this.view = settings.view === "grid" ? "grid" : "list";
      this.gridColumns = parseGridColumns(settings.grid_columns);
      // The Rust side validates this key; anything unexpected is the released
      // behavior — follow the OS (UI-17).
      this.theme =
        settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system";
      this.loaded = true;
      return {
        sort: settings.sort,
        dir: settings.dir,
        sort_secondary: settings.sort_secondary,
        last_filter: settings.last_filter,
      };
    } catch {
      return undefined;
    }
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.#persist("view", view);
  }

  /** View menu Columns control (UI-08): "auto" or a clamped manual count. */
  setGridColumns(value: GridOverride): void {
    const count = value === "auto" ? "auto" : Math.min(GRID_MAX, Math.max(GRID_MIN, value));
    this.gridColumns = count;
    this.#persist("grid_columns", String(count));
  }

  /** Settings menu / Settings dialog theme control (UI-17). The ramp itself is
   *  applied by `App.svelte` from this value; the store only holds the choice. */
  setTheme(value: Theme): void {
    this.theme = value;
    this.#persist("theme", value);
  }

  /** Called from the library store on every query change — the single
   *  settings-write path for sort and navigation selection. */
  rememberQuery(filter: FilterState): void {
    this.#persist("sort", filter.sort);
    this.#persist("dir", filter.dir);
    this.#persist("sort_secondary", filter.sort_secondary);
    this.#persist("last_filter", encodeFilter(filter));
  }
}

function encodeFilter(filter: FilterState): string {
  const mode = filter.favorites_only ? "favorites" : filter.missing_only ? "missing" : "all";
  // Grammar (spec §3.2): the mode and the category set are encoded separately,
  // because both may be active at once (FR-02 as modified, DR-82).
  return filter.category_ids.length > 0 ? `${mode}&cats=${filter.category_ids.join(",")}` : mode;
}

/** Decoded `last_filter`. A v0.0.1 value (`cat:<id>`) decodes as that one
 *  category with no mode, so an existing saved filter survives the upgrade. */
export interface RestoredFilter {
  mode: "all" | "favorites" | "missing";
  categoryIds: number[];
}

export function decodeFilter(encoded: string): RestoredFilter {
  const [head, cats] = encoded.split("&cats=");
  const mode = head === "favorites" || head === "missing" ? head : "all";
  const raw = cats !== undefined ? cats : head.startsWith("cat:") ? head.slice(4) : "";
  const ids = raw
    .split(",")
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id) && id > 0);
  return { mode, categoryIds: [...new Set(ids)].sort((a, b) => a - b) };
}

export const settings = new SettingsStore();
