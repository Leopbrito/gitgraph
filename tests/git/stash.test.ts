import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadStashes, parseStashList, runStash, StashConflictError} from '../../src/git/stash.js';
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

describe('runStash', () => {
  function stashed() {
    const r = createRepo();
    cleanups.push(r.cleanup);
    writeFileSync(join(r.dir, 'a.txt'), 'base\n');
    r.run('add', 'a.txt');
    r.run('commit', '-q', '-m', 'base');
    writeFileSync(join(r.dir, 'a.txt'), 'stashed\n');
    r.run('stash', 'push', '-q', '-m', 'wip');
    const hash = r.run('rev-parse', 'stash@{0}');
    return {...r, hash};
  }

  it('apply puts the changes back and keeps the stash', async () => {
    const {dir, run, hash} = stashed();
    expect(await runStash(dir, 'apply', hash)).toBe('stash@{0}');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('stashed\n');
    expect(run('stash', 'list')).toContain('wip');
  });

  it('pop puts the changes back and removes the stash', async () => {
    const {dir, run, hash} = stashed();
    await runStash(dir, 'pop', hash);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('stashed\n');
    expect(run('stash', 'list')).toBe('');
  });

  it('drop removes the stash and leaves the working tree alone', async () => {
    const {dir, run, hash} = stashed();
    await runStash(dir, 'drop', hash);
    expect(run('stash', 'list')).toBe('');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('base\n');
  });

  it('finds the stash by hash even after the numbering shifted', async () => {
    const {dir, run, hash} = stashed();
    // A newer stash (made "elsewhere") takes stash@{0}; ours is now stash@{1}.
    writeFileSync(join(dir, 'a.txt'), 'newer\n');
    run('stash', 'push', '-q', '-m', 'newer');
    expect(await runStash(dir, 'drop', hash)).toBe('stash@{1}');
    expect(run('stash', 'list')).toContain('newer');
    expect(run('stash', 'list')).not.toContain('wip');
  });

  it('fails instead of touching another stash when this one is gone', async () => {
    const {dir, run, hash} = stashed();
    run('stash', 'drop', '-q');
    await expect(runStash(dir, 'pop', hash)).rejects.toThrow('esse stash não existe mais');
  });

  it('throws StashConflictError on conflicts, keeps the stash and lists the files', async () => {
    const {dir, run, hash} = stashed();
    writeFileSync(join(dir, 'a.txt'), 'changed on top\n');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'conflicting');
    const error = await runStash(dir, 'pop', hash).catch(e => e as Error);
    expect(error).toBeInstanceOf(StashConflictError);
    expect((error as StashConflictError).files).toEqual(['a.txt']);
    expect((error as StashConflictError).message).toBe('conflitos ao aplicar stash@{0} em 1 arquivo');
    expect(run('stash', 'list')).toContain('wip');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toContain('<<<<<<<');
  });

  it('explains when local changes are in the way and changes nothing', async () => {
    const {dir, run, hash} = stashed();
    writeFileSync(join(dir, 'a.txt'), 'dirty\n');
    const error = await runStash(dir, 'apply', hash).catch(e => e as Error);
    expect(error).not.toBeInstanceOf(StashConflictError);
    expect((error as Error).message).toContain('as alterações locais atrapalham');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('dirty\n');
    expect(run('stash', 'list')).toContain('wip');
  });
});
