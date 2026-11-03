import {git} from './exec.js';

/**
 * The names inside a revision argument: `a..b`, `a...b` and `^a` hold plain
 * revisions, and `rev^!`, `rev^@` and `rev^-<n>` are shorthands built on one
 * (`^` cannot appear in a ref name, so the suffix is never part of it).
 */
export function revisionNames(arg: string): string[] {
  return arg
    .replace(/^\^/, '')
    .split(/\.{2,3}/)
    .map(name => name.replace(/\^(?:[!@]|-\d*)$/, ''))
    .filter(name => name !== '');
}

/**
 * Fails with a clear message when a command line revision does not name a
 * commit. Without this, git's own error mentions "ambiguous argument" and
 * blames a missing `--`, which is not what the user typed wrong.
 */
export async function verifyRevisions(cwd: string, revs: string[]): Promise<void> {
  for (const name of revs.flatMap(revisionNames)) {
    try {
      await git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${name}^{commit}`], cwd);
    } catch (error) {
      // `--quiet` makes an unknown revision exit 1 with no stderr, so exec.ts falls back to the
      // generic "Command failed"; other failures (not a repository, no git) keep their message.
      if (error instanceof Error && error.message.startsWith('Command failed:')) {
        throw new Error(`unknown revision: ${name} (to filter by path, use -- <path>)`);
      }
      throw error;
    }
  }
}
