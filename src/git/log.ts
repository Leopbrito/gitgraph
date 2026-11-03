import type {Commit} from '../graph/types.js';
import {git, gitStream} from './exec.js';
import {LOG_FIELDS, parseLog} from './parse.js';
import {loadStashes} from './stash.js';
import {loadWorkingTree, uncommittedNode} from './status.js';

// hash, parents, author, email, date, subject, body. Used with `git log -z`, so every
// field is NUL-delimited: a commit message cannot contain NUL, but it may hold any other byte.
export const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b';

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
  /**
   * Show the uncommitted changes as a node right above HEAD (and above its stashes), only when
   * there are changes and HEAD is in the list.
   */
  uncommitted?: boolean;
}

/** The arguments of `git log` for these options. */
function logArgs(
  {all = false, revs = [], maxCount, paths = [], order = 'date', ...filters}: LogOptions,
): string[] {
  const args = ['log', '-z', ORDER_FLAGS[order], `--format=${LOG_FORMAT}`];
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
  return args;
}

/** Commits parsed from the output of `git log -z` as it arrives, without holding the whole output. */
async function* streamLog(args: string[], cwd: string): AsyncGenerator<Commit, void, undefined> {
  let pending = '';
  let fields: string[] = [];
  for await (const chunk of gitStream(args, cwd)) {
    pending += chunk;
    const parts = pending.split('\0');
    pending = parts.pop() ?? '';
    for (const part of parts) {
      fields.push(part);
      if (fields.length === LOG_FIELDS) {
        yield parseLog(fields.join('\0') + '\0')[0] as Commit;
        fields = [];
      }
    }
  }
  if (fields.length > 0 || pending !== '') {
    throw new Error(`Registro de commit inválido: ${JSON.stringify(fields.join('\0') + pending)}`);
  }
}

/**
 * The commits one at a time, as `git log` prints them, with the stashes and the
 * uncommitted changes inserted where `loadCommits` puts them. Memory stays flat
 * for a long history, except with `--author`, `--since` or `--until`, whose
 * parents can only be fixed once every commit is known (see `relink`).
 */
export async function* streamCommits(
  cwd: string,
  options: LogOptions = {},
): AsyncGenerator<Commit, void, undefined> {
  const {stashes = false, uncommitted = false, author, since, until, firstParent} = options;
  const needsAll = author !== undefined || since !== undefined || until !== undefined;
  let source: AsyncIterable<Commit> = streamLog(logArgs(options), cwd);
  if (firstParent) source = mapParents(source, parents => parents.slice(0, 1));
  if (needsAll) source = buffered(source);

  const stashed = stashes ? await stashNodes(cwd) : new Map<string, Commit[]>();
  const working = uncommitted ? await workingNode(cwd) : undefined;
  try {
    for await (const commit of source) {
      // Above the commit they belong to: the changes first, then the stashes (newest first).
      if (working && commit.hash === working.parents[0]) yield working;
      for (const node of stashed.get(commit.hash) ?? []) yield node;
      yield commit;
    }
  } catch (error) {
    // Repositório recém-criado, sem commits: não é erro.
    if (error instanceof Error && /does not have any commits/.test(error.message)) return;
    throw error;
  }
}

export async function loadCommits(cwd: string, options: LogOptions = {}): Promise<Commit[]> {
  const commits: Commit[] = [];
  for await (const commit of streamCommits(cwd, options)) commits.push(commit);
  return commits;
}

async function* mapParents(source: AsyncIterable<Commit>, map: (parents: string[]) => string[]) {
  for await (const commit of source) yield {...commit, parents: map(commit.parents)};
}

/**
 * Reads everything, then drops the parents that are not in the list: a commit
 * filtered out by author or date is not replaced by its ancestors in `%P`
 * (only path limiting rewrites parents), so the layout would keep a lane open
 * for a commit that never arrives.
 */
async function* buffered(source: AsyncIterable<Commit>) {
  const all: Commit[] = [];
  for await (const commit of source) all.push(commit);
  const shown = new Set(all.map(c => c.hash));
  for (const commit of all) yield {...commit, parents: commit.parents.filter(p => shown.has(p))};
}

/**
 * The uncommitted changes as one node whose parent is HEAD, placed right above
 * it like a stash (a node at the very top would open a long lane down to HEAD
 * when HEAD is not the newest commit). Failing to read the status must not hide
 * the history.
 */
async function workingNode(cwd: string): Promise<Commit | undefined> {
  try {
    const head = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd)).trim();
    const tree = await loadWorkingTree(cwd);
    return tree ? uncommittedNode(tree, head) : undefined;
  } catch {
    // No HEAD yet (empty repository) or git failed.
    return undefined;
  }
}

/**
 * Each stash entry as a node whose only parent is the commit the stash was
 * made on, keyed by that commit. A stash commit also has internal parents (the
 * index, the untracked files); they stay out of the graph, which is why `--all`
 * excludes refs/stash. The node goes immediately above its base commit instead
 * of at its date: that avoids a long lane from the top of the graph down to the
 * base, and keeps the rows already shown stable when more history is loaded.
 * Several stashes on one base stay newest first. A stash whose base never shows
 * up in the list is left out.
 */
async function stashNodes(cwd: string): Promise<Map<string, Commit[]>> {
  const byBase = new Map<string, Commit[]>();
  try {
    const entries = await loadStashes(cwd);
    if (entries.length === 0) return byBase;
    const read = parseLog(
      await git(
        ['log', '-z', '--no-walk=unsorted', `--format=${LOG_FORMAT}`, ...entries.map(e => e.hash), '--'],
        cwd,
      ),
    );
    const byHash = new Map(read.map(commit => [commit.hash, commit]));
    for (const {hash} of entries) {
      const stash = byHash.get(hash);
      const base = stash?.parents[0];
      if (!stash || !base) continue;
      byBase.set(base, [...(byBase.get(base) ?? []), {...stash, parents: [base], stash: true}]);
    }
  } catch {
    // A broken stash must not hide the real history.
  }
  return byBase;
}
