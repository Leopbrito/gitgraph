import {watch, type FSWatcher} from 'node:fs';
import {join} from 'node:path';
import {git} from './exec.js';

/** Where "the repository changed" events come from; injected into the Browser like `load`. */
export interface ChangeSource {
  subscribe(listener: () => void): () => void;
}

export interface RepositoryWatch {
  source: ChangeSource;
  close: () => void;
}

/**
 * Files in the git directory whose change moves the graph: HEAD, the index, packed refs and the
 * markers of an operation in progress (see `operationInProgress`). The markers matter because
 * `--quit` drops them without touching anything else, and the header would keep saying
 * "em andamento".
 */
const WATCHED_FILES = new Set([
  'HEAD',
  'index',
  'packed-refs',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'rebase-merge',
  'rebase-apply',
]);

/** Wait this long after the last change: one git command touches several files. */
export const DEBOUNCE_MS = 300;

/**
 * Watches what moves the graph: HEAD, the index and packed-refs in the git
 * directory, and everything under refs/ (in the common directory, which is
 * not the git directory in a linked worktree). Events are debounced.
 */
export async function watchRepository(cwd: string, debounceMs = DEBOUNCE_MS): Promise<RepositoryWatch> {
  const [gitDir, commonDir] = (
    await git(['rev-parse', '--absolute-git-dir', '--path-format=absolute', '--git-common-dir'], cwd)
  )
    .trim()
    .split('\n');
  if (!gitDir || !commonDir) throw new Error('não foi possível localizar o diretório .git');

  const listeners = new Set<() => void>();
  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => listeners.forEach(listener => listener()), debounceMs);
  };

  const watchers: FSWatcher[] = [];
  const add = (path: string, options: {recursive?: boolean}, accept: (file: string | null) => boolean) => {
    // A missing path (no refs/ in a bare layout) or an unsupported recursive watch only costs the live reload.
    try {
      const watcher = watch(path, options, (_, file) => {
        if (accept(file)) changed();
      });
      watcher.on('error', () => {});
      watchers.push(watcher);
    } catch {
      // see above
    }
  };
  const named = (file: string | null) => file === null || WATCHED_FILES.has(file);
  add(gitDir, {}, named);
  if (commonDir !== gitDir) add(commonDir, {}, named);
  add(join(commonDir, 'refs'), {recursive: true}, () => true);

  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    close() {
      clearTimeout(timer);
      watchers.forEach(w => w.close());
      listeners.clear();
    },
  };
}
