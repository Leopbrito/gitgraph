import {describe, expect, it} from 'vitest';
import {alignDiff, changeStarts} from '../../src/ui/sideBySide.js';

const header = ['diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x'];

describe('alignDiff', () => {
  it('shows context on both sides with their own line numbers', () => {
    expect(alignDiff([...header, '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'])).toEqual([
      {left: {no: 1, text: 'a'}, right: {no: 1, text: 'a'}, kind: 'context'},
      {left: {no: 2, text: 'b'}, right: {no: 2, text: 'B'}, kind: 'change'},
      {left: {no: 3, text: 'c'}, right: {no: 3, text: 'c'}, kind: 'context'},
    ]);
  });

  it('pairs removed and added lines in order and leaves blanks opposite the longer side', () => {
    const rows = alignDiff([...header, '@@ -1,3 +1,2 @@', '-a', '-b', '-c', '+A', '+B']);
    expect(rows.map(r => [r.left?.text ?? null, r.right?.text ?? null, r.kind])).toEqual([
      ['a', 'A', 'change'],
      ['b', 'B', 'change'],
      ['c', null, 'del'],
    ]);
  });

  it('numbers lines after an insertion by each side', () => {
    const rows = alignDiff([...header, '@@ -1,2 +1,3 @@', ' a', '+new', ' b']);
    expect(rows.map(r => [r.left?.no ?? null, r.right?.no ?? null])).toEqual([
      [1, 1],
      [null, 2],
      [2, 3],
    ]);
  });

  it('handles a new file and a deleted file', () => {
    expect(alignDiff([...header, '@@ -0,0 +1,2 @@', '+a', '+b']).map(r => r.kind)).toEqual(['add', 'add']);
    expect(alignDiff([...header, '@@ -1,2 +0,0 @@', '-a', '-b']).map(r => r.kind)).toEqual(['del', 'del']);
  });

  it('ignores the "no newline" marker and has no rows for a binary file', () => {
    expect(alignDiff([...header, '@@ -1 +1 @@', '-a', '\\ No newline at end of file', '+b'])).toHaveLength(1);
    expect(alignDiff(['diff --git a/x b/x', 'Binary files a/x and b/x differ'])).toEqual([]);
  });

  it('puts a gap between hunks that do not touch', () => {
    const rows = alignDiff([...header, '@@ -1 +1 @@', ' a', '@@ -10 +10 @@', ' j']);
    expect(rows.map(r => r.kind)).toEqual(['context', 'gap', 'context']);
    expect(rows[2]?.left?.no).toBe(10);
  });
});

describe('changeStarts', () => {
  it('finds the first row of each block of changes', () => {
    const rows = alignDiff([...header, '@@ -1,6 +1,6 @@', ' a', '-b', '+B', '-c', '+C', ' d', ' e', '-f', '+F']);
    expect(changeStarts(rows)).toEqual([1, 5]);
  });
});
