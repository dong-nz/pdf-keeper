// Pure windowing math (no DOM, no measurement — spec §5.3.5). Item sizes
// are fixed by the design system, so offsets are computable from index.

export interface WindowRange {
  start: number;
  end: number; // exclusive
  padTop: number;
  padBottom: number;
  totalHeight: number;
}

export function window(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  itemSize: number,
  overscan = 6,
): WindowRange {
  const totalHeight = count * itemSize;
  if (count === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0, totalHeight: 0 };
  const first = Math.max(0, Math.floor(scrollTop / itemSize) - overscan);
  const visible = Math.ceil(viewportHeight / itemSize) + 2 * overscan;
  const last = Math.min(count - 1, first + visible - 1);
  return {
    start: first,
    end: last + 1,
    padTop: first * itemSize,
    padBottom: totalHeight - (last + 1) * itemSize,
    totalHeight,
  };
}

/** Grid columns from container width (§5.3.5): computed per resize, not per item. */
export function gridColumns(containerWidth: number, cardWidth = 220, gap = 12): number {
  return Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));
}

/** Whether the scroll is within `near` rows of the loaded end (slice loading, §5.3.4 rule 2). */
export function nearEnd(scrollTop: number, viewportHeight: number, loadedCount: number, itemSize: number, near = 20): boolean {
  return scrollTop + viewportHeight >= (loadedCount - near) * itemSize;
}
