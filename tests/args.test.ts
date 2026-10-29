import {describe, expect, it} from 'vitest';
import {parseCliArgs, UsageError} from '../src/args.js';

describe('parseCliArgs', () => {
  it('usa os padrões sem argumentos', () => {
    expect(parseCliArgs([])).toEqual({
      maxCount: undefined,
      color: true,
      ascii: false,
      compact: false,
      order: 'date',
      help: false,
      version: false,
    });
  });

  it('lê -n e --max-count', () => {
    expect(parseCliArgs(['-n', '50']).maxCount).toBe(50);
    expect(parseCliArgs(['--max-count', '7']).maxCount).toBe(7);
    expect(parseCliArgs(['--max-count=12']).maxCount).toBe(12);
  });

  it.each(['0', '-3', 'abc', '1.5', '', '10x'])('rejeita --max-count %j', value => {
    expect(() => parseCliArgs([`--max-count=${value}`])).toThrow(UsageError);
  });

  it('desliga a cor com --no-color ou NO_COLOR', () => {
    expect(parseCliArgs(['--no-color']).color).toBe(false);
    expect(parseCliArgs([], {NO_COLOR: '1'}).color).toBe(false);
    // NO_COLOR vazio não conta, conforme no-color.org.
    expect(parseCliArgs([], {NO_COLOR: ''}).color).toBe(true);
  });

  it('lê --compact', () => {
    expect(parseCliArgs(['--compact']).compact).toBe(true);
  });

  it('lê --ascii, --help e --version (inclusive as formas curtas)', () => {
    expect(parseCliArgs(['--ascii']).ascii).toBe(true);
    expect(parseCliArgs(['-h']).help).toBe(true);
    expect(parseCliArgs(['--version']).version).toBe(true);
    expect(parseCliArgs(['-v']).version).toBe(true);
  });

  it('explica os erros de uso em português', () => {
    expect(() => parseCliArgs(['--foo'])).toThrow('opção desconhecida: --foo');
    expect(() => parseCliArgs(['-n'])).toThrow(/exige um valor/);
    expect(() => parseCliArgs(['main'])).toThrow('argumento inesperado: main');
  });

  it('reads --order and defaults to date', () => {
    expect(parseCliArgs([]).order).toBe('date');
    expect(parseCliArgs(['--order', 'topo']).order).toBe('topo');
    expect(parseCliArgs(['--order=author-date']).order).toBe('author-date');
    expect(parseCliArgs(['--order', 'date']).order).toBe('date');
  });

  it.each(['topological', '', 'DATE'])('rejects --order %j', value => {
    expect(() => parseCliArgs([`--order=${value}`])).toThrow(/--order deve ser date, author-date, topo/);
  });
});
