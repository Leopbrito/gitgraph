import type {Ref} from '../graph/types.js';

export interface Label {
  text: string;
  color: 'green' | 'red' | 'yellow' | 'cyan' | 'magenta';
}

export interface HeadInfo {
  /** O commit é o HEAD atual. */
  isHead: boolean;
  /** Branch atual (null com HEAD destacado). */
  branch: string | null;
}

/** Etiquetas de refs de um commit: HEAD primeiro, depois branches, remotos e tags. */
export function formatRefs(refs: Ref[], head: HeadInfo): Label[] {
  const labels: Label[] = [];
  if (head.isHead) {
    labels.push({
      text: head.branch ? `HEAD -> ${head.branch}` : 'HEAD',
      color: 'cyan',
    });
  }
  for (const ref of refs.filter(r => r.kind === 'branch')) {
    if (head.isHead && ref.name === head.branch) continue;
    labels.push({text: ref.name, color: 'green'});
  }
  for (const ref of refs.filter(r => r.kind === 'remote')) {
    labels.push({text: ref.name, color: 'red'});
  }
  for (const ref of refs.filter(r => r.kind === 'tag')) {
    labels.push({text: `tag: ${ref.name}`, color: 'yellow'});
  }
  for (const ref of refs.filter(r => r.kind === 'stash')) {
    labels.push({text: ref.name, color: 'magenta'});
  }
  return labels;
}

/** Where HEAD is, for the header: the branch, or the commit when detached. */
export function headLabel(head: {hash: string | null; branch: string | null; merging?: boolean}): string {
  const where = head.branch ?? (head.hash ? `HEAD destacado em ${head.hash.slice(0, 7)}` : 'sem commits');
  return head.merging ? `${where} (merge em andamento)` : where;
}
