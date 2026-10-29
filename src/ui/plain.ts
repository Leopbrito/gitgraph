import type {RefInfo} from '../git/refs.js';
import {cellsToText, renderGraphLines, toAscii, type Cell} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {formatRefs} from './format.js';

/** Grafo em texto puro (sem cor nem quebra), para pipes e redirecionamentos. */
export function formatPlain(
  rows: GraphRow[],
  refs: RefInfo,
  {ascii = false, spaced = false}: {ascii?: boolean; spaced?: boolean} = {},
): string[] {
  const fit = (cells: Cell[]) => (ascii ? toAscii(cells) : cells);
  const graphWidth = Math.max(1, ...rows.map(r => r.width));
  return rows.flatMap(row => {
    const {node, connector} = renderGraphLines(row, row.width, {spaced});
    const {commit} = row;
    const labels = formatRefs(refs.byCommit.get(commit.hash) ?? [], {
      isHead: refs.head.hash === commit.hash,
      branch: refs.head.branch,
    })
      .map(l => `(${l.text}) `)
      .join('');
    const line =
      `${cellsToText(fit(node), graphWidth)} ${commit.hash.slice(0, 7)} ${labels}` +
      `${commit.subject}  ${commit.author}, ${commit.date.slice(0, 10)}`;
    return connector ? [line, cellsToText(fit(connector)).trimEnd()] : [line];
  });
}
