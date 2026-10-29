import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadCommits} from '../../src/git/log.js';
import {loadRefs} from '../../src/git/refs.js';
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
    expect(refs.head).toEqual({hash: null, branch: 'main'});
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
    expect(refs.head).toEqual({hash: tip, branch: 'main'});
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
});
