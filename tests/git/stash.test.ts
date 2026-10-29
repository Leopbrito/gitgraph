import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadStashes, parseStashList} from '../../src/git/stash.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

describe('parseStashList', () => {
  it('reads hash and name, newest first', () => {
    expect(parseStashList('h2\0stash@{0}\nh1\0stash@{1}\n')).toEqual([
      {hash: 'h2', name: 'stash@{0}'},
      {hash: 'h1', name: 'stash@{1}'},
    ]);
  });

  it('ignores empty and malformed lines', () => {
    expect(parseStashList('')).toEqual([]);
    expect(parseStashList('\nnot-a-stash\n')).toEqual([]);
  });
});

describe('loadStashes', () => {
  it('lists the stash entries of a repository, newest first', async () => {
    const {dir, run, cleanup} = createRepo();
    cleanups.push(cleanup);
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'one');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'one');
    writeFileSync(file, 'two');
    run('stash', 'push', '-q', '-m', 'first');
    writeFileSync(file, 'three');
    run('stash', 'push', '-q', '-m', 'second');

    const stashes = await loadStashes(dir);
    expect(stashes.map(s => s.name)).toEqual(['stash@{0}', 'stash@{1}']);
    expect(stashes[0]?.hash).toBe(run('rev-parse', 'stash@{0}'));
    expect(stashes[1]?.hash).toBe(run('rev-parse', 'stash@{1}'));
  });

  it('is empty without stashes', async () => {
    const {dir, run, cleanup} = createRepo();
    cleanups.push(cleanup);
    run('commit', '--allow-empty', '-q', '-m', 'base');
    expect(await loadStashes(dir)).toEqual([]);
  });

  it('is empty, without throwing, outside a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitgraph-nostash-'));
    cleanups.push(() => rmSync(dir, {recursive: true, force: true}));
    expect(await loadStashes(dir)).toEqual([]);
  });
});
