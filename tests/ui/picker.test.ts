import {describe, expect, it} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {ALL_LABEL, branchNames, pickerOptions} from '../../src/ui/picker.js';

const refs: RefInfo = {
  byCommit: new Map([
    ['a', [{name: 'main', kind: 'branch'}, {name: 'v1', kind: 'tag'}]],
    ['b', [{name: 'origin/main', kind: 'remote'}, {name: 'feature/x', kind: 'branch'}]],
    ['c', [{name: 'main', kind: 'branch'}]],
  ]),
  head: {hash: 'a', branch: 'main'},
};

describe('branchNames', () => {
  it('une locais e remotas, sem tags nem repetição, em ordem', () => {
    expect(branchNames(refs)).toEqual(['feature/x', 'main', 'origin/main']);
  });
});

describe('pickerOptions', () => {
  const names = ['feature/x', 'main', 'origin/main'];

  it('sem filtro, começa com "todas"', () => {
    const options = pickerOptions(names, '');
    expect(options[0]).toEqual({label: ALL_LABEL, rev: null});
    expect(options).toHaveLength(4);
  });

  it('filtra por trecho, ignorando maiúsculas', () => {
    expect(pickerOptions(names, 'MAIN').map(o => o.rev)).toEqual(['main', 'origin/main']);
  });

  it('devolve vazio sem correspondência', () => {
    expect(pickerOptions(names, 'zzz')).toEqual([]);
  });
});
