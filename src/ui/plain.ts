import type {RefInfo} from '../git/refs.js';
import {cellsToText, renderGraphLines, toAscii, type Cell} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {formatDate, type DateStyle} from './date.js';
import {formatRefs} from './format.js';

export interface PlainOptions {
  ascii?: boolean;
  spaced?: boolean;
  date?: DateStyle;
  now?: Date;
}

/** The graph as plain text (no color, no wrapping), for pipes and redirects. */
export function formatPlain(rows: GraphRow[], refs: RefInfo, options: PlainOptions = {}): string[] {
  const graphWidth = Math.max(1, ...rows.map(r => r.width));
  return rows.flatMap(row => plainLines(row, refs, graphWidth, options));
}

/**
 * The line(s) of one row. `graphWidth` is the width of the widest row, which
 * aligns the text; a caller that writes rows as they come needs to know it first.
 */
export function plainLines(
  row: GraphRow,
  refs: RefInfo,
  graphWidth: number,
  {ascii = false, spaced = false, date = 'short', now}: PlainOptions = {},
): string[] {
  const fit = (cells: Cell[]) => (ascii ? toAscii(cells) : cells);
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
}
