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
  layoutGraph(commits).map(r => `${r.commit.hash}@${r.column} [${r.lanesAfter.join(',')}]`);

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
    const rows = layoutGraph([c('p0', 'p'), c('p1', 'p'), c('p')]);
    expect(rows[1]?.column).toBe(1);
    expect(rows[1]?.edges).toEqual([{parent: 'p', column: 0}]);
    expect(rows[1]?.lanesAfter).toEqual(['p']);
    expect(rows[2]?.column).toBe(0);
  });

  it('abre uma lane por pai em octopus merge, e as lanes se compactam depois', () => {
    const rows = layoutGraph([c('O', 'p1', 'p2', 'p3'), c('p1'), c('p2'), c('p3')]);
    expect(rows[0]?.edges.map(e => e.column)).toEqual([0, 1, 2]);
    expect(rows[0]?.width).toBe(3);
    // Cada raiz que termina faz as lanes da direita deslizarem para a esquerda.
    expect(rows.slice(1).map(r => r.column)).toEqual([0, 0, 0]);
    expect(rows.slice(1).map(r => r.lanesAfter)).toEqual([['p2', 'p3'], ['p3'], []]);
  });

  it('coloca pontas independentes à direita, sem deslocar lanes existentes', () => {
    expect(summary([c('t1', 'r1'), c('t2', 'r2'), c('r1'), c('r2')])).toEqual([
      't1@0 [r1]',
      't2@1 [r1,r2]',
      'r1@0 [r2]',
      'r2@0 []',
    ]);
    const rows = layoutGraph([c('t1', 'r1'), c('t2', 'r2')]);
    expect(rows[1]?.lanesBefore).toEqual(['r1', 't2']);
  });

  it('reaproveita a coluna 0 com várias raízes', () => {
    const rows = layoutGraph([c('x'), c('y')]);
    expect(rows.map(r => r.column)).toEqual([0, 0]);
  });

  it('compacta lanes à esquerda quando uma lane termina', () => {
    // f vem antes de m: depois que f fecha, a base volta para a coluna 0.
    const rows = layoutGraph([
      c('M', 'm', 'f'),
      c('f', 'base'),
      c('m', 'base'),
      c('base', 'z'),
      c('z'),
    ]);
    expect(rows.map(r => `${r.commit.hash}@${r.column}`)).toEqual([
      'M@0',
      'f@1',
      'm@0',
      'base@0',
      'z@0',
    ]);
    expect(Math.max(...rows.map(r => r.width))).toBe(2);
    expect(rows[3]?.lanesAfter).toEqual(['z']);
  });

  it('mantém lane pendente quando o pai está fora da lista', () => {
    // Ex.: --max-count cortou o histórico.
    const rows = layoutGraph([c('a', 'fora')]);
    expect(rows[0]?.lanesAfter).toEqual(['fora']);
  });

  it('registra lanes antes e depois de cada linha', () => {
    const rows = layoutGraph([c('M', 'm', 'f'), c('m'), c('f')]);
    expect(rows[1]?.lanesBefore).toEqual(['m', 'f']);
    expect(rows[1]?.lanesAfter).toEqual(['f']);
    expect(rows[2]?.lanesBefore).toEqual(['f']);
  });

  it('insere as lanes dos outros pais logo à direita do commit', () => {
    // A lane 'c' está à direita de M e é empurrada pela nova lane f0.
    const rows = layoutGraph([
      c('T0', 'a'),
      c('T1', 'M'),
      c('T2', 'c'),
      c('M', 'm0', 'f0'),
    ]);
    const m = rows[3]!;
    expect(m.lanesBefore).toEqual(['a', 'M', 'c']);
    expect(m.lanesAfter).toEqual(['a', 'm0', 'f0', 'c']);
    expect(m.edges.map(e => e.column)).toEqual([1, 2]);
  });

  describe('cores', () => {
    it('a lane mantém a cor ao longo do primeiro pai', () => {
      const rows = layoutGraph([c('a', 'b'), c('b', 'c'), c('c')]);
      expect(rows.map(r => r.colorsBefore)).toEqual([[0], [0], [0]]);
    });

    it('lanes novas recebem cores novas e as existentes não mudam ao deslizar', () => {
      const rows = layoutGraph([c('M', 'm', 'f'), c('m'), c('f')]);
      expect(rows[0]?.colorsAfter).toEqual([0, 1]);
      // m termina; f desliza da coluna 1 para a 0 e continua com a cor 1.
      expect(rows[1]?.colorsAfter).toEqual([1]);
      expect(rows[2]?.colorsBefore).toEqual([1]);
    });

    it('pontas independentes recebem cores diferentes', () => {
      const rows = layoutGraph([c('t1', 'r1'), c('t2', 'r2')]);
      expect(rows[0]?.colorsBefore).toEqual([0]);
      expect(rows[1]?.colorsBefore).toEqual([0, 1]);
    });
  });
});
