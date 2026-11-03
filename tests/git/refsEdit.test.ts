import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {gitRefActions, UnmergedBranchError} from '../../src/git/refsEdit.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  r.run('commit', '--allow-empty', '-q', '-m', 'one');
  const first = r.run('rev-parse', 'HEAD');
  r.run('commit', '--allow-empty', '-q', '-m', 'two');
  return {...r, first, actions: gitRefActions(r.dir)};
}

describe('validate', () => {
  it('accepts a good name and rejects invalid or taken ones', async () => {
    const {actions, run} = repo();
    run('tag', 'v1');
    expect(await actions.validate('branch', 'feature/login')).toBeNull();
    expect(await actions.validate('tag', 'v2.0')).toBeNull();
    for (const bad of ['has space', 'a..b', 'x~1', 'a:b', 'end.lock', '-dash', 'HEAD', '@{', '/lead']) {
      expect(await actions.validate('branch', bad), bad).toMatch(/is not a valid name/);
    }
    expect(await actions.validate('branch', 'main')).toBe('a branch named main already exists');
    expect(await actions.validate('tag', 'v1')).toBe('a tag named v1 already exists');
    // A branch and a tag may share a name.
    expect(await actions.validate('tag', 'main')).toBeNull();
  });
});

describe('create', () => {
  it('creates a branch at the given commit without switching to it', async () => {
    const {actions, run, first} = repo();
    await actions.createBranch('old', first);
    expect(run('rev-parse', 'old')).toBe(first);
    expect(run('branch', '--show-current')).toBe('main');
  });

  it('creates a lightweight tag and an annotated one', async () => {
    const {actions, run, first} = repo();
    await actions.createTag('light', first);
    expect(run('cat-file', '-t', 'light')).toBe('commit');
    await actions.createTag('noted', first, 'release one');
    expect(run('cat-file', '-t', 'noted')).toBe('tag');
    expect(run('tag', '-n1', 'noted')).toContain('release one');
    expect(run('rev-parse', 'noted^{commit}')).toBe(first);
  });
});

describe('rename', () => {
  it('renames a branch, including the current one', async () => {
    const {actions, run} = repo();
    run('branch', 'topic');
    await actions.renameBranch('topic', 'topic2');
    expect(run('branch', '--list', 'topic2')).toContain('topic2');
    await actions.renameBranch('main', 'trunk');
    expect(run('branch', '--show-current')).toBe('trunk');
  });

  it('renames an annotated tag into a new tag object: same message and tagger, no describe warning', async () => {
    const {actions, run, dir, first} = repo();
    run('config', 'user.name', 'Someone Else');
    execFileSync('git', ['tag', '-a', 'v1', '-m', 'first release\n\nwith a body', first], {
      cwd: dir,
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: 'Tagger',
        GIT_COMMITTER_EMAIL: 'tagger@example.com',
        GIT_COMMITTER_DATE: '1700000000 +0100',
      },
    });
    await actions.renameTag('v1', 'v1.0');
    expect(run('tag', '--list')).toBe('v1.0');
    const object = run('cat-file', '-p', 'v1.0');
    // The tag object names itself v1.0, not v1.
    expect(object).toContain('tag v1.0');
    expect(object).toContain('tagger Tagger <tagger@example.com> 1700000000 +0100');
    expect(object).toContain('first release\n\nwith a body');
    const described = execFileSync('git', ['describe', '--tags'], {cwd: dir, encoding: 'utf8'});
    expect(described).toMatch(/^v1\.0/);
    expect(run('rev-parse', 'v1.0^{commit}')).toBe(first);
  });

  it('refuses to rename a signed tag, which would lose its signature', async () => {
    const {actions, run, first} = repo();
    run('tag', '-a', 'signed', '-m', 'msg\n-----BEGIN PGP SIGNATURE-----\nabc\n-----END PGP SIGNATURE-----', first);
    await expect(actions.renameTag('signed', 'renamed')).rejects.toThrow(/is signed/);
    expect(run('tag', '--list')).toBe('signed');
  });

  it('renames a lightweight tag', async () => {
    const {actions, run, first} = repo();
    await actions.createTag('light', first);
    await actions.renameTag('light', 'lighter');
    expect(run('tag', '--list')).toBe('lighter');
    expect(run('cat-file', '-t', 'lighter')).toBe('commit');
  });

  it('renames a tag keeping an annotated tag annotated', async () => {
    const {actions, run, first} = repo();
    await actions.createTag('v1', first, 'first release');
    await actions.renameTag('v1', 'v1.0');
    expect(run('tag', '--list')).toBe('v1.0');
    expect(run('rev-parse', 'v1.0^{commit}')).toBe(first);
    expect(run('tag', '-n1', 'v1.0')).toContain('first release');
  });
});

describe('delete', () => {
  it('deletes a merged branch and a tag', async () => {
    const {actions, run, first} = repo();
    run('branch', 'merged', first);
    run('tag', 'v1');
    await actions.deleteBranch('merged', false);
    await actions.deleteTag('v1');
    expect(run('branch', '--list', 'merged')).toBe('');
    expect(run('tag', '--list')).toBe('');
  });

  it('refuses an unmerged branch with UnmergedBranchError and keeps it, unless forced', async () => {
    const {actions, run, dir} = repo();
    run('checkout', '-q', '-b', 'wip');
    run('commit', '--allow-empty', '-q', '-m', 'unique 1');
    run('commit', '--allow-empty', '-q', '-m', 'unique 2');
    run('checkout', '-q', 'main');
    await expect(actions.deleteBranch('wip', false)).rejects.toBeInstanceOf(UnmergedBranchError);
    expect(run('branch', '--list', 'wip')).toContain('wip');
    expect(await actions.uniqueCommits('wip')).toBe(2);
    await actions.deleteBranch('wip', true);
    expect(run('branch', '--list', 'wip')).toBe('');
    void dir;
  });

  it('does not count commits that other refs also reach', async () => {
    const {actions, run} = repo();
    run('branch', 'same');
    expect(await actions.uniqueCommits('same')).toBe(0);
  });

  it('counts a branch with a slash in its name', async () => {
    const {actions, run} = repo();
    run('checkout', '-q', '-b', 'feature/x');
    run('commit', '--allow-empty', '-q', '-m', 'unique');
    run('checkout', '-q', 'main');
    expect(await actions.uniqueCommits('feature/x')).toBe(1);
  });

  it('git refuses to delete the checked-out branch', async () => {
    const {actions} = repo();
    await expect(actions.deleteBranch('main', false)).rejects.toThrow();
  });
});
