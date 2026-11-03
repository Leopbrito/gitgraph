import {splitMouse, type MouseListener, type MouseSource} from './ui/mouse.js';

// 1000 = report button presses and the wheel, 1006 = SGR encoding (no 223-column limit).
const ENABLE = '\u001B[?1000h\u001B[?1006h';
const DISABLE = '\u001B[?1006l\u001B[?1000l';

export interface TerminalMouse {
  source: MouseSource;
  /** Turns mouse reporting off and gives stdin back to Ink untouched. Safe to call twice. */
  dispose: () => void;
}

/**
 * Ink 8 has no mouse API: it reads stdin with `read()` and drops the reports
 * as unknown sequences. A second `data` listener would fight Ink over the
 * stream, so `read()` is wrapped instead: reports are removed from each chunk
 * and sent to the listeners, and Ink only sees the keyboard input.
 */
export function enableTerminalMouse(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): TerminalMouse {
  const listeners = new Set<MouseListener>();
  const original = stdin.read;
  // The start of a report that arrived cut in two; completed by the next chunk.
  let pending = '';

  stdin.read = function (this: NodeJS.ReadStream, ...args: Parameters<typeof original>) {
    for (;;) {
      const chunk: unknown = original.apply(this, args);
      if (chunk === null || chunk === undefined) return chunk;
      const {events, rest, pending: unfinished} = splitMouse(pending, String(chunk));
      pending = unfinished;
      for (const event of events) for (const listener of [...listeners]) listener(event);
      // A chunk with nothing but mouse reports would reach Ink as empty input: read on.
      if (rest !== '') return rest;
    }
  } as typeof original;

  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    stdin.read = original;
    stdout.write(DISABLE);
    process.off('exit', dispose);
  };
  // Terminal modes outlive the process: also turn it off if we die with an error.
  process.on('exit', dispose);
  stdout.write(ENABLE);

  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    dispose,
  };
}
