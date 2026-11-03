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
      const [type = '', target = '', name = '', email = '', date = '', subject = '', body = '', signature = ''] = (
        await git(
          [
            'for-each-ref',
            '--format=%(objecttype)%00%(*objectname)%00%(taggername)%00%(taggeremail)%00%(taggerdate:raw)%00%(contents:subject)%00%(contents:body)%00%(contents:signature)',
            fullName('tag', from),
          ],
          cwd,
        )
      ).split('\0');
      if (type === 'tag') {
        // An annotated tag records its own name, so a second ref to the same tag object would be
        // "externally known as" the old name (git warns). Make a new tag object with the same message
        // and tagger instead. A signature covers the name, so it cannot be carried over.
        if (signature.trim() !== '') throw new Error(`a tag ${from} é assinada: renomear perderia a assinatura; recrie-a no terminal`);
        const message = body.trim() === '' ? subject.trim() : `${subject.trim()}\n\n${body.trim()}`;
        const tagger = {GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email.replace(/^<|>$/g, ''), GIT_COMMITTER_DATE: date};
        await git(['tag', '-a', '-m', message, '--', to, target], cwd, {env: tagger});
      } else {
        await git(['tag', '--', to, fullName('tag', from)], cwd);
      }
      try {
        await git(['tag', '-d', from], cwd);
      } catch (error) {
        // Do not leave both tags behind: the rename did not happen.
        await git(['tag', '-d', to], cwd).catch(() => {});
        throw error;
      }
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
