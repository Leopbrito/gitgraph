import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {git} from './exec.js';
import {conflictedFiles} from './merge.js';

/** A multi-step git operation that can stop on conflicts and be left in progress. */
export type Operation = 'merge' | 'cherry-pick' | 'revert' | 'rebase';

/** Operations that can skip the step they stopped on. */
export const canSkip = (op: Operation) => op !== 'merge';

/**
 * Which operation is stopped in this repository, if any. Each one leaves a marker in the git
 * directory (which is the worktree's own in a linked worktree): a rebase a directory, the others a
 * file. A rebase also leaves CHERRY_PICK_HEAD or MERGE_HEAD while it is stopped on a commit, so it
 * is checked first. One git call finds the directory; the rest are file checks.
 */
export async function operationInProgress(cwd: string): Promise<Operation | null> {
  let gitDir: string;
  try {
    gitDir = (await git(['rev-parse', '--absolute-git-dir'], cwd)).trim();
  } catch {
    return null;
  }
  const has = (name: string) => existsSync(join(gitDir, name));
  if (has('rebase-merge') || has('rebase-apply')) return 'rebase';
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (has('REVERT_HEAD')) return 'revert';
  if (has('MERGE_HEAD')) return 'merge';
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
