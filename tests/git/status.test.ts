import {statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadCommits} from '../../src/git/log.js';
import {describeWorkingTree, isClean, loadWorkingTree, parseStatus, UNCOMMITTED_HASH} from '../../src/git/status.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  return r;
}

describe('parseStatus', () => {
  it('counts staged, modified, untracked and conflicted files', () => {
    const text = [
      '# branch.oid abc',
      '# branch.head main',
      '1 M. N... 100644 100644 100644 aaa bbb staged-only.txt',
      '1 .M N... 100644 100644 100644 aaa bbb modified-only.txt',
      '1 MM N... 100644 100644 100644 aaa bbb both.txt',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new.txt\told.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
      '? new-file.txt',
      '? other-file.txt',
      '! ignored.log',
      '',
    ].join('\n');
    expect(parseStatus(text)).toEqual({staged: 3, modified: 2, untracked: 2, conflicted: 1});
  });

  it('an empty status is clean', () => {
    expect(isClean(parseStatus(''))).toBe(true);
    expect(isClean(parseStatus('# branch.head main\n'))).toBe(true);
  });
});

describe('describeWorkingTree', () => {
  it('lists only the categories that have files, with the right plural', () => {
    expect(describeWorkingTree({staged: 2, modified: 1, untracked: 3, conflicted: 0})).toBe('2 staged, 1 modificado, 3 não rastreados');
    expect(describeWorkingTree({staged: 0, modified: 0, untracked: 1, conflicted: 2})).toBe('1 não rastreado, 2 em conflito');
  });
});

describe('loadWorkingTree and loadCommits({uncommitted})', () => {
  it('is null on a clean tree and adds no node', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'one');
    expect(await loadWorkingTree(dir)).toBeNull();
    const commits = await loadCommits(dir, {all: true, uncommitted: true});
    expect(commits.map(c => c.subject)).toEqual(['one']);
  });

  it('adds a node on top of HEAD with the counts when there are changes', async () => {
    const {dir, run} = repo();
    writeFileSync(join(dir, 'a.txt'), '1');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'one');
    writeFileSync(join(dir, 'a.txt'), '2');
    writeFileSync(join(dir, 'b.txt'), 'new');
    const commits = await loadCommits(dir, {all: true, uncommitted: true});
    const [node, head] = commits;
    expect(node?.hash).toBe(UNCOMMITTED_HASH);
    expect(node?.uncommitted).toEqual({staged: 0, modified: 1, untracked: 1, conflicted: 0});
    expect(node?.subject).toBe('Alterações não commitadas (1 modificado, 1 não rastreado)');
    expect(node?.parents).toEqual([head?.hash]);
    expect(head?.subject).toBe('one');
    // Off by default.
    expect((await loadCommits(dir, {all: true})).map(c => c.subject)).toEqual(['one']);
  });

  it('goes right above HEAD, not at the top, and above that commit\'s stashes', async () => {
    const {dir, run} = repo();
    writeFileSync(join(dir, 'a.txt'), '1');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'base');
    run('checkout', '-q', '-b', 'newer');
    run('commit', '--allow-empty', '-q', '-m', 'newer tip');
    run('checkout', '-q', 'main');
    writeFileSync(join(dir, 'a.txt'), '2');
    run('stash', 'push', '-q');
    writeFileSync(join(dir, 'a.txt'), '3');

    const commits = await loadCommits(dir, {all: true, stashes: true, uncommitted: true, order: 'date'});
    const subjects = commits.map(c => (c.uncommitted ? 'UNCOMMITTED' : c.stash ? 'STASH' : c.subject));
    // HEAD (base) is the oldest commit: the node sits just above it and the stash, not above "newer tip".
    expect(subjects.indexOf('UNCOMMITTED')).toBeGreaterThan(subjects.indexOf('newer tip'));
    expect(subjects.slice(-3)).toEqual(['UNCOMMITTED', 'STASH', 'base']);
  });

  it('is left out when HEAD is not listed, and in an empty repository', async () => {
    const {dir, run} = repo();
    expect(await loadCommits(dir, {all: true, uncommitted: true})).toEqual([]);
    run('commit', '--allow-empty', '-q', '-m', 'one');
    run('checkout', '-q', '-b', 'other');
    run('commit', '--allow-empty', '-q', '-m', 'two');
    writeFileSync(join(dir, 'x.txt'), 'x');
    // Listing only main: HEAD (other) is not in it.
    const commits = await loadCommits(dir, {revs: ['main'], uncommitted: true});
    expect(commits.map(c => c.subject)).toEqual(['one']);
  });

  it('does not touch the index, so --watch cannot loop on it', async () => {
    const {dir, run} = repo();
    writeFileSync(join(dir, 'a.txt'), '1');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'one');
    // Make git want to refresh the index: same content, new timestamp.
    await new Promise(resolve => setTimeout(resolve, 1100));
    writeFileSync(join(dir, 'a.txt'), '1');
    const before = statSync(join(dir, '.git', 'index')).mtimeMs;
    await loadWorkingTree(dir);
    expect(statSync(join(dir, '.git', 'index')).mtimeMs).toBe(before);
  });
});
