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
  {context: 'list', keys: 'j / ↓,  k / ↑', chars: 'jk', action: 'move the selection', footer: 'j/k ↑/↓ move'},
  {context: 'list', keys: 'PgDn,  PgUp', chars: '', action: 'move one page'},
  {context: 'list', keys: 'g / Home,  G / End', chars: 'gG', action: 'go to the start / the end'},
  {context: 'list', keys: 'h / ←,  l / →', chars: 'hl', action: 'scroll the graph sideways (wide graphs)'},
  {context: 'list', keys: 'Enter / d', chars: 'd', action: 'open the commit: message, files and diff', footer: 'Enter open'},
  {context: 'list', keys: 's', chars: 's', action: 'search commits by message, author, e-mail or hash', footer: 's search'},
  {context: 'list', keys: 'n,  N', chars: 'nN', action: 'next / previous search result (n loads more history)'},
  {context: 'list', keys: '/', chars: '/', action: 'filter by branches (Space marks several)', footer: '/ branch'},
  {context: 'list', keys: 'r', chars: 'r', action: 'reload the graph, keeping the selection'},
  {context: 'list', keys: 'f', chars: 'f', action: 'fetch the remotes (git fetch --all --prune)'},
  {context: 'list', keys: 'y', chars: 'y', action: 'copy the hash of the selected commit'},
  {context: 'list', keys: 'c', chars: 'c', action: 'check out the commit (or the branch pointing at it)', footer: 'c checkout'},
  {context: 'list', keys: 'm', chars: 'm', action: 'merge into the current branch; with a stopped operation, opens its dialog', footer: 'm merge'},
  {context: 'list', keys: 'C,  v', chars: 'Cv', action: 'cherry-pick / revert the commit on the current branch'},
  {context: 'list', keys: 'X', chars: 'X', action: 'reset the current branch to the commit (soft, mixed, hard)'},
  {context: 'list', keys: 'b,  t,  T', chars: 'btT', action: 'create a branch / tag / annotated tag at the commit'},
  {context: 'list', keys: 'R,  D', chars: 'RD', action: 'rename / delete a local branch or tag of the commit'},
  {context: 'list', keys: 'a,  p,  x', chars: 'apx', action: 'on a stash: apply / pop / drop'},
  {context: 'list', keys: 'Esc', chars: '', action: 'clear the search and the footer error'},
  {context: 'list', keys: '?', chars: '?', action: 'this help', footer: '? help'},
  {context: 'list', keys: 'q', chars: 'q', action: 'quit', footer: 'q quit'},
  {context: 'list', keys: 'click,  double click,  wheel', chars: '', action: 'select / open the commit / move the selection (--no-mouse turns it off)'},

  // The commit view (Enter / d).
  {context: 'commit', keys: 'Tab', chars: '', action: 'switch the focus between the message and the files'},
  {context: 'commit', keys: 'j / ↓,  k / ↑,  PgDn,  PgUp,  g,  G', chars: 'jkgG', action: 'move the selection or scroll the message'},
  {context: 'commit', keys: 'Enter', chars: '', action: 'diff of the selected file (or of the commit, if the focus is on the message)'},
  {context: 'commit', keys: 'd', chars: 'd', action: 'diff of the whole commit'},
  {context: 'commit', keys: 'Esc / q', chars: 'q', action: 'back to the list'},
  {context: 'commit', keys: 'click,  double click,  wheel', chars: '', action: 'select the file / open its diff / scroll'},

  // The diff of a file or commit.
  {context: 'diff', keys: 'j / ↓,  k / ↑,  PgDn / Space,  PgUp,  g,  G', chars: 'jkgG ', action: 'scroll the diff'},
  {context: 'diff', keys: 'n,  N', chars: 'nN', action: 'next / previous change (side by side)'},
  {context: 'diff', keys: 'u', chars: 'u', action: 'switch between side by side and unified'},
  {context: 'diff', keys: 'Esc / q', chars: 'q', action: 'back to the commit view'},

  // Dialogs and text fields (checkout, merge, stash, refs, reset, operations).
  {context: 'dialog', keys: 'Enter / y,  Esc / n', chars: 'yn', action: 'confirm / cancel'},
  {context: 'dialog', keys: '↑ / ↓  (j / k)', chars: 'jk', action: 'choose from a list'},
  {context: 'dialog', keys: 'a,  c,  s,  d', chars: 'acsd', action: 'stopped operation: abort / continue / skip / leave in progress'},
  {context: 'dialog', keys: 'Space', chars: ' ', action: 'in the branch filter: mark or unmark'},
  {context: 'dialog', keys: 'text,  Backspace,  Enter,  Esc', chars: '', action: 'name and search fields'},
];

export const CONTEXT_TITLES: Record<ShortcutContext, string> = {
  list: 'Commit list',
  commit: 'Commit view (Enter or d)',
  diff: 'Diff',
  dialog: 'Dialogs and text fields',
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
