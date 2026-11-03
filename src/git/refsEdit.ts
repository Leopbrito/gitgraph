import {git} from './exec.js';

export type RefKindEditable = 'branch' | 'tag';

/** `git branch -d` refused: the branch has commits no other ref has. */
export class UnmergedBranchError extends Error {
  constructor(readonly branch: string) {
    super(`a branch ${branch} não foi mesclada`);
  }
}

/** Create, rename and delete branches and tags; injected into the UI like `load`. */
export interface RefActions {
  /** Why `name` cannot be used for a new ref of this kind (invalid or already taken), or null if it can. */
  validate(kind: RefKindEditable, name: string): Promise<string | null>;
  createBranch(name: string, hash: string): Promise<void>;
  /** With a message the tag is annotated. */
  createTag(name: string, hash: string, message?: string): Promise<void>;
  renameBranch(from: string, to: string): Promise<void>;
  renameTag(from: string, to: string): Promise<void>;
  /** Safe delete; throws `UnmergedBranchError` instead of losing commits unless `force`. */
  deleteBranch(name: string, force: boolean): Promise<void>;
  deleteTag(name: string): Promise<void>;
  /** Commits that only this branch has (what a forced delete would lose). */
  uniqueCommits(branch: string): Promise<number>;
}

const fullName = (kind: RefKindEditable, name: string) => `refs/${kind === 'branch' ? 'heads' : 'tags'}/${name}`;

export function gitRefActions(cwd: string): RefActions {
  const exists = (ref: string) =>
    git(['show-ref', '--verify', '--quiet', ref], cwd).then(
      () => true,
      () => false,
    );
  return {
    async validate(kind, name) {
      if (name === 'HEAD' || name.startsWith('-')) return `"${name}" não é um nome válido`;
      const valid = await git(['check-ref-format', kind === 'branch' ? '--branch' : fullName(kind, name), ...(kind === 'branch' ? [name] : [])], cwd).then(
        () => true,
        () => false,
      );
      if (!valid) return `"${name}" não é um nome válido (sem espaços, "..", "~", "^", ":" nem terminar em ".lock")`;
      if (await exists(fullName(kind, name))) return `já existe ${kind === 'branch' ? 'uma branch' : 'uma tag'} chamada ${name}`;
      return null;
    },
    async createBranch(name, hash) {
      await git(['branch', '--', name, hash], cwd);
    },
    async createTag(name, hash, message) {
      await git(message === undefined ? ['tag', '--', name, hash] : ['tag', '-a', '-m', message, '--', name, hash], cwd);
    },
    async renameBranch(from, to) {
      await git(['branch', '-m', '--', from, to], cwd);
    },
    async renameTag(from, to) {
      // `git tag to from` points the new tag at the same object (the tag object, if annotated), keeping the message.
      await git(['tag', '--', to, fullName('tag', from)], cwd);
      await git(['tag', '-d', from], cwd);
    },
    async deleteBranch(name, force) {
      try {
        await git(['branch', force ? '-D' : '-d', '--', name], cwd);
      } catch (error) {
        if (!force && error instanceof Error && /not fully merged/i.test(error.message)) throw new UnmergedBranchError(name);
        throw error;
      }
    },
    async deleteTag(name) {
      await git(['tag', '-d', name], cwd);
    },
    async uniqueCommits(branch) {
      // The other refs are expanded by git (see resetPreview in history.ts), not listed as arguments.
      const count = await git(
        ['rev-list', '--count', fullName('branch', branch), '--not', `--exclude=${branch}`, '--branches', '--remotes', '--tags'],
        cwd,
      );
      return Number(count.trim());
    },
  };
}
