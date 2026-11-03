import {parseArgs} from 'node:util';
import type {FileConfig} from './config.js';
import {CONTEXT_TITLES, shortcutLines} from './ui/keymap.js';
import {DATE_STYLES, type DateStyle} from './ui/date.js';
import {COMMIT_ORDERS, type CommitOrder, type LogFilters} from './git/log.js';

export interface CliOptions {
  /** Commit limit; without it the TUI loads on demand and the pipe prints everything. */
  maxCount: number | undefined;
  color: boolean;
  ascii: boolean;
  /** One line per commit, without the connector line between them. */
  compact: boolean;
  /** How commit dates are written. */
  date: DateStyle;
  /** How commits are ordered (see `CommitOrder`). */
  order: CommitOrder;
  /** Show the stash entries in the graph. */
  stash: boolean;
  /** Filters on the history (author, dates, first parent, hidden refs). */
  filters: LogFilters;
  /** Revisions to start from (branches, tags, hashes, ranges); empty means all refs. */
  revs: string[];
  /** Paths that limit the history (everything after `--`). */
  paths: string[];
  /** `-C <path>`: run as if started in this directory. */
  directory: string | undefined;
  /** Show the uncommitted changes as a node above HEAD. */
  uncommitted: boolean;
  /** Reload the graph when the repository changes outside the TUI. */
  watch: boolean;
  /** Colors of the graph lanes from the config file (the built-in palette when absent). */
  laneColors: string[] | undefined;
  /** Enable mouse support (click and wheel) in the TUI. */
  mouse: boolean;
  help: boolean;
  version: boolean;
}

/** A command line usage error (the CLI exits with status 2). */
export class UsageError extends Error {}

export const OPTIONS = {
    directory: {type: 'string', short: 'C'},
    author: {type: 'string'},
    since: {type: 'string'},
    until: {type: 'string'},
    'first-parent': {type: 'boolean'},
    'no-remotes': {type: 'boolean'},
    'no-tags': {type: 'boolean'},
    'max-count': {type: 'string', short: 'n'},
    color: {type: 'boolean'},
    'no-color': {type: 'boolean'},
    ascii: {type: 'boolean'},
    'no-ascii': {type: 'boolean'},
    compact: {type: 'boolean'},
    'no-compact': {type: 'boolean'},
    stash: {type: 'boolean'},
    uncommitted: {type: 'boolean'},
    'no-uncommitted': {type: 'boolean'},
    order: {type: 'string'},
    date: {type: 'string'},
    'no-stash': {type: 'boolean'},
    watch: {type: 'boolean'},
    'no-watch': {type: 'boolean'},
    mouse: {type: 'boolean'},
    'no-mouse': {type: 'boolean'},
    help: {type: 'boolean', short: 'h'},
    version: {type: 'boolean', short: 'v'},
} as const;

/** Every option with the text for `--help`, in the order shown. A test checks that each key of OPTIONS is mentioned. */
const OPTION_DOCS: [flags: string, text: string][] = [
  ['-C, --directory <path>', 'open the repository in another directory, without a cd'],
  ['-n, --max-count <n>', 'show at most n commits (default: no limit)'],
  ['--author <pattern>', 'only commits whose author matches the pattern (regex, as in git log)'],
  ['--since <date>', 'only commits after the date ("2 weeks ago", 2026-01-31)'],
  ['--until <date>', 'only commits up to the date'],
  ['--first-parent', 'follow only the first parent of each merge'],
  ['--no-remotes', 'hide the remote branches'],
  ['--no-tags', 'hide the tags'],
  ['--order <order>', 'commit order: date (default), author-date or topo'],
  ['--date <format>', 'date format: short (default), iso or relative (3 days ago)'],
  ['--color, --no-color', 'turn the colors on / off (NO_COLOR also turns them off)'],
  ['--ascii, --no-ascii', 'use only ASCII characters in the graph and the interface'],
  ['--compact, --no-compact', 'one line per commit, without the connector line between them'],
  ['--stash, --no-stash', 'show / hide the stashes in the graph'],
  ['--uncommitted, --no-uncommitted', 'show / hide the uncommitted changes node'],
  ['--watch, --no-watch', 'reload the graph by itself when commits, refs or the index change (file edits only show with r)'],
  ['--mouse, --no-mouse', 'turn the mouse on / off (without it the terminal selects text again)'],
  ['-h, --help', 'show this help'],
  ['-v, --version', 'show the version'],
];

function optionLines(): string[] {
  const width = Math.max(...OPTION_DOCS.map(([flags]) => flags.length));
  return OPTION_DOCS.map(([flags, text]) => `  ${flags.padEnd(width)}  ${text}`);
}

/** The shortcuts, from the same table as the footer and the help screen. */
function shortcutSections(): string[] {
  return (['list', 'commit', 'diff', 'dialog'] as const).flatMap(context => [
    '',
    `${CONTEXT_TITLES[context]}:`,
    ...shortcutLines(context).map(line => `  ${line}`),
  ]);
}

export const HELP = [
  'gitgraph: shows the branch graph of the current git repository in the terminal.',
  '',
  'Usage: gitgraph [options] [<revision>...] [-- <path>...]',
  '',
  'Without revisions it shows every branch, remote and tag. With revisions (main, feature-x,',
  'v1.0..main, a hash) it shows only what they reach; after -- it limits the history',
  'to commits that touched the paths.',
  '',
  'Options:',
  ...optionLines(),
  '',
  'Defaults can go in $XDG_CONFIG_HOME/gitgraph/config.json (or ~/.config/gitgraph/config.json);',
  'command line options take precedence over the file.',
  '',
  'In a terminal the interface is interactive; with the output redirected (pipe) it prints plain text.',
  '',
  'Keys (the ? key shows this list inside the interface):',
  ...shortcutSections(),
  '',
].join('\n');

/**
 * `config` is read only when the command line is not just --help/--version, so a broken
 * config file never blocks them. Precedence: built-in defaults < config file < flags.
 */
export function parseCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  config: () => FileConfig = () => ({}),
): CliOptions {
  // parseArgs does not say where `--` was, and the paths after it are not revisions.
  const dashes = argv.indexOf('--');
  const paths = dashes === -1 ? [] : argv.slice(dashes + 1);
  let values;
  let positionals: string[];
  try {
    ({values, positionals} = parseArgs({
      args: dashes === -1 ? argv : argv.slice(0, dashes),
      allowPositionals: true,
      options: OPTIONS,
    }));
  } catch (error) {
    throw new UsageError(translate(error));
  }

  const help = values.help ?? false;
  const version = values.version ?? false;
  const file = help || version ? {} : config();

  const raw = values['max-count'];
  if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) {
    throw new UsageError(`--max-count must be a positive integer (got: "${raw}")`);
  }
  const order = values.order ?? file.order ?? 'date';
  if (!isCommitOrder(order)) {
    throw new UsageError(
      `--order must be ${COMMIT_ORDERS.join(', ')} (got: "${order}")`,
    );
  }
  const date = values.date ?? file.date ?? 'short';
  if (!isDateStyle(date)) {
    throw new UsageError(`--date must be ${DATE_STYLES.join(', ')} (got: "${date}")`);
  }
  // `--x` / `--no-x` pair: the one given wins; if both are, the negative does.
  const toggle = (name: 'color' | 'ascii' | 'compact' | 'stash' | 'uncommitted' | 'mouse' | 'watch'): boolean | undefined =>
    values[`no-${name}` as 'no-color'] ? false : values[name] ? true : undefined;
  return {
    maxCount: raw === undefined ? file.maxCount : Number(raw),
    // NO_COLOR is a user-wide default, so the config file and the flags may override it.
    color: toggle('color') ?? file.color ?? !env['NO_COLOR'],
    ascii: toggle('ascii') ?? file.ascii ?? false,
    compact: toggle('compact') ?? file.compact ?? false,
    date,
    order,
    stash: toggle('stash') ?? file.stash ?? true,
    uncommitted: toggle('uncommitted') ?? file.uncommitted ?? true,
    filters: {
      ...(values.author !== undefined && {author: values.author}),
      ...(values.since !== undefined && {since: values.since}),
      ...(values.until !== undefined && {until: values.until}),
      ...(values['first-parent'] && {firstParent: true}),
      ...(values['no-remotes'] && {hideRemotes: true}),
      ...(values['no-tags'] && {hideTags: true}),
    },
    revs: positionals,
    paths,
    directory: values.directory,
    laneColors: file.colors?.lanes,
    watch: toggle('watch') ?? file.watch ?? false,
    mouse: toggle('mouse') ?? file.mouse ?? true,
    help,
    version,
  };
}

const isDateStyle = (value: string): value is DateStyle => (DATE_STYLES as readonly string[]).includes(value);

const isCommitOrder = (value: string): value is CommitOrder =>
  (COMMIT_ORDERS as readonly string[]).includes(value);

function translate(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as NodeJS.ErrnoException).code;
  const quoted = /'([^']+)'/.exec(message)?.[1] ?? '';
  switch (code) {
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return `unknown option: ${quoted}`;
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return `the option ${quoted || 'given'} needs a value`;
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL':
      return `unexpected argument: ${quoted}`;
    default:
      return message;
  }
}
