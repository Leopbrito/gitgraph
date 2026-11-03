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

/** Filters equivalent to the `git log` ones; all optional. */
export interface LogFilters {
  /** `--author=<pattern>` (a regular expression, as in git). */
  author?: string;
  /** `--since` / `--until`: any date git understands ("2 weeks ago", "2026-01-31"). */
  since?: string;
  until?: string;
  /** Follow only the first parent of each merge. */
  firstParent?: boolean;
  /** Leave the remote-tracking branches / the tags out of "all refs". */
  hideRemotes?: boolean;
  hideTags?: boolean;
}

/** Short labels of the active filters, for the status bar. */
export function describeFilters(f: LogFilters): string[] {
  return [
    ...(f.author !== undefined ? [`autor ${f.author}`] : []),
    ...(f.since !== undefined ? [`desde ${f.since}`] : []),
    ...(f.until !== undefined ? [`até ${f.until}`] : []),
    ...(f.firstParent ? ['primeiro pai'] : []),
    ...(f.hideRemotes ? ['sem remotas'] : []),
    ...(f.hideTags ? ['sem tags'] : []),
  ];
}

export interface LogOptions extends LogFilters {
  /** Inclui todas as refs (branches, tags, remotos), menos o stash, não só HEAD. */
  all?: boolean;
  /** Revisões de partida (ex.: uma branch); ignorado com `all`. Sem nenhuma, usa HEAD. */
  revs?: string[];
  maxCount?: number;
  /** Only commits that touched these paths (history is simplified; parents are rewritten). */
  paths?: string[];
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
  {all = false, revs = [], maxCount, paths = [], order = 'date', stashes = false, ...filters}: LogOptions = {},
): Promise<Commit[]> {
  const args = ['log', ORDER_FLAGS[order], `--format=${LOG_FORMAT}`];
  // With paths, git drops the commits that did not touch them; --parents makes %P show the
  // surviving parents instead of the original ones, so the layout does not wait for lost commits.
  if (paths.length > 0) args.push('--parents');
  // O stash guarda commits internos (index, untracked) que poluiriam o grafo.
  if (all && (filters.hideRemotes || filters.hideTags)) {
    // `--all` has no way to leave a kind of ref out: list the kinds that stay (HEAD covers a detached one).
    args.push('--branches', ...(filters.hideTags ? [] : ['--tags']), ...(filters.hideRemotes ? [] : ['--remotes']), 'HEAD');
  } else if (all) args.push('--exclude=refs/stash', '--all');
  else args.push(...revs);
  if (filters.author !== undefined) args.push(`--author=${filters.author}`);
  if (filters.since !== undefined) args.push(`--since=${filters.since}`);
  if (filters.until !== undefined) args.push(`--until=${filters.until}`);
  if (filters.firstParent) args.push('--first-parent');
  if (maxCount !== undefined) args.push(`--max-count=${maxCount}`);
  // Separa revisões de caminhos: uma branch chamada como um arquivo não confunde o git.
  args.push('--', ...paths);
  try {
    const commits = relink(parseLog(await git(args, cwd)), filters);
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
 * Makes the parents match what was listed, so the layout does not keep a lane
 * open for a commit that will never arrive. `--first-parent` still prints every
 * parent of a merge, and a commit filtered out by author or date is not
 * replaced by its ancestors in `%P` (only path limiting rewrites parents).
 */
function relink(commits: Commit[], {firstParent, author, since, until}: LogFilters): Commit[] {
  let result = commits;
  if (firstParent) result = result.map(c => ({...c, parents: c.parents.slice(0, 1)}));
  if (author !== undefined || since !== undefined || until !== undefined) {
    const shown = new Set(result.map(c => c.hash));
    result = result.map(c => ({...c, parents: c.parents.filter(p => shown.has(p))}));
  }
  return result;
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
