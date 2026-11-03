import {describe, expect, it, vi} from 'vitest';
import {clipboardCommands, copyText, osc52, type Command} from '../src/clipboard.js';

describe('osc52', () => {
  it('encodes the text in base64 between the OSC 52 markers', () => {
    expect(osc52('abc123')).toBe(`\u001B]52;c;${Buffer.from('abc123').toString('base64')}\u0007`);
  });
});

describe('clipboardCommands', () => {
  it('picks the program of each platform', () => {
    expect(clipboardCommands('darwin', {})).toEqual([{cmd: 'pbcopy', args: []}]);
    expect(clipboardCommands('win32', {})).toEqual([{cmd: 'clip', args: []}]);
  });

  it('on linux depends on the display server and has nothing without one', () => {
    expect(clipboardCommands('linux', {WAYLAND_DISPLAY: 'wayland-0'}).map(c => c.cmd)).toEqual(['wl-copy']);
    expect(clipboardCommands('linux', {DISPLAY: ':0'}).map(c => c.cmd)).toEqual(['xclip', 'xsel']);
    expect(clipboardCommands('linux', {WAYLAND_DISPLAY: 'w', DISPLAY: ':0'}).map(c => c.cmd)).toEqual(['wl-copy', 'xclip', 'xsel']);
    expect(clipboardCommands('linux', {})).toEqual([]);
  });
});

describe('copyText', () => {
  it('uses the native program when it works and writes nothing to the terminal', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn();
    expect(await copyText('abc', {platform: 'darwin', env: {}, run, write})).toBe('native');
    expect(run).toHaveBeenCalledWith({cmd: 'pbcopy', args: []}, 'abc');
    expect(write).not.toHaveBeenCalled();
  });

  it('tries the next program and then falls back to OSC 52', async () => {
    const run = vi.fn<(c: Command, t: string) => Promise<void>>().mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce();
    expect(await copyText('abc', {platform: 'linux', env: {DISPLAY: ':0'}, run, write: vi.fn()})).toBe('native');
    expect(run.mock.calls.map(c => c[0].cmd)).toEqual(['xclip', 'xsel']);

    const failing = vi.fn().mockRejectedValue(new Error('missing'));
    const write = vi.fn();
    expect(await copyText('abc', {platform: 'linux', env: {DISPLAY: ':0'}, run: failing, write})).toBe('osc52');
    expect(write).toHaveBeenCalledWith(osc52('abc'));
  });

  it('over ssh goes straight to OSC 52, since the local clipboard is elsewhere', async () => {
    const run = vi.fn();
    const write = vi.fn();
    expect(await copyText('abc', {platform: 'darwin', env: {SSH_CONNECTION: '1 2 3 4'}, run, write})).toBe('osc52');
    expect(run).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(osc52('abc'));
  });

  it('uses OSC 52 when the system has no clipboard program', async () => {
    const write = vi.fn();
    expect(await copyText('abc', {platform: 'linux', env: {}, run: vi.fn(), write})).toBe('osc52');
    expect(write).toHaveBeenCalledOnce();
  });
});
