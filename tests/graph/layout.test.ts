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

/** Readable summary: the commit's column and the lanes after the row. */
const summary = (commits: Commit[]) =>
  layoutGraph(commits).map(r => `${r.commit.hash}@${r.column} [${r.lanesAfter.join(',')}]`);

describe('layoutGraph', () => {
  it('returns nothing without commits', () => {
    expect(layoutGraph([])).toEqual([]);
  });

  it('keeps a linear history in one column', () => {
    expect(summary([c('a', 'b'), c('b', 'c'), c('c')])).toEqual([
      'a@0 [b]',
      'b@0 [c]',
      'c@0 []',
    ]);
  });

  it('opens a lane at the merge and closes it at the base', () => {
    // M merges m (main) and f (feature), both children of base.
    expect(summary([c('M', 'm', 'f'), c('m', 'base'), c('f', 'base'), c('base')])).toEqual([
      'M@0 [m,f]',
      'm@0 [base,f]',
      'f@1 [base]',
      'base@0 []',
    ]);
  });

  it('links the edge to the parent\'s existing lane (fork)', () => {
    const rows = layoutGraph([c('p0', 'p'), c('p1', 'p'), c('p')]);
    expect(rows[1]?.column).toBe(1);
    expect(rows[1]?.edges).toEqual([{parent: 'p', column: 0}]);
    expect(rows[1]?.lanesAfter).toEqual(['p']);
    expect(rows[2]?.column).toBe(0);
  });

  it('opens one lane per parent in an octopus merge, and the lanes compact afterwards', () => {
    const rows = layoutGraph([c('O', 'p1', 'p2', 'p3'), c('p1'), c('p2'), c('p3')]);
    expect(rows[0]?.edges.map(e => e.column)).toEqual([0, 1, 2]);
    expect(rows[0]?.width).toBe(3);
    // Each root that ends makes the lanes on the right slide to the left.
    expect(rows.slice(1).map(r => r.column)).toEqual([0, 0, 0]);
    expect(rows.slice(1).map(r => r.lanesAfter)).toEqual([['p2', 'p3'], ['p3'], []]);
  });

  it('puts independent tips on the right, without shifting existing lanes', () => {
    expect(summary([c('t1', 'r1'), c('t2', 'r2'), c('r1'), c('r2')])).toEqual([
      't1@0 [r1]',
      't2@1 [r1,r2]',
      'r1@0 [r2]',
      'r2@0 []',
    ]);
    const rows = layoutGraph([c('t1', 'r1'), c('t2', 'r2')]);
    expect(rows[1]?.lanesBefore).toEqual(['r1', 't2']);
  });

  it('reuses column 0 with several roots', () => {
    const rows = layoutGraph([c('x'), c('y')]);
    expect(rows.map(r => r.column)).toEqual([0, 0]);
  });

  it('compacts lanes to the left when a lane ends', () => {
    // f comes before m: once f closes, the base goes back to column 0.
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

  it('keeps a pending lane when the parent is outside the list', () => {
    // E.g. --max-count cut the history.
    const rows = layoutGraph([c('a', 'fora')]);
    expect(rows[0]?.lanesAfter).toEqual(['fora']);
  });

  it('records the lanes before and after each row', () => {
    const rows = layoutGraph([c('M', 'm', 'f'), c('m'), c('f')]);
    expect(rows[1]?.lanesBefore).toEqual(['m', 'f']);
    expect(rows[1]?.lanesAfter).toEqual(['f']);
    expect(rows[2]?.lanesBefore).toEqual(['f']);
  });

  it('inserts the lanes of the other parents right next to the commit', () => {
    // Lane 'c' is to the right of M and is pushed by the new lane f0.
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

  describe('colors', () => {
    it('a lane keeps its color along the first parent', () => {
      const rows = layoutGraph([c('a', 'b'), c('b', 'c'), c('c')]);
      expect(rows.map(r => r.colorsBefore)).toEqual([[0], [0], [0]]);
    });

    it('new lanes get new colors and existing ones do not change when sliding', () => {
      const rows = layoutGraph([c('M', 'm', 'f'), c('m'), c('f')]);
      expect(rows[0]?.colorsAfter).toEqual([0, 1]);
      // m ends; f slides from column 1 to 0 and keeps color 1.
      expect(rows[1]?.colorsAfter).toEqual([1]);
      expect(rows[2]?.colorsBefore).toEqual([1]);
    });

    it('independent tips get different colors', () => {
      const rows = layoutGraph([c('t1', 'r1'), c('t2', 'r2')]);
      expect(rows[0]?.colorsBefore).toEqual([0]);
      expect(rows[1]?.colorsBefore).toEqual([0, 1]);
    });
  });
});
