import {describe, expect, it} from 'vitest';
import {parseLog} from '../../src/git/parse.js';

// What `git log -z` prints: the seven fields and a NUL after each commit.
const rec = (...f: string[]) => f.join('\0') + '\0';

describe('parseLog', () => {
  it('returns an empty list for empty text', () => {
    expect(parseLog('')).toEqual([]);
  });

  it('parses a root commit, a normal one and a merge', () => {
    const text =
      rec('c', 'b a', 'Ana', 'a@x', '2026-01-03T00:00:00+00:00', 'merge', '') +
      rec('b', 'a', 'Ana', 'a@x', '2026-01-02T00:00:00+00:00', 'two', 'body\n') +
      rec('a', '', 'Ana', 'a@x', '2026-01-01T00:00:00+00:00', 'um', '');
    const commits = parseLog(text);
    expect(commits.map(c => c.hash)).toEqual(['c', 'b', 'a']);
    expect(commits[0]?.parents).toEqual(['b', 'a']);
    expect(commits[1]?.body).toBe('body');
    expect(commits[2]?.parents).toEqual([]);
  });

  it('keeps line breaks in the body', () => {
    const [c] = parseLog(rec('a', '', 'A', 'a@x', 'd', 's', 'l1\n\nl2\n'));
    expect(c?.body).toBe('l1\n\nl2');
  });

  it('does not mistake control characters in the body for separators', () => {
    const body = 'with \x1e RS, \x1f US and \x01 SOH\n';
    const commits = parseLog(
      rec('b', 'a', 'A', 'a@x', 'd', 's', body) + rec('a', '', 'A', 'a@x', 'd', 's', ''),
    );
    expect(commits.map(c => c.hash)).toEqual(['b', 'a']);
    expect(commits[0]?.body).toBe('with \x1e RS, \x1f US and \x01 SOH');
  });

  it('fails on a malformed record', () => {
    expect(() => parseLog('garbage\0')).toThrow(/Invalid commit record/);
    expect(() => parseLog('a\0b\0c\0')).toThrow(/Invalid commit record/);
  });
});
