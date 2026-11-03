import {PassThrough} from 'node:stream';
import {describe, expect, it} from 'vitest';
import {enableTerminalMouse} from '../src/terminalMouse.js';
import type {MouseEvent} from '../src/ui/mouse.js';

function setup() {
  const stdin = new PassThrough();
  stdin.setEncoding('utf8');
  const stdout = new PassThrough();
  const written: string[] = [];
  stdout.on('data', chunk => written.push(String(chunk)));
  const mouse = enableTerminalMouse(stdin as unknown as NodeJS.ReadStream, stdout as unknown as NodeJS.WriteStream);
  const events: MouseEvent[] = [];
  mouse.source.subscribe(event => events.push(event));
  return {stdin, mouse, events, written};
}

const readable = (stdin: PassThrough) => new Promise(resolve => stdin.once('readable', resolve));

describe('enableTerminalMouse', () => {
  it('turns reporting on and off once', async () => {
    const {mouse, written} = setup();
    await Promise.resolve();
    expect(written.join('')).toBe('\u001B[?1000h\u001B[?1006h');
    mouse.dispose();
    mouse.dispose();
    await Promise.resolve();
    expect(written.join('')).toBe('\u001B[?1000h\u001B[?1006h\u001B[?1006l\u001B[?1000l');
  });

  it('sends reports to listeners and the rest to whoever reads stdin', async () => {
    const {stdin, mouse, events} = setup();
    stdin.write('a\u001B[<0;3;4Mb');
    await readable(stdin);
    expect(stdin.read()).toBe('ab');
    expect(events).toEqual([{type: 'click', row: 3, col: 2}]);
    mouse.dispose();
  });

  it('skips chunks made only of mouse reports', async () => {
    const {stdin, mouse, events} = setup();
    stdin.write('\u001B[<65;1;1M');
    await readable(stdin);
    expect(stdin.read()).toBeNull();
    expect(events.map(e => e.type)).toEqual(['wheelDown']);
    mouse.dispose();
  });

  it('gives read() back to the stream on dispose', async () => {
    const {stdin, mouse, events} = setup();
    mouse.dispose();
    stdin.write('\u001B[<0;1;1M');
    await readable(stdin);
    expect(stdin.read()).toBe('\u001B[<0;1;1M');
    expect(events).toEqual([]);
  });
});
