import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';

// Counts how many rows are drawn: the real function, wrapped.
const draws = vi.hoisted(() => ({count: 0}));
vi.mock('../../src/graph/glyphs.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/graph/glyphs.js')>();
  return {
    ...original,
    renderGraphLines: (...args: Parameters<typeof original.renderGraphLines>) => {
      draws.count++;
      return original.renderGraphLines(...args);
    },
  };
});

const {layoutGraph} = await import('../../src/graph/layout.js');
const {Browser} = await import('../../src/ui/Browser.js');

const commit = (n: number) => ({
  hash: `h${String(n).padStart(6, '0')}`,
  parents: n < 29 ? [`h${String(n + 1).padStart(6, '0')}`] : [],
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: `commit ${n}`,
  body: '',
});

const tick = () => new Promise(resolve => setTimeout(resolve, 30));

describe('row memoization', () => {
  it('moving the selection draws the two rows that changed, not every visible row', async () => {
    const rows = layoutGraph(Array.from({length: 30}, (_, i) => commit(i)));
    const refs = {byCommit: new Map(), head: {hash: 'h000000', branch: 'main'}};
    const noop = () => Promise.resolve();
    const {stdin, lastFrame} = render(
      <Browser
        initial={{rows, refs}}
        initialLimit={100}
        load={() => Promise.resolve({rows, refs})}
        checkout={noop}
        merge={{merge: () => Promise.resolve('merged'), abort: noop, conflicts: () => Promise.resolve([])}}
        changes={{files: () => Promise.resolve([]), diff: () => Promise.resolve({lines: [], truncated: false}), fullDiff: () => Promise.resolve({lines: [], truncated: false})}}
      />,
    );
    await tick();
    expect(lastFrame()).toContain('1/30');
    const visible = draws.count;
    expect(visible).toBeGreaterThan(5);

    draws.count = 0;
    stdin.write('j');
    await tick();
    expect(lastFrame()).toContain('2/30');
    // The row that lost the cursor and the one that got it.
    expect(draws.count).toBeLessThanOrEqual(2);
  });
});
