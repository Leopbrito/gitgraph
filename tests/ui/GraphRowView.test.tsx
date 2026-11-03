import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {layoutGraph} from '../../src/graph/layout.js';
import {DisplayContext} from '../../src/ui/display.js';
import {GraphRowView, laneColor} from '../../src/ui/GraphRowView.js';

const commit = {
  hash: 'abcdef1234567',
  parents: [],
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: 'first commit',
  body: '',
};

describe('GraphRowView', () => {
  it('shows the graph, short hash, refs, subject, author and date', () => {
    const [row] = layoutGraph([commit]);
    const {lastFrame} = render(
      <GraphRowView
        row={row!}
        graphWidth={1}
        refs={[{name: 'v1', kind: 'tag'}]}
        head={{isHead: true, branch: 'main'}}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('●');
    expect(frame).toContain('abcdef1');
    expect(frame).toContain('(HEAD -> main)');
    expect(frame).toContain('(tag: v1)');
    expect(frame).toContain('first commit');
    expect(frame).toContain('Ana, 2026-03-04');
  });

  it('draws the node in ASCII when asked', () => {
    const [row] = layoutGraph([commit]);
    const {lastFrame} = render(
      <DisplayContext.Provider value={{color: false, ascii: true, spaced: true}}>
        <GraphRowView row={row!} graphWidth={1} refs={[]} head={{isHead: false, branch: null}} />
      </DisplayContext.Provider>,
    );
    expect(lastFrame()).toContain('*');
    expect(lastFrame()).not.toContain('●');
  });
});

describe('laneColor', () => {
  it('cycles through the palette and takes a custom one', () => {
    expect(laneColor(0)).toBe('cyan');
    expect(laneColor(6)).toBe('cyan');
    expect(laneColor(1, ['red', 'blue'])).toBe('blue');
    expect(laneColor(2, ['red', 'blue'])).toBe('red');
  });
});

describe('GraphRowView column window', () => {
  // A merge of three lanes: a node in column 0 with lanes in columns 1 and 2.
  const wide = layoutGraph([
    {...commit, hash: 'm', parents: ['a', 'b', 'c'], subject: 'wide'},
    {...commit, hash: 'a', parents: [], subject: 'a'},
    {...commit, hash: 'b', parents: [], subject: 'b'},
    {...commit, hash: 'c', parents: [], subject: 'c'},
  ]);
  const row = wide[0]!;
  const draw = (columnWindow?: {offset: number; count: number}) =>
    render(
      <DisplayContext.Provider value={{color: false, ascii: false, spaced: false}}>
        <GraphRowView row={row} graphWidth={3} refs={[]} head={{isHead: false, branch: null}} columnWindow={columnWindow} />
      </DisplayContext.Provider>,
    ).lastFrame() ?? '';

  it('shows the whole graph without a window', () => {
    expect(draw()).toMatch(/^● {5}/);
  });

  it('cuts the columns outside the window and pads to its width', () => {
    // Columns 1-2 only: the node in column 0 is out, and the text starts after 2 columns (4 cells) and the marker.
    const frame = draw({offset: 1, count: 2});
    expect(frame).not.toContain('●');
    expect(frame).toMatch(/^ {5}m wide/);
    expect(frame).toContain('wide');
    // A window of one column.
    expect(draw({offset: 0, count: 1})).toMatch(/^●  m wide/);
  });
});
