import type {GraphRow} from './types.js';

/** A character of the graph and the (lane) color it uses. */
export interface Cell {
  char: string;
  color: number;
}

export interface GraphLines {
  /** The commit line: marker and passing lanes. */
  node: Cell[];
  /** Connector line (merge, fork or lane shift); null if there is none. */
  connector: Cell[] | null;
}

/** Each column takes two cells: the glyph and the gap (or `─`, `╱`, `╲`) up to the next one. */
export const CELLS_PER_COLUMN = 2;

/** The path of a lane between the commit line and the next line. */
interface Path {
  from: number;
  to: number;
  color: number;
  /** Part of the commit (an edge to a parent), not a lane that just passes. */
  edge: boolean;
}

function pathsOf(row: GraphRow): Path[] {
  const paths: Path[] = [];
  row.lanesBefore.forEach((hash, from) => {
    if (from === row.column) return;
    const to = row.lanesAfter.indexOf(hash);
    if (to !== -1) paths.push({from, to, color: row.colorsAfter[to] ?? 0, edge: false});
  });
  for (const edge of row.edges) {
    paths.push({
      from: row.column,
      to: edge.column,
      color: row.colorsAfter[edge.column] ?? 0,
      edge: true,
    });
  }
  return paths;
}

export interface LineOptions {
  /**
   * Draw a connector line after every commit that has lanes going on, so
   * consecutive commits are joined by a `│`. Without it, the connector line
   * only exists when some lane changes column.
   */
  spaced?: boolean;
}

/** Whether the row needs a connector line below the commit line. */
export function needsConnector(row: GraphRow, {spaced = false}: LineOptions = {}): boolean {
  const paths = pathsOf(row);
  return spaced ? paths.length > 0 : paths.some(p => p.from !== p.to);
}

export function renderGraphLines(
  row: GraphRow,
  width: number,
  options: LineOptions = {},
): GraphLines {
  return {
    node: renderNode(row, width),
    connector: needsConnector(row, options) ? renderConnector(row, width) : null,
  };
}

function renderNode(row: GraphRow, width: number): Cell[] {
  const cells: Cell[] = [];
  for (let c = 0; c < width; c++) {
    // A stash and the uncommitted changes are hollow nodes, so they stand out from the commits.
    const node = row.commit.stash || row.commit.uncommitted ? '○' : '●';
    const char = c === row.column ? node : c < row.lanesBefore.length ? '│' : ' ';
    const color = row.colorsBefore[c] ?? 0;
    cells.push({char, color}, {char: ' ', color});
  }
  return cells;
}

interface Dirs {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  color: number;
}

const GLYPHS: Record<string, string> = {
  ud: '│',
  lr: '─',
  ur: '╰',
  ul: '╯',
  dr: '╭',
  dl: '╮',
  udr: '├',
  udl: '┤',
  dlr: '┬',
  ulr: '┴',
  udlr: '┼',
};

function glyph({up, down, left, right}: Dirs): string {
  const key = `${up ? 'u' : ''}${down ? 'd' : ''}${left ? 'l' : ''}${right ? 'r' : ''}`;
  if (key === '') return ' ';
  return GLYPHS[key] ?? (key === 'u' || key === 'd' ? '│' : '─');
}

/**
 * Each path goes up the source column, runs horizontally and goes down the
 * destination column; the directions of paths that meet in a cell add up and
 * `glyph` picks the character (`├`, `┬`, `┼`...). Lanes that only shift one
 * column use `╱`/`╲` in the gap between the columns, when it is free.
 */
function renderConnector(row: GraphRow, width: number): Cell[] {
  const paths = pathsOf(row);

  const dirs: Dirs[] = Array.from({length: width}, () => ({
    up: false,
    down: false,
    left: false,
    right: false,
    color: 0,
  }));
  // Gap between column x and x+1: horizontal or diagonal stroke.
  const between: Cell[] = Array.from({length: width}, () => ({char: ' ', color: 0}));

  const draw = ({from, to, color}: Path) => {
    const touch = (x: number, set: Partial<Dirs>) => {
      const d = dirs[x];
      if (d) Object.assign(d, set, {color});
    };
    touch(from, {up: true});
    touch(to, {down: true});
    if (to === from) return;
    const [lo, hi] = from < to ? [from, to] : [to, from];
    touch(from, from < to ? {right: true} : {left: true});
    touch(to, from < to ? {left: true} : {right: true});
    for (let x = lo + 1; x < hi; x++) touch(x, {left: true, right: true});
    for (let x = lo; x < hi; x++) between[x] = {char: '─', color};
  };

  const isUnitShift = (p: Path) => !p.edge && Math.abs(p.to - p.from) === 1;
  paths.filter(p => !isUnitShift(p)).forEach(draw);
  for (const p of paths.filter(isUnitShift)) {
    const lo = Math.min(p.from, p.to);
    if (between[lo]?.char !== ' ') draw(p);
    else between[lo] = {char: p.to < p.from ? '╱' : '╲', color: p.color};
  }

  const cells: Cell[] = [];
  for (let x = 0; x < width; x++) {
    const d = dirs[x]!;
    cells.push({char: glyph(d), color: d.color}, between[x]!);
  }
  return cells;
}

const ASCII: Record<string, string> = {
  '●': '*',
  '○': 'o',
  '│': '|',
  '─': '-',
  '╱': '/',
  '╲': '\\',
  '╭': '+',
  '╮': '+',
  '╰': '+',
  '╯': '+',
  '├': '+',
  '┤': '+',
  '┬': '+',
  '┴': '+',
  '┼': '+',
};

/** Swaps the box-drawing characters for ASCII equivalents. */
export function toAscii(cells: Cell[]): Cell[] {
  return cells.map(cell => ({...cell, char: ASCII[cell.char] ?? cell.char}));
}

/** The cells as plain text, for tests and colorless output. */
export function cellsToText(cells: Cell[], padTo = 0): string {
  const text = cells.map(c => c.char).join('');
  return text.padEnd(padTo * CELLS_PER_COLUMN);
}
