/**
 * The one table of keyboard shortcuts. The footer, the help screen (`?`) and
 * `--help` are all built from it, so they cannot drift apart; a test checks
 * that every key the components handle is listed here.
 */

export type ShortcutContext = 'list' | 'commit' | 'diff' | 'dialog';

export interface Shortcut {
  context: ShortcutContext;
  /** How the keys are written for the user ("j / ↓"). Arrows become words in ASCII mode. */
  keys: string;
  /** The characters typed that this entry handles (`input === 'x'` in the components), for the coverage test. */
  chars: string;
  action: string;
  /** Short form for the footer of the list, if it deserves a place there. */
  footer?: string;
}

export const SHORTCUTS: Shortcut[] = [
  // The list of commits.
  {context: 'list', keys: 'j / ↓,  k / ↑', chars: 'jk', action: 'move a seleção', footer: 'j/k ↑/↓ mover'},
  {context: 'list', keys: 'PgDn,  PgUp', chars: '', action: 'anda uma página'},
  {context: 'list', keys: 'g / Home,  G / End', chars: 'gG', action: 'vai ao início / ao fim'},
  {context: 'list', keys: 'h / ←,  l / →', chars: 'hl', action: 'rola o grafo na horizontal (grafos largos)'},
  {context: 'list', keys: 'Enter / d', chars: 'd', action: 'abre o commit: mensagem, arquivos e diff', footer: 'Enter abre'},
  {context: 'list', keys: 's', chars: 's', action: 'busca commits por mensagem, autor, e-mail ou hash', footer: 's busca'},
  {context: 'list', keys: 'n,  N', chars: 'nN', action: 'próximo / anterior resultado da busca (n carrega mais histórico)'},
  {context: 'list', keys: '/', chars: '/', action: 'filtra por branches (Espaço marca várias)', footer: '/ branch'},
  {context: 'list', keys: 'r', chars: 'r', action: 'recarrega o grafo mantendo a seleção'},
  {context: 'list', keys: 'f', chars: 'f', action: 'busca as remotas (git fetch --all --prune)'},
  {context: 'list', keys: 'y', chars: 'y', action: 'copia o hash do commit selecionado'},
  {context: 'list', keys: 'c', chars: 'c', action: 'checkout do commit (ou da branch que aponta para ele)', footer: 'c checkout'},
  {context: 'list', keys: 'm', chars: 'm', action: 'merge na branch atual; com operação parada, abre o diálogo dela', footer: 'm merge'},
  {context: 'list', keys: 'C,  v', chars: 'Cv', action: 'cherry-pick / revert do commit na branch atual'},
  {context: 'list', keys: 'X', chars: 'X', action: 'reset da branch atual até o commit (soft, mixed, hard)'},
  {context: 'list', keys: 'b,  t,  T', chars: 'btT', action: 'cria branch / tag / tag anotada no commit'},
  {context: 'list', keys: 'R,  D', chars: 'RD', action: 'renomeia / apaga uma branch local ou tag do commit'},
  {context: 'list', keys: 'a,  p,  x', chars: 'apx', action: 'num stash: aplica / dá pop / apaga'},
  {context: 'list', keys: 'Esc', chars: '', action: 'limpa a busca e o erro do rodapé'},
  {context: 'list', keys: '?', chars: '?', action: 'esta ajuda', footer: '? ajuda'},
  {context: 'list', keys: 'q', chars: 'q', action: 'sai', footer: 'q sair'},
  {context: 'list', keys: 'clique,  duplo clique,  roda', chars: '', action: 'seleciona / abre o commit / move a seleção (--no-mouse desliga)'},

  // The commit view (Enter / d).
  {context: 'commit', keys: 'Tab', chars: '', action: 'alterna o foco entre a mensagem e os arquivos'},
  {context: 'commit', keys: 'j / ↓,  k / ↑,  PgDn,  PgUp,  g,  G', chars: 'jkgG', action: 'move a seleção ou rola a mensagem'},
  {context: 'commit', keys: 'Enter', chars: '', action: 'diff do arquivo selecionado (ou do commit, se o foco está na mensagem)'},
  {context: 'commit', keys: 'd', chars: 'd', action: 'diff do commit inteiro'},
  {context: 'commit', keys: 'Esc / q', chars: 'q', action: 'volta à lista'},
  {context: 'commit', keys: 'clique,  duplo clique,  roda', chars: '', action: 'seleciona o arquivo / abre o diff dele / rola'},

  // The diff of a file or commit.
  {context: 'diff', keys: 'j / ↓,  k / ↑,  PgDn / Espaço,  PgUp,  g,  G', chars: 'jkgG ', action: 'rola o diff'},
  {context: 'diff', keys: 'n,  N', chars: 'nN', action: 'próxima / anterior mudança (lado a lado)'},
  {context: 'diff', keys: 'u', chars: 'u', action: 'alterna entre lado a lado e unificado'},
  {context: 'diff', keys: 'Esc / q', chars: 'q', action: 'volta à visão do commit'},

  // Dialogs and text fields (checkout, merge, stash, refs, reset, operations).
  {context: 'dialog', keys: 'Enter / y,  Esc / n', chars: 'yn', action: 'confirma / cancela'},
  {context: 'dialog', keys: '↑ / ↓  (j / k)', chars: 'jk', action: 'escolhe numa lista'},
  {context: 'dialog', keys: 'a,  c,  s,  d', chars: 'acsd', action: 'operação parada: aborta / continua / pula / deixa em andamento'},
  {context: 'dialog', keys: 'Espaço', chars: ' ', action: 'no filtro de branches: marca ou desmarca'},
  {context: 'dialog', keys: 'texto,  Backspace,  Enter,  Esc', chars: '', action: 'campos de nome e de busca'},
];

export const CONTEXT_TITLES: Record<ShortcutContext, string> = {
  list: 'Lista de commits',
  commit: 'Visão do commit (Enter ou d)',
  diff: 'Diff',
  dialog: 'Diálogos e campos de texto',
};

/** Arrow glyphs as words, for --ascii. */
export function asciiKeys(text: string): string {
  return text
    .replace(/↑\/↓/g, 'Up/Down')
    .replace(/↑/g, 'Up')
    .replace(/↓/g, 'Down')
    .replace(/←/g, 'Left')
    .replace(/→/g, 'Right');
}

/** The footer of the list: the entries marked with `footer`, joined by the separator. */
export function footerHint(separator: string, ascii: boolean): string {
  return SHORTCUTS.filter(s => s.footer)
    .map(s => (ascii ? asciiKeys(s.footer ?? '') : s.footer))
    .join(` ${separator} `);
}

/** One line per shortcut under a title, keys in a column; shared by the help screen and `--help`. */
export function shortcutLines(context: ShortcutContext, ascii = false): string[] {
  const rows = SHORTCUTS.filter(s => s.context === context);
  const keys = rows.map(s => (ascii ? asciiKeys(s.keys) : s.keys));
  const width = Math.max(...keys.map(k => k.length));
  return rows.map((s, i) => `${(keys[i] ?? '').padEnd(width)}  ${s.action}`);
}

/** Every character some entry claims to handle. */
export const HANDLED_CHARS = new Set(SHORTCUTS.flatMap(s => s.chars.split('')));
