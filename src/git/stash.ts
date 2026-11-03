import {git} from './exec.js';
import {conflictedFiles} from './merge.js';

export interface StashEntry {
  hash: string;
  /** `stash@{0}` is the newest. */
  name: string;
}

/** Reads `git stash list --format=%H%x00%gd`. */
export function parseStashList(text: string): StashEntry[] {
  const entries: StashEntry[] = [];
  for (const line of text.split('\n')) {
    const [hash, name] = line.split('\0');
    if (hash && name) entries.push({hash, name});
  }
  return entries;
}

/**
 * The stash entries, newest first. A stash that cannot be read must not take
 * the whole graph down, so failures just mean "no stashes".
 */
export async function loadStashes(cwd: string): Promise<StashEntry[]> {
  try {
    return parseStashList(await git(['stash', 'list', '--format=%H%x00%gd'], cwd));
  } catch {
    return [];
  }
}

export type StashOp = 'apply' | 'pop' | 'drop';

/** apply/pop hit conflicts: the changes are in the working tree with markers and the stash is kept. */
export class StashConflictError extends Error {
  constructor(
    readonly op: 'apply' | 'pop',
    readonly name: string,
    readonly files: string[],
  ) {
    super(`conflitos ao aplicar ${name} em ${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}`);
  }
}

// git refuses to apply over local changes to the same files, or over untracked files in the way.
const BLOCKED = /would be overwritten|already exists, no checkout|Please commit or stash them|Cannot (?:apply|restore)/i;

/**
 * Runs `git stash apply|pop|drop` on the stash with this commit hash. Stash names
 * (`stash@{n}`) shift whenever one is added or removed, even from another
 * terminal, so the name is looked up now from the hash; if the stash is gone it
 * fails instead of touching a different one. Conflicts leave the working tree
 * with markers and throw `StashConflictError`; a refusal because local changes
 * are in the way changes nothing and says so.
 */
export async function runStash(cwd: string, op: StashOp, hash: string): Promise<string> {
  const entry = (await loadStashes(cwd)).find(e => e.hash === hash);
  if (!entry) throw new Error('esse stash não existe mais (foi aplicado ou apagado em outro lugar); aperte r');
  try {
    await git(['stash', op, entry.name], cwd);
  } catch (error) {
    if (op !== 'drop') {
      const files = await conflictedFiles(cwd).catch(() => []);
      if (files.length > 0) throw new StashConflictError(op, entry.name, files);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (BLOCKED.test(message)) {
      throw new Error(`as alterações locais atrapalham: faça commit ou stash delas antes de ${op === 'pop' ? 'dar pop' : 'aplicar'} ${entry.name}`);
    }
    throw error;
  }
  return entry.name;
}
