import type {Ref} from '../graph/types.js';
import {git} from './exec.js';

export type MergeTarget =
  | {kind: 'branch'; name: string; remote: boolean}
  | {kind: 'commit'; hash: string};

/** What `git merge` did. */
export type MergeResult = 'up-to-date' | 'fast-forward' | 'merged';

/**
 * What can be merged into the current branch from this commit: the local and
 * remote branches whose tip it is (the current branch itself is left out) or,
 * when there is none, the commit.
 */
export function mergeTargets(
  hash: string,
  refs: Ref[],
  currentBranch: string | null,
): MergeTarget[] {
  const names = (kind: Ref['kind']) =>
    refs
      .filter(ref => ref.kind === kind)
      .map(ref => ref.name)
      .sort((a, b) => a.localeCompare(b));
  const branches: MergeTarget[] = [
    ...names('branch')
      .filter(name => name !== currentBranch)
      .map(name => ({kind: 'branch', name, remote: false}) as const),
    ...names('remote').map(name => ({kind: 'branch', name, remote: true}) as const),
  ];
  return branches.length > 0 ? branches : [{kind: 'commit', hash}];
}

export function describeMergeTarget(target: MergeTarget): string {
  return target.kind === 'branch' ? target.name : `${target.hash.slice(0, 7)} (commit)`;
}

/** The merge stopped on conflicts and is still in progress in the repository. */
export class MergeConflictError extends Error {
  constructor(readonly files: string[]) {
    super(files.length > 0 ? `conflitos em ${files.join(', ')}` : 'merge em andamento');
  }
}

/** A merge was started and not concluded (`.git/MERGE_HEAD` exists). */
export async function mergeInProgress(cwd: string): Promise<boolean> {
  try {
    await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Paths that still have unresolved conflicts. */
export async function conflictedFiles(cwd: string): Promise<string[]> {
  const out = await git(['diff', '--name-only', '--diff-filter=U'], cwd);
  return out.split('\n').filter(line => line !== '');
}

/**
 * Plain `git merge --no-edit` (there is no editor in the TUI): fast-forwards
 * when it can, otherwise makes a merge commit with git's own message. On
 * conflicts the merge is left in progress and `MergeConflictError` says which
 * files; any other refusal (local changes would be overwritten, unknown ref)
 * is the rejection reason and changes nothing.
 */
export async function merge(cwd: string, target: MergeTarget): Promise<MergeResult> {
  const ref = target.kind === 'branch' ? target.name : target.hash;
  let output: string;
  try {
    output = await git(['merge', '--no-edit', ref], cwd);
  } catch (error) {
    if (await mergeInProgress(cwd)) throw new MergeConflictError(await conflictedFiles(cwd));
    throw error;
  }
  if (/Already up to date/.test(output)) return 'up-to-date';
  return /^Fast-forward$/m.test(output) ? 'fast-forward' : 'merged';
}

export async function abortMerge(cwd: string): Promise<void> {
  await git(['merge', '--abort'], cwd);
}

/** The git operations the TUI needs around a merge, injected like `load`. */
export interface MergeActions {
  merge: (target: MergeTarget) => Promise<MergeResult>;
  abort: () => Promise<void>;
  conflicts: () => Promise<string[]>;
}
