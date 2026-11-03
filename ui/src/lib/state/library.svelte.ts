// The library store (spec §5.3.4): current query, loaded slices, total,
// selection with shift anchor, categories list, counts (from events only).
// No optimistic writes: every mutation awaits its command, applies the
// returned DTO, and lets `status_updated` refresh counts.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as api from "../../api";
import type {
  AppErrorPayload,
  CategoryDto,
  CountsDto,
  DocumentDto,
  FilterState,
  ImportResult,
  JobProgress,
} from "../types";
import { asAppError } from "../types";
import { feedback } from "$lib/state/feedback.svelte";
import { settings } from "$lib/state/settings.svelte";

export const SLICE = 200;

class LibraryStore {
  filter = $state<FilterState>({
    q: "",
    category_id: null,
    favorites_only: false,
    missing_only: false,
    sort: "title",
    dir: "asc",
  });
  rows = $state<DocumentDto[]>([]);
  total = $state(0);
  counts = $state<CountsDto>({ total: 0, favorites: 0, missing: 0 });
  categories = $state<CategoryDto[]>([]);
  selection = $state<Set<number>>(new Set());
  loading = $state(false);

  /** Monotonic request stamp; stale responses are discarded (§5.3.4 rule 3). */
  #querySeq = 0;
  /** Shift-range anchor (owned here per §5.3.4: selection + anchor). */
  #shiftAnchor: number | null = null;
  #loadingMore = false;
  #unlisten: UnlistenFn[] = [];
  /** Set by DocumentArea so a query reset can scroll its scroller to top. */
  onQueryReset: (() => void) | null = null;

  async initEvents(): Promise<void> {
    this.#unlisten.push(
      await listen<CountsDto>("status_updated", (event) => {
        this.counts = event.payload;
      }),
      await listen("library_job_progress", (event) => {
        feedback.jobProgress(event.payload as JobProgress);
      }),
    );
  }

  destroyEvents(): void {
    for (const unlisten of this.#unlisten) unlisten();
    this.#unlisten = [];
  }

  #args(): api.QueryArgs {
    const f = this.filter;
    return {
      query: f.q,
      categoryId: f.category_id,
      favoritesOnly: f.favorites_only,
      missingOnly: f.missing_only,
      sort: f.sort,
      dir: f.dir,
    };
  }

  /** The single reset path shared by search box, sidebar, sort menu, chips
   *  (§5.3.4 rule 3): any filter change re-queries from offset 0. */
  setFilter(patch: Partial<FilterState>): void {
    Object.assign(this.filter, patch);
    settings.rememberQuery(this.filter);
    void this.#runQuery();
  }

  clearFilters(): void {
    this.setFilter({ q: "", category_id: null, favorites_only: false, missing_only: false });
  }

  /** Startup / retry: first slice. */
  async refresh(): Promise<void> {
    await this.#runQuery();
  }

  async #runQuery(): Promise<void> {
    const seq = ++this.#querySeq;
    this.loading = true;
    try {
      const page = await api.librarySearch(this.#args(), 0, SLICE);
      if (seq !== this.#querySeq) return; // stale — superseded request
      this.rows = page.rows; // atomic replacement (R4.3)
      this.total = page.total;
      this.#pruneSelectionToVisible();
      this.onQueryReset?.();
    } catch (error) {
      if (seq === this.#querySeq) feedback.reportError(asAppError(error));
    } finally {
      if (seq === this.#querySeq) this.loading = false;
    }
  }

  /** Append the next slice when the scroll nears the loaded end
   *  (§5.3.4 rule 2). */
  async loadMore(): Promise<void> {
    const seq = this.#querySeq;
    if (this.#loadingMore || this.rows.length >= this.total) return;
    this.#loadingMore = true;
    try {
      const page = await api.librarySearch(this.#args(), this.rows.length, SLICE);
      if (seq !== this.#querySeq) return;
      this.rows = [...this.rows, ...page.rows];
    } catch (error) {
      if (seq === this.#querySeq) feedback.reportError(asAppError(error));
    } finally {
      this.#loadingMore = false;
    }
  }

  // ------------------------------------------------------------- selection

  toggleSelection(id: number, shift: boolean): void {
    const next = new Set(this.selection);
    if (shift && this.#shiftAnchor !== null) {
      const from = this.#indexOf(this.#shiftAnchor);
      const to = this.#indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        for (const row of this.rows.slice(lo, hi + 1)) next.add(row.id);
        this.selection = next;
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.#shiftAnchor = id;
    this.selection = next;
  }

  selectAllLoaded(): void {
    this.selection = new Set(this.rows.map((row) => row.id));
  }

  /** "Select all N matching" via the ids-only query (§5.3.4 rule 5). */
  async selectAllMatching(): Promise<void> {
    try {
      const ids = await api.libraryIds(this.#args());
      this.selection = new Set(ids);
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  clearSelection(): void {
    this.selection = new Set();
    this.#shiftAnchor = null;
  }

  #pruneSelectionToVisible(): void {
    if (this.selection.size === 0) return;
    const visible = new Set(this.rows.map((row) => row.id));
    const next = new Set([...this.selection].filter((id) => visible.has(id)));
    if (next.size !== this.selection.size) this.selection = next;
  }

  #indexOf(id: number): number {
    return this.rows.findIndex((row) => row.id === id);
  }

  // ------------------------------------------------------------- documents

  async open(id: number): Promise<void> {
    try {
      await api.appOpenDocument(id);
    } catch (error) {
      const payload = asAppError(error);
      feedback.reportError(payload, {
        labelKey: "error.missingFileAction",
        run: () => relinkFlow(payload.document_id),
      });
    }
  }

  async setFavorite(id: number, value: boolean): Promise<void> {
    try {
      const doc = await api.librarySetFavorite(id, value);
      this.#applyRow(doc);
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  async updateDocument(
    id: number,
    title: string,
    author: string,
    notes: string,
    favorite: boolean,
    categoryIds: number[],
  ): Promise<boolean> {
    try {
      const doc = await api.libraryUpdateDocument(id, title, author, notes, favorite, categoryIds);
      this.#applyRow(doc);
      await this.loadCategories();
      return true;
    } catch (error) {
      feedback.reportError(asAppError(error));
      return false;
    }
  }

  /** Resolves `null` on success; otherwise the rejection payload. A
   *  `not_pdf` rejection is shown inline by the relink dialog, so it is
   *  deliberately not reported as a toast (status-feedback.md). */
  async relink(id: number, newPath: string): Promise<AppErrorPayload | null> {
    try {
      const doc = await api.libraryRelinkDocument(id, newPath);
      this.#applyRow(doc);
      feedback.notify("toast.relinked");
      return null;
    } catch (error) {
      const payload = asAppError(error);
      if (payload.kind !== "not_pdf") feedback.reportError(payload);
      return payload;
    }
  }

  async delete(ids: number[], deleteFiles: boolean): Promise<boolean> {
    try {
      if (deleteFiles) await api.libraryDeleteDocumentAndFile(ids);
      else await api.libraryDeleteDocument(ids);
      const gone = new Set(ids);
      this.rows = this.rows.filter((row) => !gone.has(row.id));
      this.total -= gone.size;
      this.clearSelection();
      feedback.notify(deleteFiles ? "toast.deletedFiles" : "toast.deleted", ids.length);
      return true;
    } catch (error) {
      const payload = asAppError(error);
      if (payload.kind === "io") {
        // File deletion failed: rows are intact (DR-50b) — offer a retry.
        feedback.reportError(payload, { labelKey: "toast.fileDeleteFailedAction", run: () => this.delete(ids, true) });
      } else {
        feedback.reportError(payload);
      }
      return false;
    }
  }

  async bulkCategories(add: number[], remove: number[]): Promise<void> {
    const ids = [...this.selection];
    try {
      await api.libraryBulkCategories(ids, add, remove);
      await this.refresh();
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  async rescan(): Promise<void> {
    try {
      const result = await api.libraryRescan();
      feedback.notify("toast.rescanFound", result.missing_found);
      if (result.restored > 0) feedback.notify("toast.rescanRestored", result.restored);
      await this.refresh();
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  #applyRow(doc: DocumentDto): void {
    const index = this.rows.findIndex((row) => row.id === doc.id);
    if (index >= 0) {
      const next = [...this.rows];
      next[index] = doc;
      this.rows = next;
    }
  }

  // ------------------------------------------------------------ categories

  async loadCategories(): Promise<void> {
    try {
      this.categories = await api.categoriesList();
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  async createCategory(name: string): Promise<CategoryDto | null> {
    try {
      const created = await api.categoriesCreate(name);
      this.categories = [...this.categories, created].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      feedback.notify("toast.categoryCreated");
      return created;
    } catch (error) {
      const payload = asAppError(error);
      if (payload.kind === "category_duplicate") return null; // inline field error
      feedback.reportError(payload);
      return null;
    }
  }

  async renameCategory(id: number, name: string): Promise<boolean> {
    try {
      const renamed = await api.categoriesRename(id, name);
      this.categories = this.categories
        .map((category) => (category.id === id ? renamed : category))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      await this.refresh(); // badges travel with rows
      return true;
    } catch (error) {
      const payload = asAppError(error);
      if (payload.kind === "category_duplicate") return false; // inline field error
      feedback.reportError(payload);
      return false;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    try {
      await api.categoriesDelete(id);
      this.categories = this.categories.filter((category) => category.id !== id);
      if (this.filter.category_id === id) this.setFilter({ category_id: null });
      else await this.refresh();
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  /** Import entry points; `categoryId` is the currently selected category
   *  (auto-assign, DR-13a). */
  async importPaths(paths: string[]): Promise<void> {
    try {
      const result = await api.libraryImportPaths(paths, this.filter.category_id);
      this.#announceImport(result);
      await Promise.all([this.refresh(), this.loadCategories()]);
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  async importFolder(dir: string): Promise<void> {
    try {
      const result = await api.libraryImportFolder(dir, this.filter.category_id);
      this.#announceImport(result);
      await Promise.all([this.refresh(), this.loadCategories()]);
    } catch (error) {
      feedback.reportError(asAppError(error));
    }
  }

  #announceImport(result: ImportResult): void {
    feedback.notify("toast.imported", result.imported);
    if (result.skipped.length > 0) feedback.notify("toast.importSkipped", result.skipped.length);
  }
}

/** Open-failure toast → relink dialog flow (status-feedback.md R4.6). */
function relinkFlow(documentId: number | null): void {
  if (documentId !== null) feedback.openRelink(documentId);
}

export const library = new LibraryStore();
