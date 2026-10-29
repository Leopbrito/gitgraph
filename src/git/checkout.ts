import type {Ref} from '../graph/types.js';
import {git} from './exec.js';
import type {RefInfo} from './refs.js';

export type CheckoutTarget =
  /** `unsynced`: the local branch is not at the selected commit (its remote is). */
  | {kind: 'branch'; name: string; unsynced?: true}
  | {kind: 'detach'; hash: string}
  /** Switch to the local branch, then `git pull --ff-only <remote> <name>`. */
  | {kind: 'pull'; name: string; remote: string};

/**
 * Where a checkout of this commit can go.
 *
 * Normally: the local branches whose tip it is, or a detached HEAD when no
 * local branch points at it. When the commit is the tip of a remote branch
 * (`origin/x`) whose local branch `x` sits at another commit, the options are:
 * switch to `x` and pull, switch to `x` as it is, or a detached HEAD here.
 * Remote-only tips with no local branch end up detached.
 *
 * `tips` maps each local branch to its tip commit (see `localBranchTips`).
 */
export function checkoutTargets(
  hash: string,
  refs: Ref[],
  tips: ReadonlyMap<string, string>,
): CheckoutTarget[] {
  const byName = (a: string, b: string) => a.localeCompare(b);
  const here = refs
    .filter(ref => ref.kind === 'branch')
    .map(ref => ref.name)
    .sort(byName);

  const pulls: {name: string; remote: string}[] = [];
  for (const ref of refs.filter(r => r.kind === 'remote').map(r => r.name).sort(byName)) {
    const pair = localCounterpart(ref, tips);
    if (pair && tips.get(pair.name) !== hash) pulls.push(pair);
  }

  if (pulls.length === 0) {
    return here.length > 0
      ? here.map(name => ({kind: 'branch', name}))
      : [{kind: 'detach', hash}];
  }
  const unsynced = [...new Set(pulls.map(p => p.name))].sort(byName);
  return [
    ...pulls.map(p => ({kind: 'pull', ...p}) as const),
    ...here.map(name => ({kind: 'branch', name}) as const),
    ...unsynced.map(name => ({kind: 'branch', name, unsynced: true}) as const),
    {kind: 'detach', hash},
  ];
}

/**
 * The local branch a remote ref `remote/branch` corresponds to. The remote
 * name is what comes before the first slash that leaves an existing local
 * branch, so branch names containing slashes (`origin/feature/x`) work.
 */
function localCounterpart(
  remoteRef: string,
  tips: ReadonlyMap<string, string>,
): {name: string; remote: string} | null {
  for (let i = remoteRef.indexOf('/'); i !== -1; i = remoteRef.indexOf('/', i + 1)) {
    const name = remoteRef.slice(i + 1);
    if (tips.has(name)) return {name, remote: remoteRef.slice(0, i)};
  }
  return null;
}

/** Whether HEAD is already at the target (same branch, or detached on that commit). */
export function isCurrent(target: CheckoutTarget, head: RefInfo['head']): boolean {
  if (target.kind === 'pull') return false; // there is always something to pull
  return target.kind === 'branch'
    ? head.branch === target.name
    : head.branch === null && head.hash === target.hash;
}

/** Short description for notices ("agora em ..."). */
export function describeTarget(target: CheckoutTarget): string {
  switch (target.kind) {
    case 'branch':
      return target.name;
    case 'pull':
      return `${target.name} (atualizada de ${target.remote}/${target.name})`;
    case 'detach':
      return `${target.hash.slice(0, 7)} (HEAD destacado)`;
  }
}

/** Label of an option in the prompt list. */
export function describeOption(target: CheckoutTarget): string {
  switch (target.kind) {
    case 'branch':
      return target.unsynced ? `${target.name} (sem pull)` : target.name;
    case 'pull':
      return `${target.name} e pull de ${target.remote}/${target.name}`;
    case 'detach':
      return `${target.hash.slice(0, 7)} (HEAD destacado neste commit)`;
  }
}

/**
 * The reason in git's stderr, without the noise `git pull` prints around it:
 * the fetch summary ("From ...", " * branch ... -> FETCH_HEAD", ref updates)
 * and the "hint:" paragraphs.
 */
export function summarizeGitError(message: string): string {
  const noise = [/^From /, /^hint:/, /^\s*[*+]\s/, /^\s*[0-9a-f]{7,}\.{2,3}[0-9a-f]{7,}\s/];
  const kept = message
    .split('\n')
    .filter(line => line.trim() !== '' && !noise.some(pattern => pattern.test(line)));
  const reason = kept.join(' ').replace(/\s+/g, ' ').replace(/^(fatal|error): /i, '').trim();
  return reason === '' ? message.trim() : reason;
}

/** The switch worked but the pull did not: the repository did change. */
export class PartialCheckoutError extends Error {}

/**
 * Never forces: git itself refuses when local changes would be overwritten or
 * when the branch is checked out in another worktree, and that message is the
 * rejection reason. The pull only fast-forwards, so it never merges or rebases.
 */
export async function checkout(cwd: string, target: CheckoutTarget): Promise<void> {
  if (target.kind === 'detach') {
    await git(['switch', '--detach', target.hash], cwd);
    return;
  }
  await git(['switch', target.name], cwd);
  if (target.kind === 'pull') {
    try {
      await git(['pull', '--ff-only', target.remote, target.name], cwd, {network: true});
    } catch (error) {
      const reason = summarizeGitError(error instanceof Error ? error.message : String(error));
      throw new PartialCheckoutError(
        `checkout feito para ${target.name}, mas o pull falhou: ${reason}`,
      );
    }
  }
}
