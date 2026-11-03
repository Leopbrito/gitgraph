import {describe, expect, it} from 'vitest';
import {parseCliArgs, UsageError} from '../src/args.js';

describe('parseCliArgs', () => {
  it('usa os padrões sem argumentos', () => {
    expect(parseCliArgs([])).toEqual({
      maxCount: undefined,
      color: true,
      ascii: false,
      compact: false,
      date: 'short',
      order: 'date',
      stash: true,
      filters: {},
      revs: [],
      paths: [],
      directory: undefined,
      laneColors: undefined,
      watch: false,
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

describe('--watch', () => {
  it('is off by default and on with --watch', () => {
    expect(parseCliArgs([]).watch).toBe(false);
    expect(parseCliArgs(['--watch']).watch).toBe(true);
  });
});

describe('--date', () => {
  it('defaults to short and accepts the known styles', () => {
    expect(parseCliArgs([]).date).toBe('short');
    expect(parseCliArgs(['--date', 'iso']).date).toBe('iso');
    expect(parseCliArgs(['--date=relative']).date).toBe('relative');
  });

  it('rejects an unknown style', () => {
    expect(() => parseCliArgs(['--date=full'])).toThrow('--date deve ser short, iso, relative');
  });
});

describe('arquivo de configuração', () => {
  const file = {order: 'topo', date: 'iso', compact: true, ascii: true, color: false, stash: false, mouse: false, watch: true, maxCount: 40} as const;

  it('o arquivo vale no lugar dos padrões', () => {
    const options = parseCliArgs([], {}, () => file);
    expect(options).toMatchObject({
      order: 'topo',
      date: 'iso',
      compact: true,
      ascii: true,
      color: false,
      stash: false,
      mouse: false,
      watch: true,
      maxCount: 40,
    });
  });

  it('as flags vencem o arquivo, inclusive as que desligam', () => {
    const options = parseCliArgs(
      ['--order=date', '--date=short', '--no-compact', '--no-ascii', '--color', '--stash', '--mouse', '--no-watch', '-n', '7'],
      {},
      () => file,
    );
    expect(options).toMatchObject({
      order: 'date',
      date: 'short',
      compact: false,
      ascii: false,
      color: true,
      stash: true,
      mouse: true,
      watch: false,
      maxCount: 7,
    });
  });

  it('as flags que ligam também vencem o arquivo, e a negativa ganha se vierem as duas', () => {
    expect(parseCliArgs(['--compact'], {}, () => ({compact: false})).compact).toBe(true);
    expect(parseCliArgs(['--compact', '--no-compact']).compact).toBe(false);
  });

  it('NO_COLOR vale sobre o padrão, mas o arquivo e as flags o sobrepõem', () => {
    expect(parseCliArgs([], {NO_COLOR: '1'}).color).toBe(false);
    expect(parseCliArgs([], {NO_COLOR: '1'}, () => ({color: true})).color).toBe(true);
    expect(parseCliArgs(['--color'], {NO_COLOR: '1'}).color).toBe(true);
  });

  it('entrega as cores das lanes', () => {
    expect(parseCliArgs([], {}, () => ({colors: {lanes: ['red', '#00ff00']}})).laneColors).toEqual(['red', '#00ff00']);
  });

  it('não lê o arquivo para --help nem --version, então um arquivo quebrado não os impede', () => {
    const broken = () => {
      throw new Error('arquivo quebrado');
    };
    expect(parseCliArgs(['--help'], {}, broken).help).toBe(true);
    expect(parseCliArgs(['-v'], {}, broken).version).toBe(true);
    expect(() => parseCliArgs([], {}, broken)).toThrow('arquivo quebrado');
  });

  it('valida a ordem e a data que vêm do arquivo com a mesma mensagem', () => {
    expect(() => parseCliArgs([], {}, () => ({order: 'x' as 'topo'}))).toThrow('--order deve ser');
  });
});
