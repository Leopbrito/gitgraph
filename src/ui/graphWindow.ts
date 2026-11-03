/**
 * Horizontal window over the graph columns (pure). A graph with many lanes can
 * be wider than the terminal; the commit text has priority, so only part of
 * the graph is shown and `h`/`l` pan it.
 */
import {clamp} from './viewport.js';

/** Characters kept for the marker, hash, subject and author; the graph gets the rest. */
export const MIN_TEXT_WIDTH = 48;
/** Never shrink the graph below this many columns, however narrow the terminal. */
const MIN_COLUMNS = 4;
/** Each graph column is this many characters wide (glyph plus separator). */
const CELLS = 2;

/** How many graph columns fit in the terminal while leaving room for the text. */
export function visibleColumns(totalColumns: number, terminalWidth: number): number {
  const room = Math.floor((terminalWidth - MIN_TEXT_WIDTH) / CELLS);
  return Math.min(totalColumns, Math.max(MIN_COLUMNS, room));
}

/** The first visible column, kept inside the graph. */
export function clampOffset(offset: number, totalColumns: number, visible: number): number {
  return clamp(offset, 0, Math.max(0, totalColumns - visible));
}

/** The smallest move of the window that shows `column`. */
export function followColumn(offset: number, column: number, visible: number): number {
  if (column < offset) return column;
  if (column >= offset + visible) return column - visible + 1;
  return offset;
}
