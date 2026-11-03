import type {RefInfo} from '../git/refs.js';
import {cellsToText, renderGraphLines, toAscii, type Cell} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {formatDate, type DateStyle} from './date.js';
import {formatRefs} from './format.js';

/** Grafo em texto puro (sem cor nem quebra), para pipes e redirecionamentos. */
export function formatPlain(
  rows: GraphRow[],
  refs: RefInfo,
  {ascii = false, spaced = false, date = 'short', now}: {ascii?: boolean; spaced?: boolean; date?: DateStyle; now?: Date} = {},
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
    // The uncommitted changes are not a commit: no hash, author or date.
    const line = commit.uncommitted
      ? `${cellsToText(fit(node), graphWidth)} working ${commit.subject}`
      : `${cellsToText(fit(node), graphWidth)} ${commit.hash.slice(0, 7)} ${labels}` +
        `${commit.subject}  ${commit.author}, ${formatDate(commit.date, date, {now})}`;
    return connector ? [line, cellsToText(fit(connector)).trimEnd()] : [line];
  });
}
