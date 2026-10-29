import type {GraphRow} from './types.js';

/** Um caractere do grafo e a cor (da lane) que ele usa. */
export interface Cell {
  char: string;
  color: number;
}

export interface GraphLines {
  /** Linha do commit: marcador e lanes passantes. */
  node: Cell[];
  /** Linha de ligação (merge, fork ou deslocamento de lanes); null se não há. */
  connector: Cell[] | null;
}

/** Cada coluna ocupa duas células: o glifo e o espaço (ou `─`, `╱`, `╲`) até a próxima. */
export const CELLS_PER_COLUMN = 2;

/** Trajeto de uma lane entre a linha do commit e a linha seguinte. */
interface Path {
  from: number;
  to: number;
  color: number;
  /** Parte do commit (aresta para um pai), não uma lane que só passa. */
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

/** Precisa de linha de ligação quando alguma lane muda de coluna. */
export function needsConnector(row: GraphRow): boolean {
  return pathsOf(row).some(p => p.from !== p.to);
}

export function renderGraphLines(row: GraphRow, width: number): GraphLines {
  return {node: renderNode(row, width), connector: renderConnector(row, width)};
}

function renderNode(row: GraphRow, width: number): Cell[] {
  const cells: Cell[] = [];
  for (let c = 0; c < width; c++) {
    const char = c === row.column ? '●' : c < row.lanesBefore.length ? '│' : ' ';
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
 * Cada trajeto sobe pela coluna de origem, anda na horizontal e desce pela de
 * destino; as direções de trajetos que se encontram numa célula se somam e
 * `glyph` escolhe o caractere (`├`, `┬`, `┼`...). Lanes que só deslizam uma
 * coluna usam `╱`/`╲` no espaço entre as colunas, quando ele está livre.
 */
function renderConnector(row: GraphRow, width: number): Cell[] | null {
  const paths = pathsOf(row);
  if (!paths.some(p => p.from !== p.to)) return null;

  const dirs: Dirs[] = Array.from({length: width}, () => ({
    up: false,
    down: false,
    left: false,
    right: false,
    color: 0,
  }));
  // Espaço entre a coluna x e a x+1: traço horizontal ou diagonal.
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

/** Troca os caracteres de desenho de caixa por equivalentes ASCII. */
export function toAscii(cells: Cell[]): Cell[] {
  return cells.map(cell => ({...cell, char: ASCII[cell.char] ?? cell.char}));
}

/** Texto puro das células, para testes e saída sem cor. */
export function cellsToText(cells: Cell[], padTo = 0): string {
  const text = cells.map(c => c.char).join('');
  return text.padEnd(padTo * CELLS_PER_COLUMN);
}
