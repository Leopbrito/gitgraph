import {describe, expect, it} from 'vitest';
import type {RefInfo} from '../../src/git/refs.js';
import {
  ALL_LABEL,
  branchNames,
  chosenRevs,
  pickerOptions,
  toggleBranch,
} from '../../src/ui/picker.js';

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

describe('toggleBranch', () => {
  it('adds a branch that is not selected and removes one that is', () => {
    expect(toggleBranch([], 'main')).toEqual(['main']);
    expect(toggleBranch(['main'], 'dev')).toEqual(['main', 'dev']);
    expect(toggleBranch(['main', 'dev'], 'main')).toEqual(['dev']);
  });

  it('does not mutate the previous selection', () => {
    const before = ['main'];
    toggleBranch(before, 'dev');
    expect(before).toEqual(['main']);
  });
});

describe('chosenRevs', () => {
  const branches = ['alpha', 'beta', 'gamma'];
  const option = (rev: string | null) => ({label: rev ?? ALL_LABEL, rev});

  it('uses the checked branches, in list order', () => {
    expect(chosenRevs(['gamma', 'alpha'], branches, option('beta'))).toEqual(['alpha', 'gamma']);
  });

  it('ignores the highlighted option when something is checked', () => {
    expect(chosenRevs(['alpha'], branches, option(null))).toEqual(['alpha']);
  });

  it('uses the highlighted branch alone when nothing is checked', () => {
    expect(chosenRevs([], branches, option('beta'))).toEqual(['beta']);
  });

  it('means all branches when "all" is highlighted and nothing is checked', () => {
    expect(chosenRevs([], branches, option(null))).toEqual([]);
  });

  it('has nothing to apply without checks and without a matching option', () => {
    expect(chosenRevs([], branches, undefined)).toBeUndefined();
  });
});
