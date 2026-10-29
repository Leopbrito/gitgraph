import type {GraphRow} from './types.js';

/** Um caractere do grafo e a coluna (lane) cuja cor ele usa. */
export interface Cell {
  char: string;
  column: number;
}

export interface GraphLines {
  /** Linha do commit: marcador e lanes passantes. */
  node: Cell[];
  /** Linha de ligação (merge/fork), só quando alguma aresta muda de coluna. */
  connector: Cell[] | null;
}

/** Cada coluna ocupa duas células: o glifo e o espaço (ou `─`) até a próxima. */
export const CELLS_PER_COLUMN = 2;

/** A linha precisa de uma linha de ligação quando alguma aresta muda de coluna. */
export function needsConnector(row: GraphRow): boolean {
  return row.edges.some(e => e.column !== row.column);
}

export function renderGraphLines(row: GraphRow, width: number): GraphLines {
  return {node: renderNode(row, width), connector: renderConnector(row, width)};
}

function renderNode(row: GraphRow, width: number): Cell[] {
  const cells: Cell[] = [];
  for (let c = 0; c < width; c++) {
    const char = c === row.column ? '●' : row.lanesBefore[c] ? '│' : ' ';
    cells.push({char, column: c}, {char: ' ', column: c});
  }
  return cells;
}

function renderConnector(row: GraphRow, width: number): Cell[] | null {
  const {column, lanesBefore, lanesAfter} = row;
  const targets = row.edges.map(e => e.column).filter(c => c !== column);
  if (targets.length === 0) return null;

  const left = targets.some(t => t < column);
  const right = targets.some(t => t > column);
  const lo = Math.min(column, ...targets);
  const hi = Math.max(column, ...targets);
  const stays = lanesAfter[column] != null;
  // Lane do pai que já existia antes desta linha (a aresta só se junta a ela).
  const joined = (t: number) =>
    row.edges.some(e => e.column === t && lanesBefore[t] === e.parent);

  const cells: Cell[] = [];
  for (let c = 0; c < width; c++) {
    let char = lanesAfter[c] ? '│' : ' ';
    if (c === column) {
      char = nodeJunction(stays, left, right);
    } else if (targets.includes(c)) {
      const inner = c > lo && c < hi;
      if (inner) char = joined(c) ? '┼' : '┬';
      else if (c > column) char = joined(c) ? '┤' : '╮';
      else char = joined(c) ? '├' : '╭';
    } else if (c > lo && c < hi) {
      char = lanesAfter[c] ? '┼' : '─';
    }
    // O traço horizontal usa a cor da lane de destino.
    const run = c >= lo && c < hi;
    const fillerColumn = c >= column ? hi : lo;
    cells.push({char, column: c}, {char: run ? '─' : ' ', column: fillerColumn});
  }
  return cells;
}

function nodeJunction(stays: boolean, left: boolean, right: boolean): string {
  if (stays) return left && right ? '┼' : right ? '├' : '┤';
  return left && right ? '┴' : right ? '╰' : '╯';
}

/** Texto puro das células, para testes e saída sem cor. */
export function cellsToText(cells: Cell[], padTo = 0): string {
  const text = cells.map(c => c.char).join('');
  return text.padEnd(padTo * CELLS_PER_COLUMN);
}
