import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {layoutGraph} from '../../src/graph/layout.js';
import {GraphRowView} from '../../src/ui/GraphRowView.js';

const commit = {
  hash: 'abcdef1234567',
  parents: [],
  author: 'Ana',
  email: 'ana@example.com',
  date: '2026-03-04T10:00:00+00:00',
  subject: 'primeiro commit',
  body: '',
};

describe('GraphRowView', () => {
  it('mostra grafo, hash curto, refs, assunto, autor e data', () => {
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
    expect(frame).toContain('primeiro commit');
    expect(frame).toContain('Ana, 2026-03-04');
  });
});
