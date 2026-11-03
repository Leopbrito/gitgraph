import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {arrow, arrows, ellipsis, rule, separator, type Display} from '../../src/ui/display.js';

const uiDir = join(import.meta.dirname, '..', '..', 'src', 'ui');

// Decorative characters that --ascii must replace: separator, ellipsis, arrows and box drawing.
const SYMBOLS = /[·…⋯→↑↓─│]/;

describe('--ascii covers the interface texts', () => {
  it('has no symbol in a component unless the same line chooses by display.ascii', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(uiDir).filter(name => name.endsWith('.tsx'))) {
      readFileSync(join(uiDir, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
          if (SYMBOLS.test(line) && !/ascii/.test(line)) offenders.push(`${file}:${i + 1}: ${code}`);
        });
    }
    // The keymap table keeps its Unicode keys and turns them into words itself (asciiKeys).
    expect(offenders).toEqual([]);
  });

  it('gives an ASCII form of every symbol', () => {
    const ascii: Display = {color: false, ascii: true, spaced: true};
    const unicode: Display = {color: false, ascii: false, spaced: true};
    for (const f of [separator, ellipsis, arrow, arrows]) {
      expect(f(ascii)).toMatch(/^[\x20-\x7e]+$/);
      expect(f(unicode)).not.toBe(f(ascii));
    }
    expect(rule(ascii, 3)).toBe('---');
    expect(rule(unicode, 3)).toBe('───');
  });
});
