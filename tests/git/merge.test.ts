import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  abortMerge,
  conflictedFiles,
  describeMergeTarget,
  merge,
  MergeConflictError,
  mergeInProgress,
  mergeTargets,
} from '../../src/git/merge.js';
import {loadRefs} from '../../src/git/refs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  return r;
}

describe('mergeTargets', () => {
  const branch = (name: string) => ({name, kind: 'branch' as const});
  const remote = (name: string) => ({name, kind: 'remote' as const});

  it('offers the local and remote branches at the commit, local first, sorted', () => {
    expect(
      mergeTargets('h', [remote('origin/b'), branch('zeta'), branch('alpha'), remote('origin/a')], 'main'),
    ).toEqual([
      {kind: 'branch', name: 'alpha', remote: false},
      {kind: 'branch', name: 'zeta', remote: false},
      {kind: 'branch', name: 'origin/a', remote: true},
      {kind: 'branch', name: 'origin/b', remote: true},
    ]);
  });

  it('leaves the current branch out', () => {
    expect(mergeTargets('h', [branch('main'), branch('feature')], 'main')).toEqual([
      {kind: 'branch', name: 'feature', remote: false},
    ]);
  });

  it('falls back to the commit when no branch is left', () => {
    expect(mergeTargets('abc', [], 'main')).toEqual([{kind: 'commit', hash: 'abc'}]);
    expect(mergeTargets('abc', [branch('main')], 'main')).toEqual([{kind: 'commit', hash: 'abc'}]);
    // Tags and stashes are not merge sources.
    expect(
      mergeTargets('abc', [{name: 'v1', kind: 'tag'}, {name: 'stash@{0}', kind: 'stash'}], 'main'),
    ).toEqual([{kind: 'commit', hash: 'abc'}]);
  });

  it('describes the targets for the prompt', () => {
    expect(describeMergeTarget({kind: 'branch', name: 'feature', remote: false})).toBe('feature');
    expect(describeMergeTarget({kind: 'commit', hash: 'abcdef1234'})).toBe('abcdef1 (commit)');
  });
});

describe('merge', () => {
  /** main and feature with one commit each beyond "base", touching different files. */
  function diverged() {
    const r = repo();
    writeFileSync(join(r.dir, 'a.txt'), 'base');
    r.run('add', 'a.txt');
    r.run('commit', '-q', '-m', 'base');
    r.run('checkout', '-q', '-b', 'feature');
    writeFileSync(join(r.dir, 'f.txt'), 'feature');
    r.run('add', 'f.txt');
    r.run('commit', '-q', '-m', 'feature work');
    r.run('checkout', '-q', 'main');
    return r;
  }

  it('fast-forwards when it can', async () => {
    const {dir, run} = diverged();
    const featureTip = run('rev-parse', 'feature');
    expect(await merge(dir, {kind: 'branch', name: 'feature', remote: false})).toBe('fast-forward');
    expect(run('rev-parse', 'HEAD')).toBe(featureTip);
    expect(run('branch', '--show-current')).toBe('main');
  });

  it('makes a merge commit with the automatic message when the branches diverged', async () => {
    const {dir, run} = diverged();
    writeFileSync(join(dir, 'm.txt'), 'main');
    run('add', 'm.txt');
    run('commit', '-q', '-m', 'main work');

    expect(await merge(dir, {kind: 'branch', name: 'feature', remote: false})).toBe('merged');
    expect(run('log', '-1', '--format=%P').split(' ')).toHaveLength(2);
    expect(run('log', '-1', '--format=%s')).toBe("Merge branch 'feature'");
    expect(await mergeInProgress(dir)).toBe(false);
  });

  it('can merge a commit instead of a branch', async () => {
    const {dir, run} = diverged();
    const tip = run('rev-parse', 'feature');
    expect(await merge(dir, {kind: 'commit', hash: tip})).toBe('fast-forward');
    expect(run('rev-parse', 'HEAD')).toBe(tip);
  });

  it('says so when there is nothing to merge', async () => {
    const {dir, run} = diverged();
    run('merge', '-q', 'feature');
    const before = run('rev-parse', 'HEAD');
    expect(await merge(dir, {kind: 'branch', name: 'feature', remote: false})).toBe('up-to-date');
    expect(run('rev-parse', 'HEAD')).toBe(before);
  });

  describe('with conflicts', () => {
    function conflicting() {
      const r = repo();
      const file = join(r.dir, 'a.txt');
      writeFileSync(file, 'base');
      r.run('add', 'a.txt');
      r.run('commit', '-q', '-m', 'base');
      r.run('checkout', '-q', '-b', 'feature');
      writeFileSync(file, 'from feature');
      r.run('commit', '-q', '-am', 'feature edit');
      r.run('checkout', '-q', 'main');
      writeFileSync(file, 'from main');
      r.run('commit', '-q', '-am', 'main edit');
      return {...r, file};
    }
    const feature = {kind: 'branch', name: 'feature', remote: false} as const;

    it('leaves the merge in progress and names the conflicted files', async () => {
      const {dir} = conflicting();
      const failure = merge(dir, feature);
      await expect(failure).rejects.toBeInstanceOf(MergeConflictError);
      await expect(failure).rejects.toMatchObject({files: ['a.txt']});
      await expect(failure).rejects.toThrow('conflitos em a.txt');
      expect(await mergeInProgress(dir)).toBe(true);
      expect(await conflictedFiles(dir)).toEqual(['a.txt']);
    });

    it('shows up as merging in the refs while it lasts', async () => {
      const {dir} = conflicting();
      expect((await loadRefs(dir)).head.merging).toBe(false);
      await merge(dir, feature).catch(() => {});
      expect((await loadRefs(dir)).head.merging).toBe(true);
    });

    it('can be aborted, restoring the repository exactly', async () => {
      const {dir, run, file} = conflicting();
      const before = run('rev-parse', 'HEAD');
      await merge(dir, feature).catch(() => {});
      await abortMerge(dir);
      expect(await mergeInProgress(dir)).toBe(false);
      expect(run('rev-parse', 'HEAD')).toBe(before);
      expect(readFileSync(file, 'utf8')).toBe('from main');
      expect(run('status', '--porcelain')).toBe('');
    });
  });

  it('refuses, changing nothing, when local changes would be overwritten', async () => {
    const {dir, run} = diverged();
    // feature adds f.txt; an untracked f.txt in the way makes git refuse.
    writeFileSync(join(dir, 'f.txt'), 'mine');
    const before = run('rev-parse', 'HEAD');
    const failure = merge(dir, {kind: 'branch', name: 'feature', remote: false});
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(MergeConflictError);
    expect(await mergeInProgress(dir)).toBe(false);
    expect(run('rev-parse', 'HEAD')).toBe(before);
    expect(readFileSync(join(dir, 'f.txt'), 'utf8')).toBe('mine');
  });

  it('rejects an unknown ref as a plain error', async () => {
    const {dir} = diverged();
    const failure = merge(dir, {kind: 'branch', name: 'nope', remote: false});
    await expect(failure).rejects.toThrow(/nope/);
    await expect(failure).rejects.not.toBeInstanceOf(MergeConflictError);
  });

  it('has no conflicted files in a clean repository', async () => {
    const {dir} = diverged();
    expect(await conflictedFiles(dir)).toEqual([]);
    expect(await mergeInProgress(dir)).toBe(false);
  });
});
