import {describe, expect, it} from 'vitest';
import {formatRefs, headLabel} from '../../src/ui/format.js';

describe('formatRefs', () => {
  it('põe HEAD primeiro e não repete a branch atual', () => {
    const labels = formatRefs(
      [
        {name: 'v1', kind: 'tag'},
        {name: 'origin/main', kind: 'remote'},
        {name: 'main', kind: 'branch'},
        {name: 'feature', kind: 'branch'},
      ],
      {isHead: true, branch: 'main'},
    );
    expect(labels.map(l => l.text)).toEqual([
      'HEAD -> main',
      'feature',
      'origin/main',
      'tag: v1',
    ]);
  });

  it('mostra só HEAD quando destacado', () => {
    expect(formatRefs([], {isHead: true, branch: null}).map(l => l.text)).toEqual(['HEAD']);
  });

  it('não mostra HEAD em outros commits', () => {
    const labels = formatRefs([{name: 'main', kind: 'branch'}], {isHead: false, branch: 'main'});
    expect(labels.map(l => l.text)).toEqual(['main']);
  });

  it('labels a stash in magenta, after the tags', () => {
    const labels = formatRefs(
      [
        {name: 'stash@{0}', kind: 'stash'},
        {name: 'v1', kind: 'tag'},
      ],
      {isHead: false, branch: null},
    );
    expect(labels).toEqual([
      {text: 'tag: v1', color: 'yellow'},
      {text: 'stash@{0}', color: 'magenta'},
    ]);
  });
});

describe('headLabel', () => {
  it('names the branch', () => {
    expect(headLabel({hash: 'abc', branch: 'main'})).toBe('main');
  });

  it('names the commit when HEAD is detached', () => {
    expect(headLabel({hash: 'abcdef1234', branch: null})).toBe('HEAD destacado em abcdef1');
  });

  it('says when there are no commits', () => {
    expect(headLabel({hash: null, branch: null})).toBe('sem commits');
    // An unborn branch still has a name.
    expect(headLabel({hash: null, branch: 'main'})).toBe('main');
  });

  it('flags a merge in progress', () => {
    expect(headLabel({hash: 'abc', branch: 'main', merging: true})).toBe('main (merge em andamento)');
    expect(headLabel({hash: 'abcdef1234', branch: null, merging: true})).toBe(
      'HEAD destacado em abcdef1 (merge em andamento)',
    );
    expect(headLabel({hash: 'abc', branch: 'main', merging: false})).toBe('main');
  });
});
