// Settings store (spec §5.3.4 rule 7): view mode, sort and last filter are
// read once at startup via app_get_settings and written via app_set_setting,
// debounced 300 ms. localStorage is never used (DR-44); a failed settings
// write is silent (a lost preference is not a user-facing error).

import * as api from "../../api";
import { debounce } from "../debounce";
import type { FilterState, ViewMode } from "../types";

/** Values restored from the settings table at startup. */
export interface RestoredQuery {
  sort: string;
  dir: string;
  last_filter: string;
}

class SettingsStore {
  view = $state<ViewMode>("list");
  loaded = $state(false);

  #persist = debounce((key: string, value: string) => {
    api.appSetSetting(key, value).catch(() => {
      /* silent by spec: a lost preference is not an error */
    });
  }, 300);

  /** Startup read; undefined on failure (defaults stand). */
  async load(): Promise<RestoredQuery | undefined> {
    try {
      const settings = await api.appGetSettings();
      this.view = settings.view === "grid" ? "grid" : "list";
      this.loaded = true;
      return { sort: settings.sort, dir: settings.dir, last_filter: settings.last_filter };
    } catch {
      return undefined;
    }
  }

  setView(view: ViewMode): void {
    this.view = view;
    this.#persist("view", view);
  }

  /** Called from the library store on every query change — the single
   *  settings-write path for sort and sidebar selection. */
  rememberQuery(filter: FilterState): void {
    this.#persist("sort", filter.sort);
    this.#persist("dir", filter.dir);
    this.#persist("last_filter", encodeFilter(filter));
  }
}

function encodeFilter(filter: FilterState): string {
  if (filter.favorites_only) return "favorites";
  if (filter.missing_only) return "missing";
  if (filter.category_id !== null) return `cat:${filter.category_id}`;
  return "all";
}

export const settings = new SettingsStore();
