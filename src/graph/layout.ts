import type {Commit, Edge, GraphRow} from './types.js';

type Lanes = (string | null)[];

/**
 * Atribui colunas e arestas aos commits. Espera a lista em ordem topológica
 * (filhos antes dos pais), como `git log --topo-order` devolve.
 *
 * Cada lane guarda o hash do commit que ela espera encontrar. Um pai que já
 * tem lane recebe a aresta nela em vez de abrir uma lane duplicada.
 */
export function layoutGraph(commits: Commit[]): GraphRow[] {
  const lanes: Lanes = [];
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const lanesBefore = [...lanes];

    let column = lanes.indexOf(commit.hash);
    if (column === -1) column = freeSlot(lanes);
    lanes[column] = null;

    const edges: Edge[] = commit.parents.map((parent, i) => {
      const existing = lanes.indexOf(parent);
      if (existing !== -1) return {parent, column: existing};
      // O primeiro pai continua na coluna do filho; os demais abrem lanes.
      const target = i === 0 ? column : freeSlot(lanes);
      lanes[target] = parent;
      return {parent, column: target};
    });

    trimEnd(lanes);
    const lanesAfter = [...lanes];
    const width = Math.max(
      column + 1,
      lanesBefore.length,
      lanesAfter.length,
      ...edges.map(e => e.column + 1),
    );
    rows.push({commit, column, lanesBefore, lanesAfter, edges, width});
  }

  return rows;
}

function freeSlot(lanes: Lanes): number {
  const free = lanes.indexOf(null);
  return free === -1 ? lanes.length : free;
}

function trimEnd(lanes: Lanes): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
}
