import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {git} from './exec.js';
import {conflictedFiles} from './merge.js';

/** A multi-step git operation that can stop on conflicts and be left in progress. */
export type Operation = 'merge' | 'cherry-pick' | 'revert' | 'rebase';

/** Operations that can skip the step they stopped on. */
export const canSkip = (op: Operation) => op !== 'merge';

/** True if `git rev-parse --verify` finds this state ref (MERGE_HEAD, CHERRY_PICK_HEAD, REVERT_HEAD). */
const hasRef = (cwd: string, name: string) =>
  git(['rev-parse', '-q', '--verify', name], cwd).then(
    () => true,
    () => false,
  );

/** `rebase-merge/` and `rebase-apply/` are directories in the git dir (which differs in a linked worktree). */
async function hasGitDirPath(cwd: string, name: string): Promise<boolean> {
  try {
    const path = (await git(['rev-parse', '--git-path', name], cwd)).trim();
    return existsSync(resolve(cwd, path));
  } catch {
    return false;
  }
}

/**
 * Which operation is stopped in this repository, if any. A rebase also leaves
 * CHERRY_PICK_HEAD or MERGE_HEAD while it is stopped on a commit, so it is
 * checked first.
 */
export async function operationInProgress(cwd: string): Promise<Operation | null> {
  if ((await hasGitDirPath(cwd, 'rebase-merge')) || (await hasGitDirPath(cwd, 'rebase-apply'))) return 'rebase';
  if (await hasRef(cwd, 'CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (await hasRef(cwd, 'REVERT_HEAD')) return 'revert';
  if (await hasRef(cwd, 'MERGE_HEAD')) return 'merge';
  return null;
}

/** The git operations the TUI needs around an operation in progress, injected like `load`. */
export interface OperationActions {
  abort(op: Operation): Promise<void>;
  /** Concludes the step with git's own commit message; fails while conflicts remain. */
  proceed(op: Operation): Promise<void>;
  skip(op: Operation): Promise<void>;
  conflicts(): Promise<string[]>;
}

export function gitOperationActions(cwd: string): OperationActions {
  return {
    abort: async op => void (await git([op, '--abort'], cwd)),
    // `--continue` opens an editor for the message unless told otherwise, which would hang the TUI.
    proceed: async op => void (await git([op, '--continue'], cwd, {env: {GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true'}})),
    skip: async op => void (await git([op, '--skip'], cwd)),
    conflicts: () => conflictedFiles(cwd),
  };
}
