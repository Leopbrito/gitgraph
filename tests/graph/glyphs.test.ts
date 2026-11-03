import {describe, expect, it} from 'vitest';
import {cellsToText, renderGraphLines, toAscii} from '../../src/graph/glyphs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';

const c = (hash: string, ...parents: string[]): Commit => ({
  hash, parents, author: 'Ana', email: 'a@x', date: '2026-01-01T00:00:00+00:00', subject: hash, body: '',
});

/** Graph lines (node and connector) as text, without trailing spaces. */
function draw(commits: Commit[], options: {spaced?: boolean} = {}): string[] {
  const rows = layoutGraph(commits);
  const width = Math.max(...rows.map(r => r.width));
  return rows.flatMap(row => {
    const {node, connector} = renderGraphLines(row, width, options);
    return [cellsToText(node), ...(connector ? [cellsToText(connector)] : [])].map(s => s.trimEnd());
  });
}

describe('renderGraphLines', () => {
  it('draws a linear history without connector lines', () => {
    expect(draw([c('a', 'b'), c('b')])).toEqual(['●', '●']);
  });

  it('draws a merge and a fork', () => {
    expect(draw([c('M', 'm', 'f'), c('m', 'base'), c('f', 'base'), c('base')])).toEqual([
      '●',
      '├─╮',
      '● │',
      '│ ●',
      '├─╯',
      '●',
    ]);
  });

  it('draws an octopus merge and the sliding of the remaining lanes', () => {
    // Each root that ends makes the lanes on the right slide one column (╱).
    expect(draw([c('O', 'p1', 'p2', 'p3'), c('p1'), c('p2'), c('p3')])).toEqual([
      '●',
      '├─┬─╮',
      '● │ │',
      ' ╱ ╱',
      '● │',
      ' ╱',
      '●',
    ]);
  });

  it('pushes lanes to the right with ╲ and brings them back with ╱', () => {
    const commits = [
      c('T0', 'a'),
      c('T1', 'M'),
      c('T2', 'c'),
      c('M', 'm0', 'f0'),
      c('m0'),
      c('f0'),
      c('a'),
      c('c'),
    ];
    expect(draw(commits)).toEqual([
      '●',
      '│ ●',
      '│ │ ●',
      '│ ● │',
      '│ ├─╮╲',
      '│ ● │ │',
      '│  ╱ ╱',
      '│ ● │',
      '│  ╱',
      '● │',
      ' ╱',
      '●',
    ]);
  });

  it('draws a fork with the parent lane on the left', () => {
    expect(draw([c('t1', 'p'), c('t2', 'p'), c('p')])).toEqual([
      '●',
      '│ ●',
      '├─╯',
      '●',
    ]);
  });
});

describe('renderGraphLines with spaced lines', () => {
  it('joins consecutive commits of a linear history with a │', () => {
    expect(draw([c('a', 'b'), c('b', 'c'), c('c')], {spaced: true})).toEqual([
      '●',
      '│',
      '●',
      '│',
      '●',
    ]);
  });

  it('does not add a line after the last commit when no lane goes on', () => {
    expect(draw([c('a', 'b'), c('b')], {spaced: true})).toEqual(['●', '│', '●']);
    expect(draw([c('a')], {spaced: true})).toEqual(['●']);
  });

  it('keeps every lane going on the extra line', () => {
    expect(draw([c('M', 'm', 'f'), c('m', 'base'), c('f', 'base'), c('base')], {spaced: true})).toEqual([
      '●',
      '├─╮',
      '● │',
      '│ │',
      '│ ●',
      '├─╯',
      '●',
    ]);
  });

  it('draws a │ after a commit whose parent is outside the list', () => {
    expect(draw([c('a', 'outside')], {spaced: true})).toEqual(['●', '│']);
  });

  it('matches the dense drawing when no lane goes on and nothing moves', () => {
    expect(draw([c('x'), c('y')], {spaced: true})).toEqual(draw([c('x'), c('y')]));
  });
});

describe('toAscii', () => {
  it('swaps box drawing for ASCII and keeps the color', () => {
    const cells = [
      {char: '●', color: 3},
      {char: '├', color: 1},
      {char: '─', color: 1},
      {char: '╮', color: 1},
      {char: '╱', color: 2},
      {char: '╲', color: 2},
      {char: '│', color: 0},
      {char: 'x', color: 0},
    ];
    const ascii = toAscii(cells);
    expect(ascii.map(c => c.char).join('')).toBe('*+-+/\\|x');
    expect(ascii.map(c => c.color)).toEqual(cells.map(c => c.color));
  });

  it('leaves no non-ASCII character in the graph drawings', () => {
    const rows = layoutGraph([
      c('T0', 'a'), c('T1', 'M'), c('T2', 'c'), c('M', 'm0', 'f0'), c('m0'), c('f0'), c('a'), c('c'),
    ]);
    const width = Math.max(...rows.map(r => r.width));
    for (const row of rows) {
      const {node, connector} = renderGraphLines(row, width);
      const text = cellsToText(toAscii(node)) + cellsToText(toAscii(connector ?? []));
      expect(text).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});

describe('stash nodes', () => {
  const stash = (hash: string, ...parents: string[]): Commit => ({...c(hash, ...parents), stash: true});

  it('draws a hollow node for a stash above its base', () => {
    expect(draw([stash('S', 'base'), c('base')])).toEqual(['○', '●']);
    expect(draw([stash('S', 'base'), c('base')], {spaced: true})).toEqual(['○', '│', '●']);
  });

  it('joins the lane of a base that already has one', () => {
    // t is a branch tip with a lane waiting for base; the stash hangs on the same base.
    expect(draw([c('t', 'base'), stash('S', 'base'), c('base')])).toEqual(['●', '│ ○', '├─╯', '●']);
  });

  it('turns the hollow node into "o" in ASCII', () => {
    const [row] = layoutGraph([stash('S', 'base'), c('base')]);
    const {node} = renderGraphLines(row!, 1);
    expect(cellsToText(toAscii(node)).trimEnd()).toBe('o');
  });
});

describe('uncommitted changes node', () => {
  it('is hollow like the stash one, and becomes o in ASCII', () => {
    const node = {...c('wip', 'a'), uncommitted: {staged: 1, modified: 0, untracked: 0, conflicted: 0}};
    expect(draw([node, c('a')])).toEqual(['○', '●']);
    const rows = layoutGraph([node, c('a')]);
    const first = rows[0];
    if (!first) throw new Error('no lines');
    expect(cellsToText(toAscii(renderGraphLines(first, first.width).node)).trim()).toBe('o');
  });
});
