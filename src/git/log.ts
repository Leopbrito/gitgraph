import type {Commit} from '../graph/types.js';
import {git} from './exec.js';
import {parseLog} from './parse.js';

// hash, pais, autor, email, data, assunto, corpo; campos separados por NUL
// e registros por RS (0x1e).
const LOG_FORMAT = '%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e';

export interface LogOptions {
  /** Inclui todas as refs (branches, tags, remotos), não só HEAD. */
  all?: boolean;
  maxCount?: number;
}

export async function loadCommits(
  cwd: string,
  {all = false, maxCount}: LogOptions = {},
): Promise<Commit[]> {
  const args = ['log', '--topo-order', `--format=${LOG_FORMAT}`];
  if (all) args.push('--all');
  if (maxCount !== undefined) args.push(`--max-count=${maxCount}`);
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
