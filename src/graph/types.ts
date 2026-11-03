/** Files in each state of the working tree, by category (a file can be both staged and modified). */
export interface WorkingTree {
  staged: number;
  modified: number;
  untracked: number;
  /** Unmerged paths of a merge or rebase in progress. */
  conflicted: number;
}

export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** Author date in ISO 8601. */
  date: string;
  subject: string;
  body: string;
  /** A stash entry, shown as a single node above its base commit. */
  stash?: true;
  /** The synthetic node for the uncommitted changes, shown above HEAD; not a real commit. */
  uncommitted?: WorkingTree;
}

export type RefKind = 'branch' | 'remote' | 'tag' | 'stash';

export interface Ref {
  name: string;
  kind: RefKind;
}

/** An edge from a commit to one of its parents. */
export interface Edge {
  parent: string;
  /** Column of the parent's lane right after this row (index in `lanesAfter`). */
  column: number;
}

export interface GraphRow {
  commit: Commit;
  /** Column of the commit in `lanesBefore`. */
  column: number;
  /**
   * Lanes on arriving at this row, without gaps: each position is an expected hash
   * and the index is the column on screen. A new tip goes at the end of the list.
   */
  lanesBefore: string[];
  /** Same, after processing the commit. */
  lanesAfter: string[];
  /** Color of each lane (parallel to `lanesBefore`); a lane keeps its color when it shifts. */
  colorsBefore: number[];
  /** Color of each lane (parallel to `lanesAfter`). */
  colorsAfter: number[];
  /** One edge per parent, in the order of `commit.parents`. */
  edges: Edge[];
  /** Number of columns needed to draw this row. */
  width: number;
}
