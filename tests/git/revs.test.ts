import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadCommits} from '../../src/git/log.js';
import {revisionNames, verifyRevisions} from '../../src/git/revs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  return r;
}

describe('revisionNames', () => {
  it.each([
    ['main', ['main']],
    ['a..b', ['a', 'b']],
    ['a...b', ['a', 'b']],
    ['^a', ['a']],
    ['..b', ['b']],
    ['a..', ['a']],
  ])('%s', (arg, names) => {
    expect(revisionNames(arg)).toEqual(names);
  });
});

describe('verifyRevisions', () => {
  it('accepts branches, tags, hashes and ranges', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'one');
    run('tag', 'v1');
    run('commit', '--allow-empty', '-q', '-m', 'two');
    const hash = run('rev-parse', 'HEAD');
    await expect(verifyRevisions(dir, ['main', 'v1', hash.slice(0, 7), 'v1..main', '^v1', 'HEAD~1'])).resolves.toBeUndefined();
    await expect(verifyRevisions(dir, [])).resolves.toBeUndefined();
  });

  it('names the unknown revision', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'one');
    await expect(verifyRevisions(dir, ['main', 'nope'])).rejects.toThrow('revisão desconhecida: nope');
    await expect(verifyRevisions(dir, ['main..ghost'])).rejects.toThrow('revisão desconhecida: ghost');
  });

  it('keeps the message when it is not a repository', async () => {
    const {dir, cleanup} = createRepo();
    cleanup();
    await expect(verifyRevisions(dir, ['main'])).rejects.toThrow();
  });
});

describe('loadCommits with paths', () => {
  it('lists only the commits that touched the path, with their parents rewritten', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'root');
    writeFileSync(join(dir, 'a.txt'), '1');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'add a');
    writeFileSync(join(dir, 'b.txt'), '1');
    run('add', 'b.txt');
    run('commit', '-q', '-m', 'add b');
    writeFileSync(join(dir, 'a.txt'), '2');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'change a');

    const commits = await loadCommits(dir, {all: true, paths: ['a.txt']});
    expect(commits.map(c => c.subject)).toEqual(['change a', 'add a']);
    // 'change a' points at 'add a', not at the skipped 'add b'.
    expect(commits[0]?.parents).toEqual([commits[1]?.hash]);
    expect(commits[1]?.parents).toEqual([]);
  });
});
