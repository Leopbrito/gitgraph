import React from 'react';
import {Box, Text} from 'ink';
import {
  CELLS_PER_COLUMN,
  renderGraphLines,
  toAscii,
  type Cell,
} from '../graph/glyphs.js';
import type {GraphRow, Ref} from '../graph/types.js';
import {formatDate} from './date.js';
import {tint, useDisplay} from './display.js';
import {formatRefs, type HeadInfo} from './format.js';

const PALETTE = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red'] as const;
export const laneColor = (color: number, palette: readonly string[] = PALETTE): string | undefined =>
  palette[color % palette.length];

interface Props {
  row: GraphRow;
  /** Largura global do grafo, em colunas, para alinhar o texto à direita. */
  graphWidth: number;
  refs: Ref[];
  head: HeadInfo;
  /** Destaca a linha (cursor da navegação). */
  selected?: boolean;
  /** The row matches the active search. */
  matched?: boolean;
  /** Part of the graph to show when it is wider than the terminal (in columns). */
  columnWindow?: {offset: number; count: number};
}

// Cada linha é um único <Text> truncado na largura do terminal: o grafo não
// desalinha e commits longos não quebram em várias linhas.
export function GraphRowView({row, graphWidth, refs, head, selected = false, matched = false, columnWindow}: Props) {
  const display = useDisplay();
  const lines = renderGraphLines(row, row.width, {spaced: display.spaced});
  const {commit} = row;
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <GraphCells cells={lines.node} graphWidth={graphWidth} columnWindow={columnWindow} />
        {/* O marcador mantém a seleção visível sem estilos (--no-color desliga o inverso); `*` marca os resultados da busca. */}
        <Text>{selected ? '>' : matched ? '*' : ' '}</Text>
        <Text inverse={selected}>
          <Text dimColor>{commit.uncommitted ? 'working' : commit.hash.slice(0, 7)} </Text>
          {formatRefs(refs, head).map(label => (
            <Text key={label.text} color={tint(display, label.color)} bold>
              {`(${label.text}) `}
            </Text>
          ))}
          <Text bold={matched} color={matched ? tint(display, 'yellow') : commit.uncommitted ? tint(display, 'yellow') : undefined}>
            {commit.subject}
          </Text>
          {/* The uncommitted changes have no author or date. */}
          {!commit.uncommitted && (
            <Text dimColor>{`  ${commit.author}, ${formatDate(commit.date, display.date ?? 'short')}`}</Text>
          )}
        </Text>
      </Text>
      {lines.connector && (
        <Text wrap="truncate-end">
          <GraphCells cells={lines.connector} graphWidth={graphWidth} columnWindow={columnWindow} />
        </Text>
      )}
    </Box>
  );
}

function GraphCells({
  cells,
  graphWidth,
  columnWindow,
}: {
  cells: Cell[];
  graphWidth: number;
  columnWindow?: {offset: number; count: number};
}) {
  const display = useDisplay();
  const all = display.ascii ? toAscii(cells) : cells;
  // Without a window the whole graph is shown, padded to the widest row.
  const shown = columnWindow
    ? all.slice(columnWindow.offset * CELLS_PER_COLUMN, (columnWindow.offset + columnWindow.count) * CELLS_PER_COLUMN)
    : all;
  const pad = Math.max(0, (columnWindow?.count ?? graphWidth) * CELLS_PER_COLUMN - shown.length);
  return (
    <>
      {shown.map((cell, i) => (
        <Text key={i} color={tint(display, laneColor(cell.color, display.lanes))}>
          {cell.char}
        </Text>
      ))}
      {' '.repeat(pad)}
    </>
  );
}
