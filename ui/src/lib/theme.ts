// Color-ramp application (UI-17, DR-101). The stored setting is a *choice*
// ("system" | "light" | "dark"); the document root carries a CONCRETE ramp, so
// `design-tokens.css` needs exactly two blocks — the light default and
// `[data-theme="dark"]` — instead of writing the dark palette twice (once for
// the OS case, once for an explicit choice against a light OS).
//
// `main.ts` calls `applyTheme("system")` synchronously before mount so the
// first paint still follows the OS with no stored value and no flash;
// `App.svelte` re-applies the stored choice once settings load.
import type { Theme } from "./types";

const darkOs = window.matchMedia("(prefers-color-scheme: dark)");

/** Resolve the choice to a ramp and write it on the document root. */
export function applyTheme(choice: Theme): void {
  const concrete = choice === "system" ? (darkOs.matches ? "dark" : "light") : choice;
  document.documentElement.dataset.theme = concrete;
}

/** Live OS following while the choice is "system": the behavior the plain
 *  `prefers-color-scheme` block gave for free. Returns the detach function. */
export function onSystemThemeChange(handler: () => void): () => void {
  darkOs.addEventListener("change", handler);
  return () => darkOs.removeEventListener("change", handler);
}
