import {describe, expect, it} from 'vitest';
import {parseLog} from '../../src/git/parse.js';

const rec = (...f: string[]) => f.join('\0') + '\x1e\n';

describe('parseLog', () => {
  it('devolve lista vazia para texto vazio', () => {
    expect(parseLog('')).toEqual([]);
  });

  it('interpreta commit raiz, normal e merge', () => {
    const text =
      rec('c', 'b a', 'Ana', 'a@x', '2026-01-03T00:00:00+00:00', 'merge', '') +
      rec('b', 'a', 'Ana', 'a@x', '2026-01-02T00:00:00+00:00', 'dois', 'corpo\n') +
      rec('a', '', 'Ana', 'a@x', '2026-01-01T00:00:00+00:00', 'um', '');
    const commits = parseLog(text);
    expect(commits.map(c => c.hash)).toEqual(['c', 'b', 'a']);
    expect(commits[0]?.parents).toEqual(['b', 'a']);
    expect(commits[1]?.body).toBe('corpo');
    expect(commits[2]?.parents).toEqual([]);
  });

  it('preserva quebras de linha no corpo', () => {
    const [c] = parseLog(rec('a', '', 'A', 'a@x', 'd', 's', 'l1\n\nl2\n'));
    expect(c?.body).toBe('l1\n\nl2');
  });

  it('falha com registro malformado', () => {
    expect(() => parseLog('lixo\x1e')).toThrow(/inválido/);
  });
});
