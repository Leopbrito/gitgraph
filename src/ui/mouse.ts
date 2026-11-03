/**
 * Mouse events from the terminal (xterm SGR mode, `ESC [ < b ; x ; y M|m`).
 * Pure: the terminal side lives in `terminalMouse.ts`.
 */

export interface MouseEvent {
  type: 'click' | 'wheelUp' | 'wheelDown';
  /** 0-based screen line and column. */
  row: number;
  col: number;
}

export type MouseListener = (event: MouseEvent) => void;

/** Where mouse events come from; injected into the Browser like `load`. */
export interface MouseSource {
  subscribe(listener: MouseListener): () => void;
}

// SGR mouse reports start with ESC.
const SGR = /\u{1B}\[<(\d+);(\d+);(\d+)([Mm])/gu;

/**
 * Splits mouse reports from regular input. Only left-button presses and the
 * wheel are reported; releases, drags and other buttons are dropped. `rest` is
 * the input without any mouse report, to be handed to the keyboard handling.
 */
export function parseMouse(data: string): {events: MouseEvent[]; rest: string} {
  const events: MouseEvent[] = [];
  const rest = data.replace(SGR, (_, code: string, x: string, y: string, final: string) => {
    const button = Number(code);
    const row = Number(y) - 1;
    const col = Number(x) - 1;
    if (button & 64) {
      // Wheel: 64 = up, 65 = down (the low bits hold the direction).
      if (final === 'M') events.push({type: (button & 3) === 0 ? 'wheelUp' : 'wheelDown', row, col});
    } else if (final === 'M' && (button & 3) === 0 && !(button & 32)) {
      events.push({type: 'click', row, col});
    }
    return '';
  });
  return {events, rest};
}

// The start of a report cut off before its final byte. Only `ESC [ <` is held back: a bare
// `ESC` (or `ESC [`) at the end of a chunk is more likely the Esc key than a split report.
// SGR mouse reports start with ESC.
const INCOMPLETE = /\u{1B}\[<[\d;]{0,16}$/u;

/**
 * Like `parseMouse`, for a stream: a report may arrive split across two chunks
 * (common when scrolling fast over ssh). The unfinished tail is returned as
 * `pending` to be passed back in with the next chunk, so its halves are never
 * handed to the keyboard handling as typed text.
 */
export function splitMouse(pending: string, data: string): {events: MouseEvent[]; rest: string; pending: string} {
  const {events, rest} = parseMouse(pending + data);
  const cut = INCOMPLETE.exec(rest);
  return cut ? {events, rest: rest.slice(0, cut.index), pending: cut[0]} : {events, rest, pending: ''};
}
