import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadCommits} from '../../src/git/log.js';
import {loadRefs, localBranchTips} from '../../src/git/refs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  return r;
}

describe('repositório vazio', () => {
  it('não tem commits nem HEAD', async () => {
    const {dir} = repo();
    expect(await loadCommits(dir)).toEqual([]);
    const refs = await loadRefs(dir);
    expect(refs.head).toEqual({hash: null, branch: 'main', merging: false});
    expect(refs.byCommit.size).toBe(0);
  });
});

describe('repositório com branch e merge', () => {
  it('lê commits, pais e refs', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'base');
    run('checkout', '-q', '-b', 'feature');
    run('commit', '--allow-empty', '-q', '-m', 'na feature', '-m', 'detalhe');
    run('checkout', '-q', 'main');
    run('commit', '--allow-empty', '-q', '-m', 'na main');
    run('merge', '--no-ff', '-q', '-m', 'merge feature', 'feature');
    run('tag', '-a', 'v1', '-m', 'versão 1');

    const commits = await loadCommits(dir);
    const subjects = commits.map(c => c.subject);
    // topo-order: merge antes dos pais e base por último; a ordem entre
    // os dois commits paralelos não é especificada.
    expect(subjects[0]).toBe('merge feature');
    expect(subjects[3]).toBe('base');
    expect(subjects.slice(1, 3).sort()).toEqual(['na feature', 'na main']);
    const feature = commits.find(c => c.subject === 'na feature')!;
    expect(commits[0]?.parents).toHaveLength(2);
    expect(commits[3]?.parents).toEqual([]);
    expect(feature.body).toBe('detalhe');
    expect(commits[0]?.author).toBe('Ana');

    const refs = await loadRefs(dir);
    const tip = commits[0]!.hash;
    expect(refs.head).toEqual({hash: tip, branch: 'main', merging: false});
    expect(refs.byCommit.get(tip)).toEqual(
      expect.arrayContaining([
        {name: 'main', kind: 'branch'},
        {name: 'v1', kind: 'tag'},
      ]),
    );
    expect(refs.byCommit.get(feature.hash)).toEqual([
      {name: 'feature', kind: 'branch'},
    ]);
  });

  it('respeita --all e max-count', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'a');
    run('checkout', '-q', '-b', 'outra');
    run('commit', '--allow-empty', '-q', '-m', 'b');
    run('checkout', '-q', 'main');
    expect(await loadCommits(dir)).toHaveLength(1);
    expect(await loadCommits(dir, {all: true})).toHaveLength(2);
    expect(await loadCommits(dir, {all: true, maxCount: 1})).toHaveLength(1);
  });

  it('filtra por revisão (branch)', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'base');
    run('checkout', '-q', '-b', 'feature');
    run('commit', '--allow-empty', '-q', '-m', 'só na feature');
    run('checkout', '-q', 'main');
    run('commit', '--allow-empty', '-q', '-m', 'só na main');
    const main = await loadCommits(dir, {revs: ['main']});
    expect(main.map(c => c.subject)).toEqual(['só na main', 'base']);
    const feature = await loadCommits(dir, {revs: ['feature']});
    expect(feature.map(c => c.subject)).toEqual(['só na feature', 'base']);
  });

  it('não inclui os commits internos do stash com --all', async () => {
    const {dir, run} = repo();
    writeFileSync(join(dir, 'a.txt'), 'um');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'com arquivo');
    writeFileSync(join(dir, 'a.txt'), 'dois');
    run('stash', 'push', '-q', '-m', 'trabalho em andamento');
    // O stash existe e traz commits extras para o git log --all comum.
    expect(run('rev-list', '--all', '--count')).not.toBe('1');
    const commits = await loadCommits(dir, {all: true});
    expect(commits.map(c => c.subject)).toEqual(['com arquivo']);
  });

  it('preserva acentos no assunto, no corpo e no autor', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'Corrige ação inválida', '-m', 'Descrição: não quebra');
    const [commit] = await loadCommits(dir);
    expect(commit?.subject).toBe('Corrige ação inválida');
    expect(commit?.body).toBe('Descrição: não quebra');
  });

  describe('commit ordering', () => {
    /** Commits with fixed author/committer dates, so each ordering is deterministic. */
    function commitAt(
      run: (...args: string[]) => string,
      subject: string,
      {author, committer = author}: {author: string; committer?: string},
    ) {
      process.env.GIT_AUTHOR_DATE = author;
      process.env.GIT_COMMITTER_DATE = committer;
      try {
        run('commit', '--allow-empty', '-q', '-m', subject);
      } finally {
        delete process.env.GIT_AUTHOR_DATE;
        delete process.env.GIT_COMMITTER_DATE;
      }
    }
    const t = (n: number) => `2026-01-0${n}T10:00:00+00:00`;

    /** main: base, m1, m2; feature: base, f1, f2; dates interleave m and f. */
    function interleaved() {
      const {dir, run} = repo();
      commitAt(run, 'base', {author: t(1)});
      run('checkout', '-q', '-b', 'feature');
      commitAt(run, 'f1', {author: t(2)});
      commitAt(run, 'f2', {author: t(4)});
      run('checkout', '-q', 'main');
      commitAt(run, 'm1', {author: t(3)});
      commitAt(run, 'm2', {author: t(5)});
      process.env.GIT_COMMITTER_DATE = t(6);
      try {
        run('merge', '--no-ff', '-q', '-m', 'merge', 'feature');
      } finally {
        delete process.env.GIT_COMMITTER_DATE;
      }
      return dir;
    }
    const subjects = async (dir: string, order?: 'date' | 'author-date' | 'topo') =>
      (await loadCommits(dir, {order})).map(c => c.subject);

    it('orders by date by default, interleaving the branches', async () => {
      const dir = interleaved();
      const expected = ['merge', 'm2', 'f2', 'm1', 'f1', 'base'];
      expect(await subjects(dir)).toEqual(expected);
      expect(await subjects(dir, 'date')).toEqual(expected);
    });

    it('keeps each line of history together with topo', async () => {
      const dir = interleaved();
      const order = await subjects(dir, 'topo');
      expect(order[0]).toBe('merge');
      expect(order[5]).toBe('base');
      // m1/m2 and f1/f2 are never interleaved.
      expect(Math.abs(order.indexOf('m1') - order.indexOf('m2'))).toBe(1);
      expect(Math.abs(order.indexOf('f1') - order.indexOf('f2'))).toBe(1);
      expect(order).not.toEqual(['merge', 'm2', 'f2', 'm1', 'f1', 'base']);
    });

    it('never lists a parent before its children, in any ordering', async () => {
      const dir = interleaved();
      for (const order of ['date', 'author-date', 'topo'] as const) {
        const commits = await loadCommits(dir, {order});
        const position = new Map(commits.map((c, i) => [c.hash, i]));
        for (const c of commits) {
          for (const parent of c.parents) {
            expect(position.get(parent)!).toBeGreaterThan(position.get(c.hash)!);
          }
        }
      }
    });

    it('sorts author-date by author date and date by commit date', async () => {
      const {dir, run} = repo();
      commitAt(run, 'base', {author: t(1)});
      run('checkout', '-q', '-b', 'a');
      // a1: written first, committed last (as after a rebase).
      commitAt(run, 'a1', {author: t(2), committer: t(5)});
      run('checkout', '-q', 'main');
      run('checkout', '-q', '-b', 'b');
      commitAt(run, 'b1', {author: t(3), committer: t(4)});
      run('checkout', '-q', 'main');
      process.env.GIT_COMMITTER_DATE = t(6);
      try {
        run('merge', '--no-ff', '-q', '-m', 'merge', 'a', 'b');
      } finally {
        delete process.env.GIT_COMMITTER_DATE;
      }
      expect(await subjects(dir, 'date')).toEqual(['merge', 'a1', 'b1', 'base']);
      expect(await subjects(dir, 'author-date')).toEqual(['merge', 'b1', 'a1', 'base']);
    });

    it('keeps the prefix stable when the list is cut with maxCount', async () => {
      const dir = interleaved();
      const all = await subjects(dir);
      for (const n of [1, 2, 3, 5]) {
        expect((await loadCommits(dir, {maxCount: n})).map(c => c.subject)).toEqual(all.slice(0, n));
      }
    });

    it('applies the ordering to revisions and to all', async () => {
      const dir = interleaved();
      const viaAll = (await loadCommits(dir, {all: true, order: 'topo'})).map(c => c.subject);
      const viaRev = (await loadCommits(dir, {revs: ['main'], order: 'topo'})).map(c => c.subject);
      expect(viaAll).toEqual(viaRev);
    });
  });

  describe('stashes', () => {
    /** main: one -> two, with two stashes on "two" (the second also has an untracked file). */
    function stashed() {
      const {dir, run} = repo();
      const file = join(dir, 'a.txt');
      writeFileSync(file, 'v1');
      run('add', 'a.txt');
      run('commit', '-q', '-m', 'one');
      writeFileSync(file, 'v2');
      run('commit', '-q', '-am', 'two');
      writeFileSync(file, 'wip A');
      run('stash', 'push', '-q', '-m', 'wip A');
      writeFileSync(file, 'wip B');
      writeFileSync(join(dir, 'new.txt'), 'untracked');
      run('stash', 'push', '-u', '-q', '-m', 'wip B');
      return {dir, run, file};
    }
    const subjects = async (dir: string, options = {}) =>
      (await loadCommits(dir, {stashes: true, ...options})).map(c => c.subject);

    it('leaves them out unless asked', async () => {
      const {dir} = stashed();
      expect((await loadCommits(dir)).map(c => c.subject)).toEqual(['two', 'one']);
      expect((await loadCommits(dir, {all: true})).map(c => c.subject)).toEqual(['two', 'one']);
    });

    it('adds each one as a single node right above its base, newest first', async () => {
      const {dir, run} = stashed();
      const commits = await loadCommits(dir, {stashes: true});
      expect(commits.map(c => c.subject)).toEqual(['On main: wip B', 'On main: wip A', 'two', 'one']);

      const base = run('rev-parse', 'main');
      const [newest, older] = commits;
      expect(newest?.hash).toBe(run('rev-parse', 'stash@{0}'));
      expect(older?.hash).toBe(run('rev-parse', 'stash@{1}'));
      // Only the commit the stash was made on stays as a parent.
      expect(newest?.parents).toEqual([base]);
      expect(older?.parents).toEqual([base]);
      expect(newest?.stash).toBe(true);
      expect(commits.slice(2).every(c => c.stash === undefined)).toBe(true);
    });

    it('hides the internal commits (index and untracked files)', async () => {
      const {dir} = stashed();
      for (const options of [{}, {all: true}, {revs: ['main']}]) {
        const all = await subjects(dir, options);
        expect(all.filter(s => /^(index on|untracked files on)/.test(s))).toEqual([]);
        expect(all).toHaveLength(4);
      }
    });

    it('does not duplicate a stash that --all would also list', async () => {
      const {dir} = stashed();
      const commits = await loadCommits(dir, {all: true, stashes: true});
      expect(commits.filter(c => c.stash)).toHaveLength(2);
      expect(new Set(commits.map(c => c.hash)).size).toBe(commits.length);
    });

    it('leaves out a stash whose base is not in the list', async () => {
      const {dir, run} = repo();
      const file = join(dir, 'a.txt');
      writeFileSync(file, 'x');
      run('add', 'a.txt');
      run('commit', '-q', '-m', 'old');
      writeFileSync(file, 'y');
      run('stash', 'push', '-q', '-m', 'on old');
      writeFileSync(file, 'z');
      run('commit', '-q', '-am', 'new');
      // maxCount 1 stops before "old", the stash's base.
      expect(await subjects(dir, {maxCount: 1})).toEqual(['new']);
      expect(await subjects(dir, {maxCount: 2})).toEqual(['new', 'On main: on old', 'old']);
    });

    it('keeps a stash above its base in every ordering, never after it', async () => {
      const {dir} = stashed();
      for (const order of ['date', 'author-date', 'topo'] as const) {
        const commits = await loadCommits(dir, {stashes: true, order});
        const position = new Map(commits.map((c, i) => [c.hash, i]));
        for (const c of commits) {
          for (const parent of c.parents) {
            expect(position.get(parent)!).toBeGreaterThan(position.get(c.hash)!);
          }
        }
      }
    });

    it('does nothing in a repository without stashes or without commits', async () => {
      const {dir, run} = repo();
      expect(await loadCommits(dir, {stashes: true})).toEqual([]);
      run('commit', '--allow-empty', '-q', '-m', 'base');
      expect(await subjects(dir)).toEqual(['base']);
    });

    it('labels the stash commits in the refs', async () => {
      const {dir, run} = stashed();
      const refs = await loadRefs(dir);
      expect(refs.byCommit.get(run('rev-parse', 'stash@{0}'))).toEqual([
        {name: 'stash@{0}', kind: 'stash'},
      ]);
      expect(refs.byCommit.get(run('rev-parse', 'stash@{1}'))).toEqual([
        {name: 'stash@{1}', kind: 'stash'},
      ]);
      // A stash is not a branch: it must not show up as a filter or checkout target.
      expect([...localBranchTips(refs.byCommit).keys()]).toEqual(['main']);
    });
  });
});
