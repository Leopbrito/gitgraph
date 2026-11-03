import {describe, expect, it} from 'vitest';
import {parseCliArgs, UsageError} from '../src/args.js';

describe('parseCliArgs', () => {
  it('uses the defaults without arguments', () => {
    expect(parseCliArgs([])).toEqual({
      maxCount: undefined,
      color: true,
      ascii: false,
      compact: false,
      date: 'short',
      order: 'date',
      stash: true,
      uncommitted: true,
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

  it('reads -n and --max-count', () => {
    expect(parseCliArgs(['-n', '50']).maxCount).toBe(50);
    expect(parseCliArgs(['--max-count', '7']).maxCount).toBe(7);
    expect(parseCliArgs(['--max-count=12']).maxCount).toBe(12);
  });

  it.each(['0', '-3', 'abc', '1.5', '', '10x'])('rejects --max-count %j', value => {
    expect(() => parseCliArgs([`--max-count=${value}`])).toThrow(UsageError);
  });

  it('turns the color off with --no-color or NO_COLOR', () => {
    expect(parseCliArgs(['--no-color']).color).toBe(false);
    expect(parseCliArgs([], {NO_COLOR: '1'}).color).toBe(false);
    // An empty NO_COLOR does not count, per no-color.org.
    expect(parseCliArgs([], {NO_COLOR: ''}).color).toBe(true);
  });

  it('reads --compact', () => {
    expect(parseCliArgs(['--compact']).compact).toBe(true);
  });

  it('reads --ascii, --help and --version (short forms included)', () => {
    expect(parseCliArgs(['--ascii']).ascii).toBe(true);
    expect(parseCliArgs(['-h']).help).toBe(true);
    expect(parseCliArgs(['--version']).version).toBe(true);
    expect(parseCliArgs(['-v']).version).toBe(true);
  });

  it('explains the usage errors', () => {
    expect(() => parseCliArgs(['--foo'])).toThrow('unknown option: --foo');
    expect(() => parseCliArgs(['-n'])).toThrow(/needs a value/);
  });

  it('reads --order and defaults to date', () => {
    expect(parseCliArgs([]).order).toBe('date');
    expect(parseCliArgs(['--order', 'topo']).order).toBe('topo');
    expect(parseCliArgs(['--order=author-date']).order).toBe('author-date');
    expect(parseCliArgs(['--order', 'date']).order).toBe('date');
  });

  it.each(['topological', '', 'DATE'])('rejects --order %j', value => {
    expect(() => parseCliArgs([`--order=${value}`])).toThrow(/--order must be date, author-date, topo/);
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

describe('revisions, paths and -C', () => {
  it('uses the defaults without positionals', () => {
    const options = parseCliArgs([]);
    expect(options.revs).toEqual([]);
    expect(options.paths).toEqual([]);
    expect(options.directory).toBeUndefined();
  });

  it('reads positional revisions, anywhere among the options', () => {
    expect(parseCliArgs(['main', 'feature-x']).revs).toEqual(['main', 'feature-x']);
    const options = parseCliArgs(['main', '--ascii', 'v1.0..main', '-n', '5']);
    expect(options.revs).toEqual(['main', 'v1.0..main']);
    expect(options.ascii).toBe(true);
    expect(options.maxCount).toBe(5);
  });

  it('splits the paths after --', () => {
    const options = parseCliArgs(['main', '--', 'src/', 'README.md']);
    expect(options.revs).toEqual(['main']);
    expect(options.paths).toEqual(['src/', 'README.md']);
  });

  it('accepts only paths, and option-like words after -- become paths', () => {
    const options = parseCliArgs(['--', 'src/', '--ascii']);
    expect(options.revs).toEqual([]);
    expect(options.paths).toEqual(['src/', '--ascii']);
    expect(options.ascii).toBe(false);
  });

  it('reads -C and --directory', () => {
    expect(parseCliArgs(['-C', '/tmp/repo']).directory).toBe('/tmp/repo');
    expect(parseCliArgs(['--directory=../other']).directory).toBe('../other');
  });

  it('rejects -C without a value', () => {
    expect(() => parseCliArgs(['-C'])).toThrow(UsageError);
  });
});

describe('log filters', () => {
  it('reads each filter', () => {
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

  it('does not set what was not asked for', () => {
    expect(parseCliArgs(['--no-tags']).filters).toEqual({hideTags: true});
  });

  it('rejects --author without a value', () => {
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
    expect(() => parseCliArgs(['--date=full'])).toThrow('--date must be short, iso, relative');
  });
});

describe('config file', () => {
  const file = {order: 'topo', date: 'iso', compact: true, ascii: true, color: false, stash: false, mouse: false, watch: true, maxCount: 40} as const;

  it('the file replaces the defaults', () => {
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

  it('the flags beat the file, the ones that turn things off included', () => {
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

  it('the enabling flags also beat the file, and the negative wins if both come', () => {
    expect(parseCliArgs(['--compact'], {}, () => ({compact: false})).compact).toBe(true);
    expect(parseCliArgs(['--compact', '--no-compact']).compact).toBe(false);
  });

  it('NO_COLOR beats the default, but the file and the flags override it', () => {
    expect(parseCliArgs([], {NO_COLOR: '1'}).color).toBe(false);
    expect(parseCliArgs([], {NO_COLOR: '1'}, () => ({color: true})).color).toBe(true);
    expect(parseCliArgs(['--color'], {NO_COLOR: '1'}).color).toBe(true);
  });

  it('passes on the lane colors', () => {
    expect(parseCliArgs([], {}, () => ({colors: {lanes: ['red', '#00ff00']}})).laneColors).toEqual(['red', '#00ff00']);
  });

  it('does not read the file for --help or --version, so a broken file does not stop them', () => {
    const broken = () => {
      throw new Error('broken file');
    };
    expect(parseCliArgs(['--help'], {}, broken).help).toBe(true);
    expect(parseCliArgs(['-v'], {}, broken).version).toBe(true);
    expect(() => parseCliArgs([], {}, broken)).toThrow('broken file');
  });

  it('validates the order and the date from the file with the same message', () => {
    expect(() => parseCliArgs([], {}, () => ({order: 'x' as 'topo'}))).toThrow('--order must be');
  });
});

describe('--uncommitted', () => {
  it('is on by default; the flags and the file turn it off and on', () => {
    expect(parseCliArgs([]).uncommitted).toBe(true);
    expect(parseCliArgs(['--no-uncommitted']).uncommitted).toBe(false);
    expect(parseCliArgs([], {}, () => ({uncommitted: false})).uncommitted).toBe(false);
    expect(parseCliArgs(['--uncommitted'], {}, () => ({uncommitted: false})).uncommitted).toBe(true);
  });
});
