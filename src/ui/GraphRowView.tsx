import React from 'react';
import {Box, Text} from 'ink';
import {CELLS_PER_COLUMN, renderGraphLines, type Cell} from '../graph/glyphs.js';
import type {GraphRow, Ref} from '../graph/types.js';
import {formatRefs, type HeadInfo} from './format.js';

const PALETTE = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'red'] as const;
const laneColor = (column: number) => PALETTE[column % PALETTE.length];

interface Props {
  row: GraphRow;
  /** Largura global do grafo, em colunas, para alinhar o texto à direita. */
  graphWidth: number;
  refs: Ref[];
  head: HeadInfo;
}

// Cada linha é um único <Text> truncado na largura do terminal: o grafo não
// desalinha e commits longos não quebram em várias linhas.
export function GraphRowView({row, graphWidth, refs, head}: Props) {
  const {node, connector} = renderGraphLines(row, row.width);
  const {commit} = row;
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <GraphCells cells={node} graphWidth={graphWidth} />
        <Text> </Text>
        <Text dimColor>{commit.hash.slice(0, 7)} </Text>
        {formatRefs(refs, head).map(label => (
          <Text key={label.text} color={label.color} bold>
            {`(${label.text}) `}
          </Text>
        ))}
        <Text>{commit.subject}</Text>
        <Text dimColor>{`  ${commit.author}, ${commit.date.slice(0, 10)}`}</Text>
      </Text>
      {connector && (
        <Text wrap="truncate-end">
          <GraphCells cells={connector} graphWidth={graphWidth} />
        </Text>
      )}
    </Box>
  );
}

function GraphCells({cells, graphWidth}: {cells: Cell[]; graphWidth: number}) {
  const pad = Math.max(0, graphWidth * CELLS_PER_COLUMN - cells.length);
  return (
    <>
      {cells.map((cell, i) => (
        <Text key={i} color={laneColor(cell.column)}>
          {cell.char}
        </Text>
      ))}
      {' '.repeat(pad)}
    </>
  );
}
