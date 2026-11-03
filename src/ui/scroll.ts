import {clamp} from './viewport.js';

/** Wraps text to `width` columns, at spaces when possible. Blank lines are kept. */
export function wrapText(text: string, width: number): string[] {
  const size = Math.max(1, width);
  const out: string[] = [];
  for (const line of text.replace(/\t/g, '    ').split('\n')) {
    let rest = line.trimEnd();
    if (rest === '') {
      out.push('');
      continue;
    }
    while (rest.length > size) {
      const cut = rest.lastIndexOf(' ', size);
      const at = cut > 0 ? cut : size;
      out.push(rest.slice(0, at).trimEnd());
      rest = rest.slice(at).trimStart();
    }
    out.push(rest);
  }
  return out;
}

/** The offset after scrolling by `delta` lines; never past the last full window. */
export function scrollBy(offset: number, delta: number, total: number, view: number): number {
  return clamp(offset + delta, 0, Math.max(0, total - view));
}

/** The smallest offset that keeps `selected` inside a window of `view` equal-height rows. */
export function keepVisible(offset: number, selected: number, view: number): number {
  if (selected < offset) return selected;
  if (selected >= offset + view) return selected - view + 1;
  return offset;
}
