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
      stash: true,
      filters: {},
      revs: [],
      paths: [],
      directory: undefined,
      mouse: true,
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

  it('enables the mouse by default and turns it off with --no-mouse', () => {
    expect(parseCliArgs([]).mouse).toBe(true);
    expect(parseCliArgs(['--no-mouse']).mouse).toBe(false);
  });

  it('shows stashes by default and hides them with --no-stash', () => {
    expect(parseCliArgs([]).stash).toBe(true);
    expect(parseCliArgs(['--no-stash']).stash).toBe(false);
  });
});

describe('revisões, caminhos e -C', () => {
  it('usa os padrões sem posicionais', () => {
    const options = parseCliArgs([]);
    expect(options.revs).toEqual([]);
    expect(options.paths).toEqual([]);
    expect(options.directory).toBeUndefined();
  });

  it('lê revisões posicionais, em qualquer posição entre as opções', () => {
    expect(parseCliArgs(['main', 'feature-x']).revs).toEqual(['main', 'feature-x']);
    const options = parseCliArgs(['main', '--ascii', 'v1.0..main', '-n', '5']);
    expect(options.revs).toEqual(['main', 'v1.0..main']);
    expect(options.ascii).toBe(true);
    expect(options.maxCount).toBe(5);
  });

  it('separa os caminhos após --', () => {
    const options = parseCliArgs(['main', '--', 'src/', 'README.md']);
    expect(options.revs).toEqual(['main']);
    expect(options.paths).toEqual(['src/', 'README.md']);
  });

  it('aceita só caminhos, e opções parecidas após -- viram caminhos', () => {
    const options = parseCliArgs(['--', 'src/', '--ascii']);
    expect(options.revs).toEqual([]);
    expect(options.paths).toEqual(['src/', '--ascii']);
    expect(options.ascii).toBe(false);
  });

  it('lê -C e --directory', () => {
    expect(parseCliArgs(['-C', '/tmp/repo']).directory).toBe('/tmp/repo');
    expect(parseCliArgs(['--directory=../outro']).directory).toBe('../outro');
  });

  it('rejeita -C sem valor', () => {
    expect(() => parseCliArgs(['-C'])).toThrow(UsageError);
  });
});

describe('filtros do log', () => {
  it('lê cada filtro', () => {
    expect(
      parseCliArgs(['--author', 'Ana', '--since=2 weeks ago', '--until', '2026-02-01', '--first-parent', '--no-remotes', '--no-tags']).filters,
    ).toEqual({
      author: 'Ana',
      since: '2 weeks ago',
      until: '2026-02-01',
      firstParent: true,
      hideRemotes: true,
      hideTags: true,
    });
  });

  it('não define o que não foi pedido', () => {
    expect(parseCliArgs(['--no-tags']).filters).toEqual({hideTags: true});
  });

  it('rejeita --author sem valor', () => {
    expect(() => parseCliArgs(['--author'])).toThrow(UsageError);
  });
});
