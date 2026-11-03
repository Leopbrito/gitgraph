import {describe, expect, it} from 'vitest';
import type {Commit} from '../../src/graph/types.js';
import {findMatches, firstFrom, matchesCommit, nextMatch} from '../../src/ui/search.js';

const commit = (over: Partial<Commit>): Commit => ({
  hash: 'abc1234def',
  parents: [],
  author: 'Ana Souza',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: 'Fix login redirect',
  body: 'Users were sent to the wrong page.',
  ...over,
});

describe('matchesCommit', () => {
  it.each([
    ['subject', 'LOGIN'],
    ['body', 'wrong PAGE'],
    ['author', 'souza'],
    ['email', 'example.com'],
    ['hash', 'c1234'],
  ])('matches on the %s, ignoring case', (_, query) => {
    expect(matchesCommit(commit({}), query)).toBe(true);
  });

  it('does not match other text, nor an empty or blank query', () => {
    expect(matchesCommit(commit({}), 'logout')).toBe(false);
    expect(matchesCommit(commit({}), '')).toBe(false);
    expect(matchesCommit(commit({}), '   ')).toBe(false);
  });
});

describe('findMatches', () => {
  it('lists the matching rows in order', () => {
    const rows = ['fix a', 'add b', 'fix c'].map(subject => ({commit: commit({subject, body: '', hash: 'zzz'})}));
    expect(findMatches(rows, 'fix')).toEqual([0, 2]);
    expect(findMatches(rows, 'nope')).toEqual([]);
  });
});

describe('firstFrom', () => {
  it('takes the first match at or after the position, wrapping around', () => {
    expect(firstFrom([2, 5, 9], 0)).toBe(2);
    expect(firstFrom([2, 5, 9], 5)).toBe(5);
    expect(firstFrom([2, 5, 9], 6)).toBe(9);
    expect(firstFrom([2, 5, 9], 10)).toBe(2);
    expect(firstFrom([], 3)).toBeNull();
  });
});

describe('nextMatch', () => {
  it('moves forward and wraps to the first match', () => {
    expect(nextMatch([2, 5, 9], 2, 1)).toBe(5);
    expect(nextMatch([2, 5, 9], 3, 1)).toBe(5);
    expect(nextMatch([2, 5, 9], 9, 1)).toBe(2);
  });

  it('moves backward and wraps to the last match', () => {
    expect(nextMatch([2, 5, 9], 5, -1)).toBe(2);
    expect(nextMatch([2, 5, 9], 4, -1)).toBe(2);
    expect(nextMatch([2, 5, 9], 2, -1)).toBe(9);
  });

  it('returns null without matches', () => {
    expect(nextMatch([], 0, 1)).toBeNull();
    expect(nextMatch([], 0, -1)).toBeNull();
  });
});
