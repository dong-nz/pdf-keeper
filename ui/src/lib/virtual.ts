// Pure windowing math (no DOM, no measurement — spec §5.3.5). Item sizes come
// from the design-system constants below, so every offset is computable from the
// data alone: the list's rows are as tall as the metadata they render (DR-85),
// the grid's blocks are uniform.

/** Window bounds in items, plus the padding that reproduces the full height. */
export interface WindowRange {
  start: number;
  end: number; // exclusive
  padTop: number;
  padBottom: number;
  totalHeight: number;
}

/** Mirrors the design tokens (--row-height, --row-line, --cell-height,
 *  --card-width, --card-gap): the math and the CSS MUST stay in lockstep. */
export const ROW_HEIGHT = 48;
export const ROW_LINE = 18;
export const CELL_HEIGHT = 401;
export const CARD_WIDTH = 220;
export const CARD_GAP = 12;
/** Smallest card a manual column count may produce (DR-83). */
export const MIN_CARD_WIDTH = 140;
/** The column range the View menu offers (UI-08). */
export const GRID_COLUMNS_MIN = 2;
export const GRID_COLUMNS_MAX = 10;

/** Prefix offsets for items of one fixed height: `offsets[i]` is the top of
 *  item `i`, `offsets[count]` the total height. */
export function uniformOffsets(count: number, height: number): number[] {
  const offsets = new Array<number>(count + 1);
  for (let i = 0; i <= count; i++) offsets[i] = i * height;
  return offsets;
}

/** A row's height is its base plus one line per non-empty metadata field
 *  (UI-06, DR-85) — the same rule `DocumentRow.svelte` renders with. */
export function rowHeight(doc: { author: string; notes: string }): number {
  const lines = (doc.author ? 1 : 0) + (doc.notes ? 1 : 0);
  return ROW_HEIGHT + lines * ROW_LINE;
}

/** Prefix offsets of the list's rows, in list order. */
export function rowOffsets(rows: { author: string; notes: string }[]): number[] {
  const offsets = new Array<number>(rows.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < rows.length; i++) offsets[i + 1] = offsets[i] + rowHeight(rows[i]);
  return offsets;
}

/** Last index whose top is at or above `position`. `offsets` must be non-empty. */
function indexAt(offsets: number[], position: number): number {
  let lo = 0;
  let hi = offsets.length - 2; // last valid item index
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The mounted window for a scroll position (§5.3.5): the items the viewport
 * touches, plus `overscan` on each side. `padTop`/`padBottom` always add up
 * with the window to `totalHeight`, so the scrollbar stays honest (NFR-01).
 */
export function window(
  scrollTop: number,
  viewportHeight: number,
  offsets: number[],
  overscan = 6,
): WindowRange {
  const count = offsets.length - 1;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0, totalHeight: 0 };
  const totalHeight = offsets[count];
  const first = Math.max(0, indexAt(offsets, scrollTop) - overscan);
  const last = Math.min(count - 1, indexAt(offsets, scrollTop + viewportHeight) + overscan);
  return {
    start: first,
    end: last + 1,
    padTop: offsets[first],
    padBottom: totalHeight - offsets[last + 1],
    totalHeight,
  };
}

/** Whether the scroll is within `near` items of the loaded end (slice loading, §5.3.4 rule 2). */
export function nearEnd(
  scrollTop: number,
  viewportHeight: number,
  offsets: number[],
  near = 20,
): boolean {
  const count = offsets.length - 1;
  if (count <= 0) return false;
  return scrollTop + viewportHeight >= offsets[Math.max(0, count - near)];
}

export interface GridLayout {
  columns: number;
  cardWidth: number;
}

/**
 * Grid geometry from container width (§5.3.5, DR-83).
 *
 * `override === null` is Auto: the shipped computation, at the shipped card
 * width. A manual count wins as far as the window allows — it never produces a
 * card narrower than `MIN_CARD_WIDTH` and never wider than the Auto card, so a
 * count below Auto changes only the trailing slack.
 */
export function gridLayout(
  containerWidth: number,
  override: number | null = null,
  cardWidth = CARD_WIDTH,
  gap = CARD_GAP,
): GridLayout {
  const autoColumns = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
  if (override === null) return { columns: autoColumns, cardWidth };

  const requested = Math.max(GRID_COLUMNS_MIN, Math.min(GRID_COLUMNS_MAX, override));
  const fitsAtFloor = Math.max(1, Math.floor((containerWidth + gap) / (MIN_CARD_WIDTH + gap)));
  const columns = Math.min(requested, fitsAtFloor);
  const derived = Math.floor((containerWidth - (columns - 1) * gap) / columns);
  return { columns, cardWidth: Math.min(cardWidth, Math.max(MIN_CARD_WIDTH, derived)) };
}
