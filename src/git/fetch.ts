import {summarizeGitError} from './checkout.js';
import {git} from './exec.js';

// Errors that mean git needed to ask for a credential and was not allowed to.
const AUTH = /terminal prompts disabled|could not read (Username|Password)|Authentication failed|Permission denied \(publickey|Host key verification failed|publickey/i;

/**
 * `git fetch --all --prune` without terminal prompts (see `GitOptions.network`).
 * Rejects with a one-line reason; an authentication failure says what to set up.
 */
export async function fetchAll(cwd: string): Promise<void> {
  try {
    await git(['fetch', '--all', '--prune'], cwd, {network: true});
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const reason = summarizeGitError(raw);
    throw new Error(
      AUTH.test(raw) ? `${reason} (as credenciais precisam estar disponíveis sem prompt: ssh-agent ou credential helper)` : reason,
    );
  }
}
