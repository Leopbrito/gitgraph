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
});
