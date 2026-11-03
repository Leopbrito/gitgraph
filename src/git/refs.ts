import type {Ref, RefKind} from '../graph/types.js';
import {git} from './exec.js';
import {operationInProgress, type Operation} from './operation.js';
import {loadStashes, type StashEntry} from './stash.js';

/** How the current branch compares with the branch it tracks. */
export interface Upstream {
  /** The tracked branch, e.g. `origin/main`. */
  name: string;
  /** Commits on HEAD that the upstream does not have. */
  ahead: number;
  /** Commits on the upstream that HEAD does not have. */
  behind: number;
}

/** Reads `git rev-list --left-right --count HEAD...@{upstream}` ("2\t3"). */
export function parseAheadBehind(text: string): {ahead: number; behind: number} | null {
  const match = /^(\d+)\s+(\d+)$/.exec(text.trim());
  return match ? {ahead: Number(match[1]), behind: Number(match[2])} : null;
}

export interface RefInfo {
  /** Refs grouped by the hash of the commit they point at. */
  byCommit: Map<string, Ref[]>;
  /** Names in `git remote`; tells `origin/feature/x` (remote `origin`) from a remote called `origin/feature`. */
  remotes?: string[];
  /**
   * HEAD's commit (null in a repository without commits), the current branch
   * (null when detached) and whether a merge is in progress.
   */
  head: {
    hash: string | null;
    branch: string | null;
    merging?: boolean;
    /** Any operation stopped in the repository (a merge, cherry-pick, revert or rebase). */
    operation?: Operation;
    upstream?: Upstream;
  };
}

const FORMAT = '%(objectname)%00%(*objectname)%00%(refname)';

/** Parses the output of `git for-each-ref` in the FORMAT format. */
export function parseRefs(text: string): Map<string, Ref[]> {
  const byCommit = new Map<string, Ref[]>();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const [object, peeled, fullName] = line.split('\0');
    if (!object || !fullName) continue;
    const ref = toRef(fullName);
    if (!ref) continue;
    // Annotated tags point at the tag object; `*objectname` is the commit.
    const hash = peeled || object;
    const list = byCommit.get(hash) ?? [];
    list.push(ref);
    byCommit.set(hash, list);
  }
  return byCommit;
}

function toRef(fullName: string): Ref | null {
  const kinds: [string, RefKind][] = [
    ['refs/heads/', 'branch'],
    ['refs/remotes/', 'remote'],
    ['refs/tags/', 'tag'],
  ];
  for (const [prefix, kind] of kinds) {
    if (!fullName.startsWith(prefix)) continue;
    const name = fullName.slice(prefix.length);
    // refs/remotes/origin/HEAD is just a symbolic pointer.
    if (kind === 'remote' && name.endsWith('/HEAD')) return null;
    return {name, kind};
  }
  return null;
}

/** The commit HEAD points at, or null in a repository without commits. */
export const headHash = (cwd: string): Promise<string | null> =>
  git(['rev-parse', '--verify', '-q', 'HEAD'], cwd).then(
    out => out.trim(),
    () => null,
  );

/** What a caller that also loads the commits can hand over, so the same git command is not run twice. */
export interface Prefetched {
  stashes?: StashEntry[];
  head?: string | null;
}

export async function loadRefs(cwd: string, known: Prefetched = {}): Promise<RefInfo> {
  // Independent questions to git: asked together, since the cost of a reload is mostly starting processes.
  const [refList, hash, branch, stashes, upstream, operation, remotes] = await Promise.all([
    git(['for-each-ref', `--format=${FORMAT}`], cwd),
    known.head !== undefined ? known.head : headHash(cwd),
    git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd).then(
      out => out.trim(),
      () => null,
    ),
    known.stashes ?? loadStashes(cwd),
    // A detached HEAD has no upstream: the command fails and there is none.
    loadUpstream(cwd),
    operationInProgress(cwd),
    git(['remote'], cwd).then(
      out => out.split('\n').filter(name => name !== ''),
      () => [],
    ),
  ]);
  const byCommit = parseRefs(refList);
  // Stashes are not under refs/ with a usable name; each entry gets `stash@{n}`.
  for (const {hash: stashHash, name} of stashes) {
    const list = byCommit.get(stashHash) ?? [];
    list.push({name, kind: 'stash'});
    byCommit.set(stashHash, list);
  }
  return {
    byCommit,
    remotes,
    head: {hash, branch, merging: operation === 'merge', ...(operation && {operation}), ...(branch !== null && upstream && {upstream})},
  };
}

/**
 * The tracked branch and how far apart the two are. A branch with no upstream,
 * or whose upstream was deleted on the remote, simply has none.
 */
async function loadUpstream(cwd: string): Promise<Upstream | undefined> {
  try {
    const [name, counts] = await Promise.all([
      git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd),
      git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd),
    ]);
    const parsed = parseAheadBehind(counts);
    return parsed ? {name: name.trim(), ...parsed} : undefined;
  } catch {
    return undefined;
  }
}

/** Tip commit of each local branch, from the refs grouped by commit. */
export function localBranchTips(byCommit: Map<string, Ref[]>): Map<string, string> {
  const tips = new Map<string, string>();
  for (const [hash, refs] of byCommit) {
    for (const ref of refs) if (ref.kind === 'branch') tips.set(ref.name, hash);
  }
  return tips;
}
