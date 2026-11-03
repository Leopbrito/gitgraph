import type {Commit, GraphRow} from './types.js';

/**
 * Atribui colunas e arestas aos commits. Espera a lista em ordem topológica
 * (filhos antes dos pais), como `git log --topo-order` devolve.
 *
 * As lanes formam uma lista densa de hashes esperados: o índice é a coluna na
 * tela e, quando uma lane termina, as da direita deslizam para a esquerda
 * (o desenho dessa transição fica em glyphs.ts). Regras:
 * - o commit fica na lane que o espera; sem lane (ponta nova), entra no fim;
 * - o primeiro pai herda a lane do filho (e a cor); os demais abrem lanes
 *   logo à direita dele;
 * - pai que já tem lane recebe a aresta nela, sem abrir lane duplicada.
 */
export function layoutGraph(commits: Commit[]): GraphRow[] {
  return commits.map(createLayout());
}

/**
 * The layout one commit at a time, for output that is written as the commits
 * arrive: call the result with each commit in order and it returns its row.
 */
export function createLayout(): (commit: Commit) => GraphRow {
  let lanes: string[] = [];
  let colors: number[] = [];
  let nextColor = 0;

  return commit => {
    const lanesBefore = [...lanes];
    const colorsBefore = [...colors];
    let column = lanesBefore.indexOf(commit.hash);
    if (column === -1) {
      column = lanesBefore.length;
      lanesBefore.push(commit.hash);
      colorsBefore.push(nextColor++);
    }

    const lanesAfter = [...lanesBefore];
    const colorsAfter = [...colorsBefore];
    const [first, ...others] = commit.parents;
    let insertAt = column + 1;
    if (first === undefined || lanesAfter.includes(first)) {
      // Sem pais, ou o primeiro pai já tem lane: a lane do commit termina aqui.
      lanesAfter.splice(column, 1);
      colorsAfter.splice(column, 1);
      insertAt = column;
    } else {
      lanesAfter[column] = first;
    }
    for (const parent of others) {
      if (lanesAfter.includes(parent)) continue;
      lanesAfter.splice(insertAt, 0, parent);
      colorsAfter.splice(insertAt, 0, nextColor++);
      insertAt++;
    }

    const row: GraphRow = {
      commit,
      column,
      lanesBefore,
      lanesAfter,
      colorsBefore,
      colorsAfter,
      edges: commit.parents.map(parent => ({parent, column: lanesAfter.indexOf(parent)})),
      width: Math.max(1, lanesBefore.length, lanesAfter.length),
    };
    lanes = lanesAfter;
    colors = colorsAfter;
    return row;
  };
}
