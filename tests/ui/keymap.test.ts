import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {HELP, OPTIONS} from '../../src/args.js';
import {asciiKeys, CONTEXT_TITLES, footerHint, HANDLED_CHARS, SHORTCUTS, shortcutLines} from '../../src/ui/keymap.js';

const uiDir = join(import.meta.dirname, '..', '..', 'src', 'ui');
const components = readdirSync(uiDir).filter(file => file.endsWith('.tsx'));

/** Every single character the components compare `input` with, per file: the keys the code handles. */
function handledKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of components) {
    const text = readFileSync(join(uiDir, file), 'utf8');
    for (const [, key] of text.matchAll(/input === '(.)'/g)) {
      if (key === undefined) continue;
      found.set(key, [...(found.get(key) ?? []), file]);
    }
  }
  return found;
}

describe('the shortcut table covers the code', () => {
  it('sees the keys the components handle (sanity check of the scan itself)', () => {
    const keys = handledKeys();
    expect(keys.size).toBeGreaterThan(30);
    expect(keys.get('q')).toContain('Browser.tsx');
    expect(keys.get('u')).toContain('DiffView.tsx');
  });

  it('lists every key some component handles', () => {
    const missing = [...handledKeys()]
      .filter(([key]) => !HANDLED_CHARS.has(key))
      .map(([key, files]) => `'${key}' (${[...new Set(files)].join(', ')})`);
    // When this fails: add the key to SHORTCUTS in src/ui/keymap.ts, which feeds the help screen and --help.
    expect(missing).toEqual([]);
  });

  it('does not list keys that no component handles', () => {
    const handled = new Set(handledKeys().keys());
    const stale = [...HANDLED_CHARS].filter(key => !handled.has(key));
    expect(stale).toEqual([]);
  });
});

describe('--help', () => {
  it('mentions every option the parser accepts', () => {
    const missing = Object.keys(OPTIONS).filter(name => !HELP.includes(`--${name}`));
    expect(missing).toEqual([]);
  });

  it('lists every shortcut under its section title', () => {
    for (const [context, title] of Object.entries(CONTEXT_TITLES)) {
      expect(HELP).toContain(`${title}:`);
      for (const line of shortcutLines(context as keyof typeof CONTEXT_TITLES)) expect(HELP).toContain(line);
    }
    expect(HELP).toContain('cherry-pick');
    expect(HELP).toContain('fetch');
  });
});

describe('footerHint and asciiKeys', () => {
  it('builds the footer from the entries that ask for it', () => {
    const hint = footerHint('·', false);
    expect(hint).toBe(
      SHORTCUTS.filter(s => s.footer)
        .map(s => s.footer)
        .join(' · '),
    );
    for (const text of ['j/k ↑/↓ mover', 'c checkout', 'm merge', '? ajuda', 'q sair']) expect(hint).toContain(text);
  });

  it('turns arrows into words for --ascii', () => {
    expect(asciiKeys('j/k ↑/↓ mover')).toBe('j/k Up/Down mover');
    expect(asciiKeys('h / ←,  l / →')).toBe('h / Left,  l / Right');
    expect(footerHint('|', true)).not.toMatch(/[↑↓←→]/);
  });
});
