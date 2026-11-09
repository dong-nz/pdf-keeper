// Pure windowing math (no DOM, no measurement — spec §5.3.5). Item sizes come
// from the design-system constants and from the derived grid geometry below, so
// every offset is computable from the data alone: the list's rows are as tall
// as the metadata they render (DR-85), the grid's blocks are uniform within one
// resize (the numbers change only when the container width changes, §3.10).

/** Window bounds in items, plus the padding that reproduces the full height. */
export interface WindowRange {
  start: number;
  end: number; // exclusive
  padTop: number;
  padBottom: number;
  totalHeight: number;
}

/** Mirrors the design tokens (--row-height, --row-line, --card-gap): the math
 *  and the CSS MUST stay in lockstep. Card geometry is derived per resize
 *  (§5.3.5 as modified by DR-99), so no card metric is a constant here. */
export const ROW_HEIGHT = 88;
export const ROW_LINE = 18;
/** The cover's inset against the row box's edges and the separator hairlines
 *  (UI-03 as modified, §3.12, DR-189 option B), mirroring the
 *  `--row-cover-gap` token in the same lockstep the other metrics follow. */
export const ROW_COVER_GAP = 8;
/** The inset every document view keeps from the window edge (UI-19), mirroring
 *  the `--content-gutter` token: the same lockstep rule `ROW_HEIGHT`/`CARD_GAP`
 *  follow and the single source for CSS and the width math. */
export const CONTENT_GUTTER = 12;
/** The pitch Auto derives its column count from (UI-08). Not a rendered width. */
export const CARD_WIDTH = 220;
export const CARD_GAP = 12;
/** The card's content inset against its own edges (UI-03 as modified, §3.8,
 *  DR-245 option A), mirroring the `--card-content-pad` token in the same
 *  lockstep `ROW_COVER_GAP`/`CONTENT_GUTTER` follow. */
export const CARD_CONTENT_PAD = 5;
/** Smallest card a manual column count may produce (DR-83). */
export const MIN_CARD_WIDTH = 140;
/** Largest card a container may produce (DR-99): a cover never becomes a poster. */
export const MAX_CARD_WIDTH = 320;
/** The column range the View menu offers (UI-08). */
export const GRID_COLUMNS_MIN = 2;
export const GRID_COLUMNS_MAX = 10;

/** One step of the View menu's − / + control (UI-08): the clamped next count.
 *  Shared with the Settings dialog so the two entry points cannot drift. */
export function stepColumns(current: number, delta: number): number {
  return Math.min(GRID_COLUMNS_MAX, Math.max(GRID_COLUMNS_MIN, current + delta));
}

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

/** The list cover is the row minus the cover gaps, at the A4 ratio
 *  (UI-03 as modified by §3.12/DR-189): 51×72 at the 88 px base. Derived
 *  from `ROW_HEIGHT` and `ROW_COVER_GAP` so the numbers can never disagree. */
export const ROW_COVER_HEIGHT = ROW_HEIGHT - 2 * ROW_COVER_GAP;
export const ROW_COVER_WIDTH = Math.round((ROW_COVER_HEIGHT * 210) / 297);

/** Prefix offsets of the list's rows, in list order. */
export function rowOffsets(rows: { author: string; notes: string }[]): number[] {
  const offsets = new Array<number>(rows.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < rows.length; i++) offsets[i + 1] = offsets[i] + rowHeight(rows[i]);
  return offsets;
}

/**
 * Prefix offsets of a vertical stack of variable-height items separated by a
 * fixed gap (the reader's page stack, SPEC-v0.0.6 UI-30): heights come from
 * the document's own geometry, never from the DOM — the same no-measurement
 * rule `rowOffsets` follows. The gap sits between items only, matching what
 * a CSS flex column with `gap` lays out. `offsets[i]` is the top of item
 * `i`, `offsets[count]` the total height.
 */
export function stackOffsets(heights: number[], gap: number): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i + 1] = offsets[i] + heights[i] + (i === heights.length - 1 ? 0 : gap);
  }
  return offsets;
}

/** Last index whose top is at or above `position`. `offsets` must be non-empty. */
export function indexAt(offsets: number[], position: number): number {
  let lo = 0;
  let hi = offsets.length - 2; // last valid item index
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The mount window's overscan (the single rule, DR-224): the page buffer
 *  the continuous mount window carries on each side — the single-mode
 *  prefetch window (§3.6) reuses this exact value, so the two modes share
 *  one bounded lookahead. */
export const OVERSCAN = 6;

/**
 * The mounted window for a scroll position (§5.3.5): the items the viewport
 * touches, plus `overscan` on each side. `padTop`/`padBottom` always add up
 * with the window to `totalHeight`, so the scrollbar stays honest (NFR-01).
 */
export function window(
  scrollTop: number,
  viewportHeight: number,
  offsets: number[],
  overscan = OVERSCAN,
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

/** Cover width at a card width: the card's inner width minus the content inset
 *  (UI-03 as modified, §3.8, DR-245) — the single source the card component
 *  and the cover request use (the superseded inline `cardWidth − 2` is
 *  recorded there). The 1 px card border and the 5 px inset on each side. */
export function coverWidth(cardWidth: number): number {
  return cardWidth - 2 - 2 * CARD_CONTENT_PAD;
}

/** Cover height at a card width: the shipped A4 ratio (218:309 inside a 220
 *  card, DR-83) applied to the inset cover box (DR-245) — 208×295 at 220,
 *  308×437 at the 320 cap. */
export function coverHeight(cardWidth: number): number {
  return Math.round((coverWidth(cardWidth) * 309) / 218);
}

/** The card's fixed text block — title (two clamped lines), author, meta,
 *  bottom padding: 70 px, unchanged from the shipped card. The measurement is
 *  the shipped 389 px total minus its 10 px cover padding and the 309 px
 *  cover; D6 removed the padding from the card's rendering, so the height
 *  formula no longer prices it — the text block itself is the same 70 px. */
const CARD_TEXT_BLOCK = 389 - 10 - 309;

/** One card's height at a given width: the inset top gap, the cover, the text
 *  block, the inset bottom gap (UI-03 as modified, §3.8, DR-245; the
 *  superseded "cover from the card's inner top edge (D6)" is recorded there).
 *  Derived per resize, uniform within one resize (§5.3.5). */
export function cardHeight(cardWidth: number): number {
  return coverHeight(cardWidth) + CARD_TEXT_BLOCK + 2 * CARD_CONTENT_PAD;
}

/** The windowing unit: a card plus the gap that follows it. */
export function cellHeight(cardWidth: number): number {
  return cardHeight(cardWidth) + CARD_GAP;
}

/**
 * Grid geometry from container width (§5.3.5 as modified by DR-99).
 *
 * The column **count** is chosen first — Auto from the 232 px pitch, or the
 * manual 2–10 count clamped to what fits at the `MIN_CARD_WIDTH` floor. The
 * card **width** then fills the container: `floor((containerWidth − gaps) /
 * columns)`, bounded by `MIN_CARD_WIDTH` and `MAX_CARD_WIDTH`. Past the cap the
 * leftover space is margin and the grid centers (§3.10) — the shipped
 * `Math.min(CARD_WIDTH, …)` clamp is gone, which is what made a manual count
 * leave slack instead of widening the cards.
 */
export function gridLayout(
  containerWidth: number,
  override: number | null = null,
  gap = CARD_GAP,
): GridLayout {
  const autoColumns = Math.max(1, Math.floor((containerWidth + gap) / (CARD_WIDTH + gap)));
  const fitsAtFloor = Math.max(1, Math.floor((containerWidth + gap) / (MIN_CARD_WIDTH + gap)));
  const columns =
    override === null
      ? autoColumns
      : Math.min(Math.max(GRID_COLUMNS_MIN, Math.min(GRID_COLUMNS_MAX, override)), fitsAtFloor);
  const derived = Math.floor((containerWidth - (columns - 1) * gap) / columns);
  return { columns, cardWidth: Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, derived)) };
}
