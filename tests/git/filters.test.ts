import {afterEach, describe, expect, it} from 'vitest';
import {describeFilters, loadCommits} from '../../src/git/log.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

/**
 * main:    base -- m1 ----- merge -- m2     (Ana)
 * feature:      \\- f1 -- f2 -/             (Bia)
 * plus tag v1 on base and a remote-tracking ref pointing at f2.
 */
function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  const asBia = (message: string) =>
    r.run('commit', '--allow-empty', '-q', '--author=Bia <bia@example.com>', '-m', message);
  r.run('commit', '--allow-empty', '-q', '-m', 'base');
  r.run('tag', 'v1');
  r.run('checkout', '-q', '-b', 'feature');
  asBia('f1');
  asBia('f2');
  r.run('update-ref', 'refs/remotes/origin/only-remote', 'HEAD');
  r.run('checkout', '-q', 'main');
  r.run('commit', '--allow-empty', '-q', '-m', 'm1');
  r.run('merge', '--no-ff', '-q', '-m', 'merge', 'feature');
  r.run('commit', '--allow-empty', '-q', '-m', 'm2');
  return r;
}

const subjects = (commits: {subject: string}[]) => commits.map(c => c.subject).sort();

describe('loadCommits filters', () => {
  it('filters by author and drops parents that are not listed', async () => {
    const {dir} = repo();
    const commits = await loadCommits(dir, {all: true, author: 'Bia'});
    expect(subjects(commits)).toEqual(['f1', 'f2']);
    const f1 = commits.find(c => c.subject === 'f1');
    const f2 = commits.find(c => c.subject === 'f2');
    expect(f2?.parents).toEqual([f1?.hash]);
    // f1's parent (base) is not listed, so no lane waits for it.
    expect(f1?.parents).toEqual([]);
  });

  it('filters by date', async () => {
    const {dir} = repo();
    // Git ignores dates in the future, so the cut is in the past.
    expect((await loadCommits(dir, {all: true, until: '2000-01-01'})).length).toBe(0);
    expect((await loadCommits(dir, {all: true, since: '2000-01-01'})).length).toBe(6);
    expect((await loadCommits(dir, {all: true, since: '2000-01-01', until: '2000-02-01'})).length).toBe(0);
  });

  it('follows only the first parent', async () => {
    const {dir} = repo();
    const commits = await loadCommits(dir, {all: true, firstParent: true});
    // `--all` walks the feature tip too, but main's merge no longer pulls f1/f2 through its second parent.
    const merge = commits.find(c => c.subject === 'merge');
    expect(merge?.parents.length).toBe(1);
    expect(commits.map(c => c.subject)).toContain('m1');
    const main = await loadCommits(dir, {revs: ['main'], firstParent: true});
    expect(main.map(c => c.subject)).toEqual(['m2', 'merge', 'm1', 'base']);
  });

  it('hides remote-tracking branches and tags from the "all" listing', async () => {
    const {dir, run} = repo();
    // A commit reachable only through a remote branch and one only through a tag.
    run('checkout', '-q', '--detach', 'main');
    run('commit', '--allow-empty', '-q', '-m', 'only remote');
    run('update-ref', 'refs/remotes/origin/x', 'HEAD');
    run('checkout', '-q', '--detach', 'main');
    run('commit', '--allow-empty', '-q', '-m', 'only tagged');
    run('tag', 'v2');
    run('checkout', '-q', 'main');

    const all = subjects(await loadCommits(dir, {all: true}));
    expect(all).toContain('only remote');
    expect(all).toContain('only tagged');
    const noRemotes = subjects(await loadCommits(dir, {all: true, hideRemotes: true}));
    expect(noRemotes).not.toContain('only remote');
    expect(noRemotes).toContain('only tagged');
    const noTags = subjects(await loadCommits(dir, {all: true, hideTags: true}));
    expect(noTags).toContain('only remote');
    expect(noTags).not.toContain('only tagged');
    const neither = subjects(await loadCommits(dir, {all: true, hideRemotes: true, hideTags: true}));
    expect(neither).not.toContain('only remote');
    expect(neither).not.toContain('only tagged');
    expect(neither).toContain('m2');
  });
});

describe('describeFilters', () => {
  it('lists only the active filters', () => {
    expect(describeFilters({})).toEqual([]);
    expect(describeFilters({author: 'Ana', since: '1 week ago', firstParent: true, hideTags: true})).toEqual([
      'autor Ana',
      'desde 1 week ago',
      'primeiro pai',
      'sem tags',
    ]);
  });
});
