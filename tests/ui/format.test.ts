import {describe, expect, it} from 'vitest';
import {formatRefs} from '../../src/ui/format.js';

describe('formatRefs', () => {
  it('põe HEAD primeiro e não repete a branch atual', () => {
    const labels = formatRefs(
      [
        {name: 'v1', kind: 'tag'},
        {name: 'origin/main', kind: 'remote'},
        {name: 'main', kind: 'branch'},
        {name: 'feature', kind: 'branch'},
      ],
      {isHead: true, branch: 'main'},
    );
    expect(labels.map(l => l.text)).toEqual([
      'HEAD -> main',
      'feature',
      'origin/main',
      'tag: v1',
    ]);
  });

  it('mostra só HEAD quando destacado', () => {
    expect(formatRefs([], {isHead: true, branch: null}).map(l => l.text)).toEqual(['HEAD']);
  });

  it('não mostra HEAD em outros commits', () => {
    const labels = formatRefs([{name: 'main', kind: 'branch'}], {isHead: false, branch: 'main'});
    expect(labels.map(l => l.text)).toEqual(['main']);
  });
});
