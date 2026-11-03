import {parseArgs} from 'node:util';
import type {FileConfig} from './config.js';
import {CONTEXT_TITLES, shortcutLines} from './ui/keymap.js';
import {DATE_STYLES, type DateStyle} from './ui/date.js';
import {COMMIT_ORDERS, type CommitOrder, type LogFilters} from './git/log.js';

export interface CliOptions {
  /** Limite de commits; sem ele a TUI carrega sob demanda e o pipe imprime tudo. */
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

/** Erro de uso da linha de comando (a CLI sai com código 2). */
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
  ['-C, --directory <caminho>', 'abre o repositório de outro diretório, sem precisar de cd'],
  ['-n, --max-count <n>', 'mostra no máximo n commits (padrão: sem limite)'],
  ['--author <padrão>', 'só commits cujo autor casa com o padrão (regex, como no git log)'],
  ['--since <data>', 'só commits depois da data ("2 weeks ago", 2026-01-31)'],
  ['--until <data>', 'só commits até a data'],
  ['--first-parent', 'segue só o primeiro pai de cada merge'],
  ['--no-remotes', 'esconde as branches remotas'],
  ['--no-tags', 'esconde as tags'],
  ['--order <ordem>', 'ordem dos commits: date (padrão), author-date ou topo'],
  ['--date <formato>', 'formato das datas: short (padrão), iso ou relative (há 3 dias)'],
  ['--color, --no-color', 'liga / desliga as cores (NO_COLOR também desliga)'],
  ['--ascii, --no-ascii', 'usa só caracteres ASCII no grafo e na interface'],
  ['--compact, --no-compact', 'uma linha por commit, sem a linha de ligação entre eles'],
  ['--stash, --no-stash', 'mostra / esconde os stashes no grafo'],
  ['--uncommitted, --no-uncommitted', 'mostra / esconde o nó das alterações não commitadas'],
  ['--watch, --no-watch', 'recarrega o grafo sozinho quando o repositório muda (r recarrega à mão)'],
  ['--mouse, --no-mouse', 'liga / desliga o mouse (sem ele o terminal volta a selecionar texto)'],
  ['-h, --help', 'mostra esta ajuda'],
  ['-v, --version', 'mostra a versão'],
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
  'gitgraph: mostra o grafo de branches do repositório git atual no terminal.',
  '',
  'Uso: gitgraph [opções] [<revisão>...] [-- <caminho>...]',
  '',
  'Sem revisões mostra todas as branches, remotas e tags. Com revisões (main, feature-x,',
  'v1.0..main, um hash) mostra só o que é alcançável delas; após -- limita o histórico',
  'a commits que mexeram nos caminhos.',
  '',
  'Opções:',
  ...optionLines(),
  '',
  'Padrões podem ficar em $XDG_CONFIG_HOME/gitgraph/config.json (ou ~/.config/gitgraph/config.json);',
  'as opções da linha de comando têm precedência sobre o arquivo.',
  '',
  'No terminal a interface é interativa; com a saída redirecionada (pipe), imprime texto puro.',
  '',
  'Teclas (a tecla ? mostra esta lista dentro da interface):',
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
    throw new UsageError(`--max-count deve ser um inteiro positivo (recebido: "${raw}")`);
  }
  const order = values.order ?? file.order ?? 'date';
  if (!isCommitOrder(order)) {
    throw new UsageError(
      `--order deve ser ${COMMIT_ORDERS.join(', ')} (recebido: "${order}")`,
    );
  }
  const date = values.date ?? file.date ?? 'short';
  if (!isDateStyle(date)) {
    throw new UsageError(`--date deve ser ${DATE_STYLES.join(', ')} (recebido: "${date}")`);
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
      return `opção desconhecida: ${quoted}`;
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return `a opção ${quoted || 'informada'} exige um valor`;
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL':
      return `argumento inesperado: ${quoted}`;
    default:
      return message;
  }
}
