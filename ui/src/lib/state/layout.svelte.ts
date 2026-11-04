// Transient layout facts (DR-86): the document area's measured width and the
// column count Auto derives from it. Owned here so the View menu can show and
// step the effective count without reaching into the document area's DOM.
// Nothing is persisted — the measurements are measured, and the Select mode
// (UI-18) is a session choice the user re-makes at every launch.
import { gridLayout } from "$lib/virtual";

class Layout {
  /** Inner width of the document scroller, in CSS pixels (0 until measured). */
  areaWidth = $state(0);

  /** The column count Auto would use at the current width (UI-08). */
  autoColumns = $derived(gridLayout(this.areaWidth, null).columns);

  /** Select mode (UI-18): a click toggles selection instead of only focusing. */
  selectMode = $state(false);

  setAreaWidth(width: number): void {
    if (width !== this.areaWidth) this.areaWidth = width;
  }

  toggleSelectMode(): void {
    this.selectMode = !this.selectMode;
  }
}

export const layout = new Layout();
