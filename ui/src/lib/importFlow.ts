// Import entry points shared by the toolbar button, the empty-state action
// and the Ctrl+I shortcut (UI-01): native dialogs only (DR-44), all import
// side effects live in the library store.
import { open } from "@tauri-apps/plugin-dialog";
import { library } from "$lib/state/library.svelte";

const PDF_FILTERS = [{ name: "PDF", extensions: ["pdf"] }];

export async function pickFilesAndImport(): Promise<void> {
  const selected = await open({ multiple: true, filters: PDF_FILTERS });
  if (selected === null) return;
  await library.importPaths(Array.isArray(selected) ? selected : [selected]);
}

export async function pickFolderAndImport(): Promise<void> {
  const dir = await open({ directory: true });
  if (typeof dir !== "string") return;
  await library.importFolder(dir);
}
