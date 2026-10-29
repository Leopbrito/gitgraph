import React from 'react';
import {Box, Text} from 'ink';
import {
  CELLS_PER_COLUMN,
  renderGraphLines,
  toAscii,
  type Cell,
} from '../graph/glyphs.js';
import type {GraphRow, Ref} from '../graph/types.js';
import {tint, useDisplay} from './display.js';
import {formatRefs, type HeadInfo} from './format.js';

const PALETTE = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red'] as const;
export const laneColor = (color: number) => PALETTE[color % PALETTE.length];

interface Props {
  row: GraphRow;
  /** Largura global do grafo, em colunas, para alinhar o texto à direita. */
  graphWidth: number;
  refs: Ref[];
  head: HeadInfo;
  /** Destaca a linha (cursor da navegação). */
  selected?: boolean;
}

// Cada linha é um único <Text> truncado na largura do terminal: o grafo não
// desalinha e commits longos não quebram em várias linhas.
export function GraphRowView({row, graphWidth, refs, head, selected = false}: Props) {
  const display = useDisplay();
  const lines = renderGraphLines(row, row.width, {spaced: display.spaced});
  const {commit} = row;
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <GraphCells cells={lines.node} graphWidth={graphWidth} />
        {/* O marcador mantém a seleção visível sem estilos (--no-color desliga o inverso). */}
        <Text>{selected ? '>' : ' '}</Text>
        <Text inverse={selected}>
          <Text dimColor>{commit.hash.slice(0, 7)} </Text>
          {formatRefs(refs, head).map(label => (
            <Text key={label.text} color={tint(display, label.color)} bold>
              {`(${label.text}) `}
            </Text>
          ))}
          <Text>{commit.subject}</Text>
          <Text dimColor>{`  ${commit.author}, ${commit.date.slice(0, 10)}`}</Text>
        </Text>
      </Text>
      {lines.connector && (
        <Text wrap="truncate-end">
          <GraphCells cells={lines.connector} graphWidth={graphWidth} />
        </Text>
      )}
    </Box>
  );
}

function GraphCells({cells, graphWidth}: {cells: Cell[]; graphWidth: number}) {
  const display = useDisplay();
  const shown = display.ascii ? toAscii(cells) : cells;
  const pad = Math.max(0, graphWidth * CELLS_PER_COLUMN - shown.length);
  return (
    <>
      {shown.map((cell, i) => (
        <Text key={i} color={tint(display, laneColor(cell.color))}>
          {cell.char}
        </Text>
      ))}
      {' '.repeat(pad)}
    </>
  );
}
