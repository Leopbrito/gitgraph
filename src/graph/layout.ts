import type {Commit, GraphRow} from './types.js';

/**
 * Assigns columns and edges to the commits. Expects the list in topological
 * order (children before parents), as `git log --topo-order` returns it.
 *
 * The lanes form a dense list of expected hashes: the index is the column on
 * screen and, when a lane ends, the ones to its right slide to the left
 * (the drawing of that transition lives in glyphs.ts). Rules:
 * - the commit takes the lane that expects it; with no lane (a new tip), it goes at the end;
 * - the first parent inherits the child's lane (and color); the others open lanes
 *   right next to it;
 * - a parent that already has a lane gets the edge in it, without opening a duplicate lane.
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
      // No parents, or the first parent already has a lane: the commit's lane ends here.
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
