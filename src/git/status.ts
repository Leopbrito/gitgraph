import type {Commit, WorkingTree} from '../graph/types.js';
import {git} from './exec.js';

/** Stands in for the hash of the synthetic "uncommitted changes" node. */
export const UNCOMMITTED_HASH = 'uncommitted';

/**
 * Counts the entries of `git status --porcelain=v2`. A file with both staged
 * and unstaged changes counts in both categories; an unmerged path only in
 * `conflicted`. Ignored files (`!`) and headers (`#`) are skipped.
 */
export function parseStatus(text: string): WorkingTree {
  const tree: WorkingTree = {staged: 0, modified: 0, untracked: 0, conflicted: 0};
  for (const line of text.split('\n')) {
    const kind = line[0];
    if (kind === '1' || kind === '2') {
      // "1 XY ..." / "2 XY ...": X is the index, Y the working tree, "." means unchanged.
      if (line[2] !== '.') tree.staged++;
      if (line[3] !== '.') tree.modified++;
    } else if (kind === 'u') {
      tree.conflicted++;
    } else if (kind === '?') {
      tree.untracked++;
    }
  }
  return tree;
}

export const isClean = (t: WorkingTree) => t.staged + t.modified + t.untracked + t.conflicted === 0;

/** "2 staged, 3 modificados, 1 não rastreado". */
export function describeWorkingTree(t: WorkingTree): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    t.staged > 0 && `${t.staged} staged`,
    t.modified > 0 && plural(t.modified, 'modificado', 'modificados'),
    t.untracked > 0 && plural(t.untracked, 'não rastreado', 'não rastreados'),
    t.conflicted > 0 && plural(t.conflicted, 'em conflito', 'em conflito'),
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The state of the working tree, or null when it is clean. `--no-optional-locks`
 * keeps `git status` from refreshing the index: with --watch, a write to the
 * index would trigger a reload, which would run this again, forever.
 */
export async function loadWorkingTree(cwd: string): Promise<WorkingTree | null> {
  const tree = parseStatus(await git(['--no-optional-locks', 'status', '--porcelain=v2'], cwd));
  return isClean(tree) ? null : tree;
}

/** The node for the working tree: a child of HEAD, with the counts in its subject. */
export function uncommittedNode(tree: WorkingTree, head: string): Commit {
  return {
    hash: UNCOMMITTED_HASH,
    parents: [head],
    author: '',
    email: '',
    date: new Date().toISOString(),
    subject: `Alterações não commitadas (${describeWorkingTree(tree)})`,
    body: '',
    uncommitted: tree,
  };
}
