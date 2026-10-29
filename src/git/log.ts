import type {Commit} from '../graph/types.js';
import {git} from './exec.js';
import {parseLog} from './parse.js';

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

export interface LogOptions {
  /** Inclui todas as refs (branches, tags, remotos), menos o stash, não só HEAD. */
  all?: boolean;
  /** Revisões de partida (ex.: uma branch); ignorado com `all`. Sem nenhuma, usa HEAD. */
  revs?: string[];
  maxCount?: number;
  /** Commit ordering; defaults to `date`. */
  order?: CommitOrder;
}

export async function loadCommits(
  cwd: string,
  {all = false, revs = [], maxCount, order = 'date'}: LogOptions = {},
): Promise<Commit[]> {
  const args = ['log', ORDER_FLAGS[order], `--format=${LOG_FORMAT}`];
  // O stash guarda commits internos (index, untracked) que poluiriam o grafo.
  if (all) args.push('--exclude=refs/stash', '--all');
  else args.push(...revs);
  if (maxCount !== undefined) args.push(`--max-count=${maxCount}`);
  // Separa revisões de caminhos: uma branch chamada como um arquivo não confunde o git.
  args.push('--');
  try {
    return parseLog(await git(args, cwd));
  } catch (error) {
    // Repositório recém-criado, sem commits: não é erro.
    if (error instanceof Error && /does not have any commits/.test(error.message)) {
      return [];
    }
    throw error;
  }
}
