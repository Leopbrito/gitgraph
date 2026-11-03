import type {GraphRow} from '../graph/types.js';
import {clamp} from './viewport.js';

/**
 * Where the selected commit is after a reload. The same hash if it is still
 * listed; otherwise its nearest ancestor that is (a branch was reset or
 * deleted, the history was rewritten); otherwise the same position.
 */
export function followCommit(previous: GraphRow[], selected: number, next: GraphRow[]): number {
  const position = new Map(next.map((row, i) => [row.commit.hash, i]));
  const byHash = new Map(previous.map(row => [row.commit.hash, row.commit]));
  const seen = new Set<string>();
  let current = previous[selected]?.commit;
  while (current && !seen.has(current.hash)) {
    seen.add(current.hash);
    const here = position.get(current.hash);
    if (here !== undefined) return here;
    const known = current.parents.find(p => position.has(p));
    if (known !== undefined) return position.get(known) ?? 0;
    current = current.parents.map(p => byHash.get(p)).find(c => c !== undefined);
  }
  return clamp(selected, 0, Math.max(0, next.length - 1));
}
