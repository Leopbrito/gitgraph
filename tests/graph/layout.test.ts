import {describe, expect, it} from 'vitest';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';

const c = (hash: string, ...parents: string[]): Commit => ({
  hash,
  parents,
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-01-01T00:00:00+00:00',
  subject: hash,
  body: '',
});

/** Resumo legível: coluna do commit e lanes depois da linha. */
const summary = (commits: Commit[]) =>
  layoutGraph(commits).map(r => `${r.commit.hash}@${r.column} [${r.lanesAfter.map(l => l ?? '-').join(',')}]`);

describe('layoutGraph', () => {
  it('devolve vazio sem commits', () => {
    expect(layoutGraph([])).toEqual([]);
  });

  it('mantém histórico linear em uma coluna', () => {
    expect(summary([c('a', 'b'), c('b', 'c'), c('c')])).toEqual([
      'a@0 [b]',
      'b@0 [c]',
      'c@0 []',
    ]);
  });

  it('abre lane no merge e fecha na base', () => {
    // M mescla m (main) e f (feature), ambos filhos de base.
    expect(summary([c('M', 'm', 'f'), c('m', 'base'), c('f', 'base'), c('base')])).toEqual([
      'M@0 [m,f]',
      'm@0 [base,f]',
      'f@1 [base]',
      'base@0 []',
    ]);
  });

  it('liga a aresta à lane existente do pai (fork)', () => {
    const rows = layoutGraph([c('c1', 'p'), c('c2', 'p'), c('p')]);
    expect(rows[1]?.column).toBe(1);
    expect(rows[1]?.edges).toEqual([{parent: 'p', column: 0}]);
    expect(rows[1]?.lanesAfter).toEqual(['p']);
    expect(rows[2]?.column).toBe(0);
  });

  it('abre uma lane por pai em octopus merge', () => {
    const rows = layoutGraph([c('O', 'p1', 'p2', 'p3'), c('p1'), c('p2'), c('p3')]);
    expect(rows[0]?.edges.map(e => e.column)).toEqual([0, 1, 2]);
    expect(rows[0]?.width).toBe(3);
    expect(rows.slice(1).map(r => r.column)).toEqual([0, 1, 2]);
    expect(rows[3]?.lanesAfter).toEqual([]);
  });

  it('coloca pontas independentes em colunas separadas', () => {
    expect(summary([c('t1', 'r1'), c('t2', 'r2'), c('r1'), c('r2')])).toEqual([
      't1@0 [r1]',
      't2@1 [r1,r2]',
      'r1@0 [-,r2]',
      'r2@1 []',
    ]);
  });

  it('reaproveita a coluna livre com várias raízes', () => {
    const rows = layoutGraph([c('x'), c('y')]);
    expect(rows.map(r => r.column)).toEqual([0, 0]);
  });

  it('não cresce além do necessário ao fechar lanes', () => {
    // f vem antes de m: a base fica na lane 1 e a lane 0 fica livre.
    const rows = layoutGraph([
      c('M', 'm', 'f'),
      c('f', 'base'),
      c('m', 'base'),
      c('base', 'z'),
      c('z'),
    ]);
    expect(Math.max(...rows.map(r => r.width))).toBe(2);
    expect(rows[3]?.column).toBe(1);
    expect(rows[3]?.lanesAfter).toEqual([null, 'z']);
  });

  it('mantém lane pendente quando o pai está fora da lista', () => {
    // Ex.: --max-count cortou o histórico.
    const rows = layoutGraph([c('a', 'fora')]);
    expect(rows[0]?.lanesAfter).toEqual(['fora']);
  });

  it('registra lanes antes e depois de cada linha', () => {
    const rows = layoutGraph([c('M', 'm', 'f'), c('m'), c('f')]);
    expect(rows[1]?.lanesBefore).toEqual(['m', 'f']);
    expect(rows[1]?.lanesAfter).toEqual([null, 'f']);
  });
});
