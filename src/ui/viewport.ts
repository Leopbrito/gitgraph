/**
 * Window of visible lines of a list whose items take different heights
 * (a commit with a connector line takes 2 lines).
 */

/** Index (exclusive) of the last item that fits in `viewHeight` from `offset`. */
export function visibleEnd(heights: number[], offset: number, viewHeight: number): number {
  let used = 0;
  let i = offset;
  for (; i < heights.length; i++) {
    const h = heights[i] ?? 1;
    // The first item always shows, even if it alone exceeds the window.
    if (i > offset && used + h > viewHeight) break;
    used += h;
  }
  return i;
}

/** Item shown on `line` (0-based, relative to the top of the window), or null if none. */
export function itemAt(
  heights: number[],
  offset: number,
  line: number,
  viewHeight: number,
): number | null {
  if (line < 0 || line >= viewHeight) return null;
  const end = visibleEnd(heights, offset, viewHeight);
  let bottom = 0;
  for (let i = offset; i < end; i++) {
    bottom += heights[i] ?? 1;
    if (line < bottom) return i;
  }
  return null;
}

/** Smallest offset that keeps `selected` visible, starting from `offset`. */
export function scrollIntoView(
  heights: number[],
  offset: number,
  selected: number,
  viewHeight: number,
): number {
  if (selected < offset) return selected;
  let next = offset;
  while (next < selected && visibleEnd(heights, next, viewHeight) <= selected) next++;
  return next;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Start of a window of `size` items that keeps `index` near the center. */
export function centerWindow(length: number, index: number, size: number): number {
  return clamp(index - Math.floor(size / 2), 0, Math.max(0, length - size));
}
