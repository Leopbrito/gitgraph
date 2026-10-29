import {describe, expect, it} from 'vitest';
import {cellsToText, renderGraphLines} from '../../src/graph/glyphs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';

const c = (hash: string, ...parents: string[]): Commit => ({
  hash, parents, author: 'Ana', email: 'a@x', date: '2026-01-01T00:00:00+00:00', subject: hash, body: '',
});

/** Linhas do grafo (nó e ligação) como texto, sem espaços finais. */
function draw(commits: Commit[]): string[] {
  const rows = layoutGraph(commits);
  const width = Math.max(...rows.map(r => r.width));
  return rows.flatMap(row => {
    const {node, connector} = renderGraphLines(row, width);
    return [cellsToText(node), ...(connector ? [cellsToText(connector)] : [])].map(s => s.trimEnd());
  });
}

describe('renderGraphLines', () => {
  it('desenha histórico linear sem linhas de ligação', () => {
    expect(draw([c('a', 'b'), c('b')])).toEqual(['●', '●']);
  });

  it('desenha merge e fork', () => {
    expect(draw([c('M', 'm', 'f'), c('m', 'base'), c('f', 'base'), c('base')])).toEqual([
      '●',
      '├─╮',
      '● │',
      '│ ●',
      '├─╯',
      '●',
    ]);
  });

  it('desenha octopus merge e o deslizamento das lanes restantes', () => {
    // Cada raiz que termina faz as lanes da direita deslizarem uma coluna (╱).
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

  it('empurra lanes à direita com ╲ e as traz de volta com ╱', () => {
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

  it('desenha fork com a lane do pai à esquerda', () => {
    expect(draw([c('t1', 'p'), c('t2', 'p'), c('p')])).toEqual([
      '●',
      '│ ●',
      '├─╯',
      '●',
    ]);
  });
});
