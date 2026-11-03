import {describe, expect, it} from 'vitest';
import {parseMouse} from '../../src/ui/mouse.js';

const sgr = (button: number, x: number, y: number, final = 'M') => `\u001B[<${button};${x};${y}${final}`;

describe('parseMouse', () => {
  it('reads a left click as a 0-based position', () => {
    expect(parseMouse(sgr(0, 5, 3))).toEqual({
      events: [{type: 'click', row: 2, col: 4}],
      rest: '',
    });
  });

  it('reads the wheel', () => {
    expect(parseMouse(sgr(64, 1, 1)).events[0]?.type).toBe('wheelUp');
    expect(parseMouse(sgr(65, 1, 1)).events[0]?.type).toBe('wheelDown');
  });

  it('drops releases, drags and other buttons', () => {
    expect(parseMouse(sgr(0, 1, 1, 'm')).events).toEqual([]);
    expect(parseMouse(sgr(32, 1, 1)).events).toEqual([]);
    expect(parseMouse(sgr(1, 1, 1)).events).toEqual([]);
    expect(parseMouse(sgr(2, 1, 1)).events).toEqual([]);
    expect(parseMouse(sgr(65, 1, 1, 'm')).events).toEqual([]);
  });

  it('accepts the wheel with a modifier and keeps the keyboard input', () => {
    // Bit 4 (shift) set on the wheel code.
    const {events, rest} = parseMouse(`j${sgr(68, 2, 2)}k${sgr(0, 1, 4)}`);
    expect(events.map(e => e.type)).toEqual(['wheelUp', 'click']);
    expect(rest).toBe('jk');
  });

  it('leaves other escape sequences alone', () => {
    expect(parseMouse('\u001B[A')).toEqual({events: [], rest: '\u001B[A'});
  });
});
