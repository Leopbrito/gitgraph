import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {gitHistoryActions, OperationStoppedError} from '../../src/git/history.js';
import {operationInProgress} from '../../src/git/operation.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

/**
 * main: c1 (a=1) -- c2 (b=2) -- c3 (a=3)
 * side:  from c1: s1 (c=side)
 */
function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  const file = (name: string, text: string) => writeFileSync(join(r.dir, name), `${text}\n`);
  const read = (name: string) => readFileSync(join(r.dir, name), 'utf8');
  const commit = (name: string, text: string, message: string) => {
    file(name, text);
    r.run('add', name);
    r.run('commit', '-q', '-m', message);
    return r.run('rev-parse', 'HEAD');
  };
  const c1 = commit('a.txt', '1', 'c1');
  const c2 = commit('b.txt', '2', 'c2');
  const c3 = commit('a.txt', '3', 'c3');
  r.run('checkout', '-q', '-b', 'side', c1);
  const s1 = commit('c.txt', 'side', 's1');
  r.run('checkout', '-q', 'main');
  return {...r, file, read, commit, c1, c2, c3, s1, actions: gitHistoryActions(r.dir)};
}

describe('cherryPick', () => {
  it('applies the commit on the current branch', async () => {
    const r = repo();
    await r.actions.cherryPick(r.s1, false);
    expect(r.read('c.txt')).toBe('side\n');
    expect(r.run('log', '--format=%s', '-1')).toBe('s1');
  });

  it('stops on conflicts with OperationStoppedError and leaves the cherry-pick in progress', async () => {
    const r = repo();
    r.run('checkout', '-q', 'side');
    r.file('a.txt', 'side version');
    r.run('add', 'a.txt');
    r.run('commit', '-q', '-m', 'side a');
    const sideA = r.run('rev-parse', 'HEAD');
    r.run('checkout', '-q', 'main');
    const error = await r.actions.cherryPick(sideA, false).catch(e => e as Error);
    expect(error).toBeInstanceOf(OperationStoppedError);
    expect((error as OperationStoppedError).operation).toBe('cherry-pick');
    expect((error as OperationStoppedError).files).toEqual(['a.txt']);
    expect(await operationInProgress(r.dir)).toBe('cherry-pick');
  });

  it('applies a merge commit relative to its first parent', async () => {
    const r = repo();
    r.run('checkout', '-q', '-b', 'target', r.c1);
    r.run('merge', '--no-ff', '-q', '-m', 'merge side', 'side');
    const merge = r.run('rev-parse', 'HEAD');
    r.run('checkout', '-q', 'main');
    await expect(r.actions.cherryPick(merge, false)).rejects.toThrow();
    await r.actions.cherryPick(merge, true);
    expect(r.read('c.txt')).toBe('side\n');
  });

  it('fails without changing anything when local changes are in the way', async () => {
    const r = repo();
    r.file('c.txt', 'dirty');
    // c.txt is untracked on main and the commit adds it: git refuses.
    const error = await r.actions.cherryPick(r.s1, false).catch(e => e as Error);
    expect(error).not.toBeInstanceOf(OperationStoppedError);
    expect(await operationInProgress(r.dir)).toBeNull();
    expect(r.read('c.txt')).toBe('dirty\n');
  });
});

describe('revert', () => {
  it('adds a commit that undoes the given one, with git\'s own message', async () => {
    const r = repo();
    await r.actions.revert(r.c2, false);
    expect(r.run('log', '--format=%s', '-1')).toBe('Revert "c2"');
    expect(() => readFileSync(join(r.dir, 'b.txt'))).toThrow();
  });

  it('stops on conflicts', async () => {
    const r = repo();
    // c3 changed a.txt after c1: reverting c1 conflicts with it.
    const error = await r.actions.revert(r.c1, false).catch(e => e as Error);
    expect(error).toBeInstanceOf(OperationStoppedError);
    expect((error as OperationStoppedError).operation).toBe('revert');
    expect(await operationInProgress(r.dir)).toBe('revert');
  });
});

describe('reset', () => {
  it('previews the commits that leave the branch and the ones nothing else keeps', async () => {
    const r = repo();
    r.run('branch', 'keeps-c2', r.c2);
    // Resetting main to c1 drops c2 and c3 from main; c2 is still on keeps-c2, c3 only on main.
    expect(await r.actions.resetPreview(r.c1)).toEqual({ahead: 2, orphaned: 1, changed: 0});
    expect(await r.actions.resetPreview(r.c3)).toEqual({ahead: 0, orphaned: 0, changed: 0});
  });

  it('counts the tracked files a hard reset would discard, not the untracked ones', async () => {
    const r = repo();
    r.file('a.txt', 'edited');
    r.file('new.txt', 'untracked');
    r.file('b.txt', 'edited too');
    r.run('add', 'b.txt');
    expect((await r.actions.resetPreview(r.c2)).changed).toBe(2);
  });

  it('soft keeps index and files, mixed keeps the files, hard discards them', async () => {
    const soft = repo();
    await soft.actions.reset('soft', soft.c1);
    expect(soft.run('rev-parse', 'HEAD')).toBe(soft.c1);
    expect(soft.run('status', '--porcelain')).toContain('M  a.txt');
    expect(soft.read('a.txt')).toBe('3\n');

    const mixed = repo();
    await mixed.actions.reset('mixed', mixed.c1);
    // The helper trims the output, so the leading space of " M" is gone; b.txt is no longer staged.
    expect(mixed.run('status', '--porcelain')).toBe('M a.txt\n?? b.txt');
    expect(mixed.read('a.txt')).toBe('3\n');

    const hard = repo();
    await hard.actions.reset('hard', hard.c1);
    expect(hard.run('status', '--porcelain')).toBe('');
    expect(hard.read('a.txt')).toBe('1\n');
  });
});
