import type {Ref} from '../graph/types.js';
import type {RefKindEditable} from '../git/refsEdit.js';

export type RefMode = 'branch' | 'tag' | 'annotated' | 'rename' | 'delete';

export interface RefTarget {
  kind: RefKindEditable;
  name: string;
}

/**
 * The refs on a commit that can be renamed or deleted: local branches and tags. Remote branches
 * are not ours to edit, and the current branch cannot be deleted (git refuses). Branches first.
 */
export function refTargets(refs: Ref[], mode: 'rename' | 'delete', currentBranch: string | null): RefTarget[] {
  const targets: RefTarget[] = [];
  for (const kind of ['branch', 'tag'] as const) {
    for (const ref of refs) {
      if (ref.kind !== kind) continue;
      if (mode === 'delete' && kind === 'branch' && ref.name === currentBranch) continue;
      targets.push({kind, name: ref.name});
    }
  }
  return targets;
}

export const describeTarget = (t: RefTarget) => `${t.kind === 'branch' ? 'branch' : 'tag'} ${t.name}`;
