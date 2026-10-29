import {describe, expect, it} from 'vitest';
import {parseRefs} from '../../src/git/refs.js';

describe('parseRefs', () => {
  it('agrupa branches, remotos e tags por commit', () => {
    const text = [
      'h1\0\0refs/heads/main',
      'h1\0\0refs/remotes/origin/main',
      'h1\0\0refs/remotes/origin/HEAD',
      'h2\0\0refs/heads/feature/x',
      'tagobj\0h2\0refs/tags/v1',
      'x\0\0refs/stash',
    ].join('\n');
    const map = parseRefs(text);
    expect(map.get('h1')).toEqual([
      {name: 'main', kind: 'branch'},
      {name: 'origin/main', kind: 'remote'},
    ]);
    expect(map.get('h2')).toEqual([
      {name: 'feature/x', kind: 'branch'},
      {name: 'v1', kind: 'tag'},
    ]);
    expect(map.has('x')).toBe(false);
  });
});
