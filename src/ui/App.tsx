import React, {useEffect} from 'react';
import {Static, useApp} from 'ink';
import type {RefInfo} from '../git/refs.js';
import type {GraphRow} from '../graph/types.js';
import {GraphRowView} from './GraphRowView.js';

interface Props {
  rows: GraphRow[];
  refs: RefInfo;
}

/**
 * Imprime o grafo inteiro uma vez e encerra (o terminal faz o scroll).
 * <Static> evita que o Ink apague a tela quando o grafo é maior que ela.
 */
export function App({rows, refs}: Props) {
  const {exit} = useApp();
  useEffect(() => exit(), [exit]);

  const graphWidth = Math.max(1, ...rows.map(r => r.width));
  return (
    <Static items={rows}>
      {row => (
        <GraphRowView
          key={row.commit.hash}
          row={row}
          graphWidth={graphWidth}
          refs={refs.byCommit.get(row.commit.hash) ?? []}
          head={{
            isHead: refs.head.hash === row.commit.hash,
            branch: refs.head.branch,
          }}
        />
      )}
    </Static>
  );
}
