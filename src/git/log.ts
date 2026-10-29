import type {Commit} from '../graph/types.js';
import {git} from './exec.js';
import {parseLog} from './parse.js';
import {loadStashes} from './stash.js';

// hash, pais, autor, email, data, assunto, corpo; campos separados por NUL
// e registros por RS (0x1e).
const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e';

/**
 * How `git log` orders the commits. All of them show no parent before its
 * children, which the layout relies on.
 * - `date` (default): by commit date. Commits of a branch land near the merge
 *   that brought them in, so lanes stay short and the graph narrow.
 * - `author-date`: same, by author date (stable across rebases).
 * - `topo`: keeps each line of history together; branches that merge often
 *   leave many lanes open for a long time.
 */
export const COMMIT_ORDERS = ['date', 'author-date', 'topo'] as const;
export type CommitOrder = (typeof COMMIT_ORDERS)[number];

const ORDER_FLAGS: Record<CommitOrder, string> = {
  date: '--date-order',
  'author-date': '--author-date-order',
  topo: '--topo-order',
};

export interface LogOptions {
  /** Inclui todas as refs (branches, tags, remotos), menos o stash, não só HEAD. */
  all?: boolean;
  /** Revisões de partida (ex.: uma branch); ignorado com `all`. Sem nenhuma, usa HEAD. */
  revs?: string[];
  maxCount?: number;
  /** Commit ordering; defaults to `date`. */
  order?: CommitOrder;
  /**
   * Include the stash entries, each as one node right above its base commit.
   * A stash whose base is not in the list is left out.
   */
  stashes?: boolean;
}

export async function loadCommits(
  cwd: string,
  {all = false, revs = [], maxCount, order = 'date', stashes = false}: LogOptions = {},
): Promise<Commit[]> {
  const args = ['log', ORDER_FLAGS[order], `--format=${LOG_FORMAT}`];
  // O stash guarda commits internos (index, untracked) que poluiriam o grafo.
  if (all) args.push('--exclude=refs/stash', '--all');
  else args.push(...revs);
  if (maxCount !== undefined) args.push(`--max-count=${maxCount}`);
  // Separa revisões de caminhos: uma branch chamada como um arquivo não confunde o git.
  args.push('--');
  try {
    const commits = parseLog(await git(args, cwd));
    return stashes ? await withStashes(cwd, commits) : commits;
  } catch (error) {
    // Repositório recém-criado, sem commits: não é erro.
    if (error instanceof Error && /does not have any commits/.test(error.message)) {
      return [];
    }
    throw error;
  }
}

/**
 * Adds each stash entry as a node whose only parent is the commit the stash
 * was made on. A stash commit also has internal parents (the index, the
 * untracked files); they stay out of the graph, which is why `--all` excludes
 * refs/stash. The node goes immediately above its base commit instead of at
 * its date: that avoids a long lane from the top of the graph down to the
 * base, and keeps the rows already shown stable when more history is loaded.
 */
async function withStashes(cwd: string, commits: Commit[]): Promise<Commit[]> {
  try {
    const entries = await loadStashes(cwd);
    if (entries.length === 0) return commits;
    const read = parseLog(
      await git(
        ['log', '--no-walk=unsorted', `--format=${LOG_FORMAT}`, ...entries.map(e => e.hash), '--'],
        cwd,
      ),
    );
    const byHash = new Map(read.map(commit => [commit.hash, commit]));
    const result = [...commits];
    // Newest first: each one lands directly above the base, below the newer ones.
    for (const {hash} of entries) {
      const stash = byHash.get(hash);
      const base = stash?.parents[0];
      const at = result.findIndex(commit => commit.hash === base);
      if (stash && base && at !== -1) {
        result.splice(at, 0, {...stash, parents: [base], stash: true});
      }
    }
    return result;
  } catch {
    // A broken stash must not hide the real history.
    return commits;
  }
}
