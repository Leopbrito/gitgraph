import type {Ref, RefKind} from '../graph/types.js';
import {git} from './exec.js';

export interface RefInfo {
  /** Refs agrupadas pelo hash do commit apontado. */
  byCommit: Map<string, Ref[]>;
  /** Commit de HEAD (null em repositório sem commits) e branch atual (null se destacado). */
  head: {hash: string | null; branch: string | null};
}

const FORMAT = '%(objectname)%00%(*objectname)%00%(refname)';

/** Interpreta a saída de `git for-each-ref` no formato FORMAT. */
export function parseRefs(text: string): Map<string, Ref[]> {
  const byCommit = new Map<string, Ref[]>();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const [object, peeled, fullName] = line.split('\0');
    if (!object || !fullName) continue;
    const ref = toRef(fullName);
    if (!ref) continue;
    // Tags anotadas apontam para o objeto tag; `*objectname` é o commit.
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
    // refs/remotes/origin/HEAD é só um ponteiro simbólico.
    if (kind === 'remote' && name.endsWith('/HEAD')) return null;
    return {name, kind};
  }
  return null;
}

export async function loadRefs(cwd: string): Promise<RefInfo> {
  const byCommit = parseRefs(
    await git(['for-each-ref', `--format=${FORMAT}`], cwd),
  );
  const hash = await git(['rev-parse', '--verify', '-q', 'HEAD'], cwd)
    .then(out => out.trim())
    .catch(() => null);
  const branch = await git(['symbolic-ref', '--short', '-q', 'HEAD'], cwd)
    .then(out => out.trim())
    .catch(() => null);
  return {byCommit, head: {hash, branch}};
}

/** Tip commit of each local branch, from the refs grouped by commit. */
export function localBranchTips(byCommit: Map<string, Ref[]>): Map<string, string> {
  const tips = new Map<string, string>();
  for (const [hash, refs] of byCommit) {
    for (const ref of refs) if (ref.kind === 'branch') tips.set(ref.name, hash);
  }
  return tips;
}
