import {git} from './exec.js';
import {conflictedFiles} from './merge.js';
import {operationInProgress, type Operation} from './operation.js';
import {loadWorkingTree} from './status.js';

export type ResetMode = 'soft' | 'mixed' | 'hard';

/** What a reset to a commit would do, shown before asking for confirmation. */
export interface ResetPreview {
  /** Commits on HEAD that the target does not have: they leave the branch. */
  ahead: number;
  /** Those among them that no other ref reaches, so only the reflog would still have them. */
  orphaned: number;
  /** Tracked files with changes (staged or not) that `--hard` would throw away. */
  changed: number;
}

/** The cherry-pick or revert stopped (conflicts, or an empty result) and is left in progress. */
export class OperationStoppedError extends Error {
  constructor(
    readonly operation: Operation,
    readonly files: string[],
  ) {
    super(files.length > 0 ? `conflitos em ${files.join(', ')}` : `${operation} parado`);
  }
}

/** Cherry-pick, revert and reset; injected into the UI like `load`. */
export interface HistoryActions {
  /** `mainline` is for a merge commit: it is applied relative to its first parent. */
  cherryPick(hash: string, mainline: boolean): Promise<void>;
  revert(hash: string, mainline: boolean): Promise<void>;
  resetPreview(target: string): Promise<ResetPreview>;
  reset(mode: ResetMode, target: string): Promise<void>;
}

export function gitHistoryActions(cwd: string): HistoryActions {
  /** Runs a command that may stop in the middle; a stop is reported with the conflicted files. */
  const step = async (args: string[]) => {
    try {
      await git(args, cwd);
    } catch (error) {
      const operation = await operationInProgress(cwd);
      if (operation) throw new OperationStoppedError(operation, await conflictedFiles(cwd).catch(() => []));
      throw error;
    }
  };
  const count = async (...args: string[]) => Number((await git(['rev-list', '--count', ...args], cwd)).trim());
  return {
    cherryPick: (hash, mainline) => step(['cherry-pick', ...(mainline ? ['-m', '1'] : []), hash]),
    // --no-edit: there is no editor in the TUI; the message is git's ("Revert ...").
    revert: (hash, mainline) => step(['revert', '--no-edit', ...(mainline ? ['-m', '1'] : []), hash]),
    async resetPreview(target) {
      const ahead = await count(`${target}..HEAD`);
      // Reachable from HEAD but from neither the target nor any other branch, remote or tag. Git
      // expands the refs itself (--branches and friends): listing them here could pass the OS limit
      // on the size of the arguments in a repository with tens of thousands of tags.
      const current = (await git(['symbolic-ref', '-q', 'HEAD'], cwd).catch(() => '')).trim();
      const exclude = current.startsWith('refs/heads/') ? [`--exclude=${current.slice('refs/heads/'.length)}`] : [];
      const orphaned = await count('HEAD', '--not', target, ...exclude, '--branches', '--remotes', '--tags');
      const tree = await loadWorkingTree(cwd);
      return {ahead, orphaned, changed: tree ? tree.staged + tree.modified + tree.conflicted : 0};
    },
    async reset(mode, target) {
      await git(['reset', `--${mode}`, target], cwd);
    },
  };
}
