import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {canSkip, gitOperationActions, operationInProgress} from '../../src/git/operation.js';
import {loadRefs} from '../../src/git/refs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

/**
 * main: base -- "main change" (a.txt = main)
 * feat: base -- "feat change" (a.txt = feat)   <- the one that conflicts with main
 * HEAD is on main.
 */
function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  const write = (text: string) => writeFileSync(join(r.dir, 'a.txt'), `${text}\n`);
  const commit = (text: string, message: string) => {
    write(text);
    r.run('add', 'a.txt');
    r.run('commit', '-q', '-m', message);
  };
  commit('base', 'base');
  r.run('checkout', '-q', '-b', 'feat');
  commit('feat', 'feat change');
  const featHash = r.run('rev-parse', 'HEAD');
  r.run('checkout', '-q', 'main');
  commit('main', 'main change');
  const attempt = (...args: string[]) => {
    try {
      r.run(...args);
    } catch {
      // Stopping on a conflict makes git exit with an error: that is the point.
    }
  };
  return {...r, write, featHash, attempt, actions: gitOperationActions(r.dir)};
}

describe('operationInProgress', () => {
  it('is null when nothing is stopped', async () => {
    const {dir} = repo();
    expect(await operationInProgress(dir)).toBeNull();
    expect((await loadRefs(dir)).head.operation).toBeUndefined();
  });

  it('looks in the worktree\'s own git directory, not the main one', async () => {
    const r = repo();
    const parent = mkdtempSync(join(tmpdir(), 'gitgraph-wt-'));
    cleanups.push(() => rmSync(parent, {recursive: true, force: true}));
    const linked = join(parent, 'linked');
    r.run('worktree', 'add', '-q', '-b', 'wt', linked, 'main');
    const env = {...process.env, GIT_AUTHOR_NAME: 'Ana', GIT_AUTHOR_EMAIL: 'a@x', GIT_COMMITTER_NAME: 'Ana', GIT_COMMITTER_EMAIL: 'a@x'};
    expect(() => execFileSync('git', ['cherry-pick', r.featHash], {cwd: linked, env, stdio: 'pipe'})).toThrow();
    expect(await operationInProgress(linked)).toBe('cherry-pick');
    expect(await operationInProgress(r.dir)).toBeNull();
  });

  it('sees a cherry-pick, a revert, a merge and a rebase stopped on conflicts', async () => {
    const r = repo();
    r.attempt('cherry-pick', r.featHash);
    expect(await operationInProgress(r.dir)).toBe('cherry-pick');
    r.run('cherry-pick', '--abort');

    r.attempt('merge', 'feat');
    expect(await operationInProgress(r.dir)).toBe('merge');
    r.run('merge', '--abort');

    r.attempt('revert', '--no-edit', 'HEAD~1');
    expect(await operationInProgress(r.dir)).toBe('revert');
    r.run('revert', '--abort');

    r.run('checkout', '-q', 'feat');
    r.attempt('rebase', 'main');
    // A rebase stopped on a commit also leaves CHERRY_PICK_HEAD: it must still be called a rebase.
    expect(await operationInProgress(r.dir)).toBe('rebase');
    const refs = await loadRefs(r.dir);
    expect(refs.head.operation).toBe('rebase');
    expect(refs.head.merging).toBe(false);
  });

  it('loadRefs keeps head.merging for a merge', async () => {
    const r = repo();
    r.attempt('merge', 'feat');
    const {head} = await loadRefs(r.dir);
    expect(head.merging).toBe(true);
    expect(head.operation).toBe('merge');
  });
});

describe('gitOperationActions', () => {
  it('lists the conflicted files', async () => {
    const r = repo();
    r.attempt('cherry-pick', r.featHash);
    expect(await r.actions.conflicts()).toEqual(['a.txt']);
  });

  it('abort ends a stopped rebase and restores the branch', async () => {
    const r = repo();
    r.run('checkout', '-q', 'feat');
    const before = r.run('rev-parse', 'HEAD');
    r.attempt('rebase', 'main');
    await r.actions.abort('rebase');
    expect(await operationInProgress(r.dir)).toBeNull();
    expect(r.run('rev-parse', 'HEAD')).toBe(before);
    expect(r.run('branch', '--show-current')).toBe('feat');
  });

  it('skip drops the step that conflicted', async () => {
    const r = repo();
    r.attempt('cherry-pick', r.featHash);
    await r.actions.skip('cherry-pick');
    expect(await operationInProgress(r.dir)).toBeNull();
    expect(r.run('log', '--format=%s', '-1')).toBe('main change');
    expect(canSkip('merge')).toBe(false);
    expect(canSkip('rebase')).toBe(true);
  });

  it('proceed fails while conflicts remain, and concludes without opening an editor once resolved', async () => {
    const r = repo();
    r.run('checkout', '-q', 'feat');
    r.attempt('rebase', 'main');
    await expect(r.actions.proceed('rebase')).rejects.toThrow();
    expect(await operationInProgress(r.dir)).toBe('rebase');

    r.write('resolved');
    r.run('add', 'a.txt');
    await r.actions.proceed('rebase');
    expect(await operationInProgress(r.dir)).toBeNull();
    expect(r.run('log', '--format=%s', '-2').split('\n')).toEqual(['feat change', 'main change']);
  });

  it('proceed concludes a cherry-pick and a merge with the default message', async () => {
    const r = repo();
    r.attempt('cherry-pick', r.featHash);
    r.write('both');
    r.run('add', 'a.txt');
    await r.actions.proceed('cherry-pick');
    expect(r.run('log', '--format=%s', '-1')).toBe('feat change');

    r.run('reset', '-q', '--hard', 'HEAD~1');
    r.attempt('merge', 'feat');
    r.write('merged');
    r.run('add', 'a.txt');
    await r.actions.proceed('merge');
    expect(r.run('log', '--format=%s', '-1')).toContain("Merge branch 'feat'");
  });
});
