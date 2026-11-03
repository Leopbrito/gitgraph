import {describe, expect, it} from 'vitest';
import {classifyDiff} from '../../src/ui/diff.js';
import {keepVisible, scrollBy, wrapText} from '../../src/ui/scroll.js';

describe('wrapText', () => {
  it('wraps at spaces and keeps blank lines', () => {
    expect(wrapText('aaa bbb ccc\n\nddd', 7)).toEqual(['aaa bbb', 'ccc', '', 'ddd']);
  });

  it('cuts words longer than the width', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('scrollBy', () => {
  it.each([
    [0, 1, 10, 4, 1],
    [0, -1, 10, 4, 0],
    [5, 10, 10, 4, 6],
    [0, 5, 3, 4, 0],
  ])('offset %i + %i of %i lines in %i rows -> %i', (offset, delta, total, view, expected) => {
    expect(scrollBy(offset, delta, total, view)).toBe(expected);
  });
});

describe('keepVisible', () => {
  it.each([
    [0, 2, 3, 0],
    [0, 3, 3, 1],
    [5, 2, 3, 2],
    [2, 3, 3, 2],
  ])('offset %i, selected %i, view %i -> %i', (offset, selected, view, expected) => {
    expect(keepVisible(offset, selected, view)).toBe(expected);
  });
});

describe('classifyDiff', () => {
  it('tells header, hunk and changes apart', () => {
    expect(
      classifyDiff(['diff --git a/x b/x', 'index 1..2', '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-old', '+new', ' same']),
    ).toEqual(['header', 'header', 'header', 'header', 'hunk', 'del', 'add', 'context']);
  });

  it('does not take a removed `-- comment` line for a file header', () => {
    expect(classifyDiff(['diff --git a/x b/x', '@@ -1 +1 @@', '--- comment', '+++ comment'])).toEqual([
      'header',
      'hunk',
      'del',
      'add',
    ]);
  });

  it('restarts the header at the next file', () => {
    expect(classifyDiff(['diff --git a/x b/x', '@@ -1 +1 @@', '+a', 'diff --git a/y b/y', '--- a/y'])).toEqual([
      'header',
      'hunk',
      'add',
      'header',
      'header',
    ]);
  });
});
