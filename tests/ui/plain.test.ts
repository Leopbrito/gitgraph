import {describe, expect, it} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';
import {formatPlain} from '../../src/ui/plain.js';

const c = (hash: string, subject: string, ...parents: string[]): Commit => ({
  hash, parents, author: 'Ana', email: 'a@x', date: '2026-03-04T10:00:00+00:00', subject, body: '',
});

describe('formatPlain', () => {
  it('alinha o texto, mostra refs e inclui linhas de ligação', () => {
    const rows = layoutGraph([
      c('1111111aaa', 'merge', '2222222bbb', '3333333ccc'),
      c('2222222bbb', 'main'),
      c('3333333ccc', 'feature'),
    ]);
    const refs: RefInfo = {
      byCommit: new Map([['3333333ccc', [{name: 'feature', kind: 'branch'}]]]),
      head: {hash: '1111111aaa', branch: 'main'},
    };
    expect(formatPlain(rows, refs)).toEqual([
      '●    1111111 (HEAD -> main) merge  Ana, 2026-03-04',
      '├─╮',
      '● │  2222222 main  Ana, 2026-03-04',
      ' ╱',
      '●    3333333 (feature) feature  Ana, 2026-03-04',
    ]);
  });

  it('usa só ASCII com ascii: true', () => {
    const rows = layoutGraph([
      c('1111111aaa', 'merge', '2222222bbb', '3333333ccc'),
      c('2222222bbb', 'main'),
      c('3333333ccc', 'feature'),
    ]);
    const refs: RefInfo = {byCommit: new Map(), head: {hash: null, branch: null}};
    const lines = formatPlain(rows, refs, {ascii: true});
    expect(lines.slice(0, 4).map(l => l.trim().split(' ')[0])).toEqual(['*', '+-+', '*', '/']);
    expect(lines.join('\n')).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('joins consecutive commits with a | line when spaced', () => {
    const rows = layoutGraph([c('1111111aaa', 'one', '2222222bbb'), c('2222222bbb', 'two')]);
    const refs: RefInfo = {byCommit: new Map(), head: {hash: null, branch: null}};
    expect(formatPlain(rows, refs, {ascii: true, spaced: true}).map(l => l.trimEnd().split(' ')[0])).toEqual([
      '*',
      '|',
      '*',
    ]);
    expect(formatPlain(rows, refs, {ascii: true})).toHaveLength(2);
  });

  it('shows a stash as a hollow node with its label', () => {
    const rows = layoutGraph([{...c('5555555eee', 'On main: wip', '6666666fff'), stash: true}, c('6666666fff', 'base')]);
    const refs: RefInfo = {
      byCommit: new Map([['5555555eee', [{name: 'stash@{0}', kind: 'stash'}]]]),
      head: {hash: null, branch: null},
    };
    const [stashLine, baseLine] = formatPlain(rows, refs);
    expect(stashLine).toContain('○');
    expect(stashLine).toContain('(stash@{0}) On main: wip');
    expect(baseLine).toContain('●');
    expect(formatPlain(rows, refs, {ascii: true})[0]).toMatch(/^o /);
  });
});
