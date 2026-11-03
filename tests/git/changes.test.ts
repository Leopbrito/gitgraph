import {afterEach, describe, expect, it, vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gitChanges, loadChanges, loadDiff, loadFullDiff, lruCache, parseChanges, splitDiff} from '../../src/git/changes.js';
import type {Commit} from '../../src/graph/types.js';
import {createRepo} from './helpers.js';

const z = (...parts: string[]) => parts.join('\0') + '\0';
const raw = (status: string) => `:100644 100644 aaa bbb ${status}`;

describe('parseChanges', () => {
  it('joins the raw entries with the numstat ones', () => {
    const out = z(raw('M'), 'src/a.ts', raw('A'), 'b c.txt', '3\t1\tsrc/a.ts', '5\t0\tb c.txt');
    expect(parseChanges(out)).toEqual([
      {path: 'src/a.ts', status: 'M', added: 3, deleted: 1},
      {path: 'b c.txt', status: 'A', added: 5, deleted: 0},
    ]);
  });

  it('reads renames (two paths, empty path in numstat)', () => {
    const out = z(raw('R087'), 'old.ts', 'new.ts', '2\t1\t', 'old.ts', 'new.ts');
    expect(parseChanges(out)).toEqual([
      {path: 'new.ts', oldPath: 'old.ts', status: 'R', added: 2, deleted: 1},
    ]);
  });

  it('marks binary files with null counts', () => {
    expect(parseChanges(z(raw('A'), 'logo.png', '-\t-\tlogo.png'))).toEqual([
      {path: 'logo.png', status: 'A', added: null, deleted: null},
    ]);
  });

  it('is empty for an empty commit', () => {
    expect(parseChanges('')).toEqual([]);
  });
});

describe('splitDiff', () => {
  it('splits lines and drops the trailing newline', () => {
    expect(splitDiff('a\nb\n')).toEqual({lines: ['a', 'b'], truncated: false});
  });

  it('cuts at the limit', () => {
    expect(splitDiff('a\nb\nc\n', 2)).toEqual({lines: ['a', 'b'], truncated: true});
  });
});

describe('git', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const repo = createRepo();
    cleanup = repo.cleanup;
    const write = (name: string, text: string) => writeFileSync(join(repo.dir, name), text);
    const commitOf = (hash: string): Commit => ({
      hash,
      parents: repo.run('rev-list', '--parents', '-n', '1', hash).split(' ').slice(1),
      author: '',
      email: '',
      date: '',
      subject: '',
      body: '',
    });
    return {...repo, write, commitOf};
  }

  it('lists the changes of root, normal and rename commits', async () => {
    const {run, write, dir, commitOf} = setup();
    write('a.txt', 'one\ntwo\nthree\nfour\n');
    write('bin.dat', Buffer.from([0, 1, 2, 3]) as unknown as string);
    run('add', '.');
    run('commit', '-qm', 'one');
    const root = commitOf(run('rev-parse', 'HEAD'));
    run('mv', 'a.txt', 'b.txt');
    write('b.txt', 'one\ntwo\nthree\nfour\nfive\n');
    run('add', '-A');
    run('commit', '-qm', 'two');
    const second = commitOf(run('rev-parse', 'HEAD'));

    expect(await loadChanges(dir, root)).toEqual([
      {path: 'a.txt', status: 'A', added: 4, deleted: 0},
      {path: 'bin.dat', status: 'A', added: null, deleted: null},
    ]);
    expect(await loadChanges(dir, second)).toEqual([
      {path: 'b.txt', oldPath: 'a.txt', status: 'R', added: 1, deleted: 0},
    ]);
    const diff = await loadDiff(dir, second, (await loadChanges(dir, second))[0]);
    expect(diff.lines).toContain('rename from a.txt');
    expect(diff.lines).toContain('+five');
  });

  it('compares a merge commit with its first parent', async () => {
    const {run, write, dir, commitOf} = setup();
    write('a.txt', 'a\n');
    run('add', '.');
    run('commit', '-qm', 'base');
    run('switch', '-qc', 'feature');
    write('f.txt', 'f\n');
    run('add', '.');
    run('commit', '-qm', 'feature');
    run('switch', '-q', 'main');
    write('m.txt', 'm\n');
    run('add', '.');
    run('commit', '-qm', 'main');
    run('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
    const merge = commitOf(run('rev-parse', 'HEAD'));
    expect(merge.parents).toHaveLength(2);
    expect((await loadChanges(dir, merge)).map(f => f.path)).toEqual(['f.txt']);
  });

  it('gives the whole file as context for the side-by-side view', async () => {
    const {run, write, dir, commitOf} = setup();
    const text = Array.from({length: 60}, (_, i) => `line ${i + 1}`);
    write('a.txt', text.join('\n') + '\n');
    run('add', '.');
    run('commit', '-qm', 'one');
    write('a.txt', text.map(l => (l === 'line 30' ? 'changed' : l)).join('\n') + '\n');
    run('add', '.');
    run('commit', '-qm', 'two');
    const commit = commitOf(run('rev-parse', 'HEAD'));
    const [file] = await loadChanges(dir, commit);
    const hunks = await loadDiff(dir, commit, file);
    const full = await loadFullDiff(dir, commit, file!);
    expect(hunks.lines).not.toContain(' line 1');
    expect(full.lines).toContain(' line 1');
    expect(full.lines).toContain(' line 60');
    expect(full.lines.filter(l => l.startsWith('@@'))).toHaveLength(1);
  });

  it('diffs the whole commit when no file is given', async () => {
    const {run, write, dir, commitOf} = setup();
    write('a.txt', 'a\n');
    write('b.txt', 'b\n');
    run('add', '.');
    run('commit', '-qm', 'one');
    const {lines} = await loadDiff(dir, commitOf(run('rev-parse', 'HEAD')));
    expect(lines.filter(l => l.startsWith('diff --git'))).toHaveLength(2);
  });

  it('caches by commit and does not keep failures', async () => {
    const {run, write, dir, commitOf} = setup();
    write('a.txt', 'a\n');
    run('add', '.');
    run('commit', '-qm', 'one');
    const actions = gitChanges(dir);
    const commit = commitOf(run('rev-parse', 'HEAD'));
    expect(actions.files(commit)).toBe(actions.files(commit));
    const bad = {...commit, hash: 'f'.repeat(40), parents: []};
    await expect(actions.files(bad)).rejects.toThrow();
    await expect(actions.files(bad)).rejects.toThrow();
  });
});

describe('lruCache', () => {
  it('evicts the entry used longest ago, not the one inserted first', async () => {
    const cached = lruCache(2);
    const run = vi.fn((value: string) => Promise.resolve(value));
    await cached('a', () => run('a'));
    await cached('b', () => run('b'));
    // Using `a` again makes `b` the least recently used.
    await cached('a', () => run('a'));
    await cached('c', () => run('c'));
    run.mockClear();

    await cached('a', () => run('a'));
    expect(run).not.toHaveBeenCalled();
    await cached('b', () => run('b'));
    expect(run).toHaveBeenCalledWith('b');
  });

  it('does not keep a failure', async () => {
    const cached = lruCache(2);
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    await expect(cached('k', run)).rejects.toThrow('boom');
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(cached('k', run)).resolves.toBe('ok');
  });
});
