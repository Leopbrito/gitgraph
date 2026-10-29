import {git} from './exec.js';

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
