import {describe, expect, it} from 'vitest';
import {layoutGraph} from '../../src/graph/layout.js';
import type {Commit} from '../../src/graph/types.js';
import {followCommit} from '../../src/ui/follow.js';

const commit = (name: string, parents: string[]): Commit => ({
  hash: name,
  parents,
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: name,
  body: '',
});

/** c4 -> c3 -> c2 -> c1 (c4 is the newest). */
const chain = (names: string[]) => layoutGraph(names.map((n, i) => commit(n, names[i + 1] ? [names[i + 1] as string] : [])));

describe('followCommit', () => {
  it('finds the same commit when new ones appear above it', () => {
    const before = chain(['c3', 'c2', 'c1']);
    const after = chain(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(followCommit(before, 1, after)).toBe(3);
  });

  it('falls back to the nearest ancestor that is still listed', () => {
    const before = chain(['c3', 'c2', 'c1']);
    // c3 and c2 are gone (a reset); c1 remains.
    expect(followCommit(before, 0, chain(['c1']))).toBe(0);
    expect(followCommit(before, 1, chain(['x', 'c1']))).toBe(1);
  });

  it('keeps the position when nothing is related', () => {
    const before = chain(['c3', 'c2', 'c1']);
    const after = chain(['z3', 'z2', 'z1']);
    expect(followCommit(before, 2, after)).toBe(2);
    expect(followCommit(before, 2, chain(['z1']))).toBe(0);
  });

  it('handles an empty list', () => {
    expect(followCommit(chain(['c1']), 0, [])).toBe(0);
  });
});
