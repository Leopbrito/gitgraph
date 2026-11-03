import {describe, expect, it} from 'vitest';
import {clampOffset, followColumn, MIN_TEXT_WIDTH, visibleColumns} from '../../src/ui/graphWindow.js';

describe('visibleColumns', () => {
  it('leaves room for the text and shows a narrow graph whole', () => {
    // (100 - 48) / 2 = 26 columns of graph.
    expect(visibleColumns(50, 100)).toBe(26);
    expect(visibleColumns(10, 100)).toBe(10);
    expect(visibleColumns(26, 100)).toBe(26);
    expect(MIN_TEXT_WIDTH).toBe(48);
  });

  it('never goes below 4 columns, however narrow the terminal', () => {
    expect(visibleColumns(50, 30)).toBe(4);
    expect(visibleColumns(50, 0)).toBe(4);
    // ... unless the graph itself is narrower.
    expect(visibleColumns(2, 30)).toBe(2);
  });
});

describe('clampOffset', () => {
  it('keeps the window inside the graph', () => {
    expect(clampOffset(-3, 50, 26)).toBe(0);
    expect(clampOffset(10, 50, 26)).toBe(10);
    expect(clampOffset(99, 50, 26)).toBe(24);
    expect(clampOffset(5, 10, 10)).toBe(0);
  });
});

describe('followColumn', () => {
  it('moves the window the least that shows the column', () => {
    expect(followColumn(10, 12, 26)).toBe(10);
    expect(followColumn(10, 5, 26)).toBe(5);
    expect(followColumn(10, 36, 26)).toBe(11);
    expect(followColumn(0, 29, 26)).toBe(4);
  });
});
