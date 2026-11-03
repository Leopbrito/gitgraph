import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {HistoryActions, ResetPreview} from '../../src/git/history.js';
import type {Commit} from '../../src/graph/types.js';
import {ResetPrompt} from '../../src/ui/ResetPrompt.js';

const target: Commit = {
  hash: 'abc1234def',
  parents: [],
  author: 'Ana',
  email: 'a@x',
  date: '2026-03-04T10:00:00+00:00',
  subject: 'the target',
  body: '',
};

const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function press(stdin: {write: (s: string) => void}, ...keys: string[]) {
  for (const key of keys) {
    stdin.write(key);
    await tick();
  }
}

function open(preview: ResetPreview | Error = {ahead: 3, orphaned: 1, changed: 2}, branch: string | null = 'main', reset = vi.fn().mockResolvedValue(undefined)) {
  const actions: HistoryActions = {
    cherryPick: vi.fn(),
    revert: vi.fn(),
    resetPreview: vi.fn(() => (preview instanceof Error ? Promise.reject(preview) : Promise.resolve(preview))),
    reset,
  };
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const rendered = render(<ResetPrompt target={target} branch={branch} actions={actions} onDone={onDone} onCancel={onCancel} />);
  return {...rendered, actions, reset, onDone, onCancel};
}

describe('ResetPrompt', () => {
  it('shows what leaves the branch and what a hard reset would discard', async () => {
    const {lastFrame} = open();
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Reset de main para abc1234: 3 commits saem da branch, 1 só no reflog');
    expect(frame).toContain('--soft');
    expect(frame).toContain('--mixed');
    expect(frame).toContain('--hard');
    expect(frame).toContain('descarta os arquivos modificados (2 arquivos modificados)');
  });

  it('works without the preview', async () => {
    const {lastFrame, stdin, reset} = open(new Error('boom'));
    await tick();
    expect(lastFrame()).toContain('calculando…');
    await press(stdin, '\r', 'y');
    expect(reset).toHaveBeenCalledWith('soft', 'abc1234def');
  });

  it.each([
    [[], 'soft'],
    [['j'], 'mixed'],
  ] as const)('soft and mixed ask for a plain confirmation (%j)', async (moves, mode) => {
    const {lastFrame, stdin, reset, onDone} = open();
    await tick();
    await press(stdin, ...moves, '\r');
    expect(lastFrame()).toContain(`git reset --${mode} abc1234?`);
    expect(reset).not.toHaveBeenCalled();
    await press(stdin, 'y');
    await tick();
    expect(reset).toHaveBeenCalledWith(mode, 'abc1234def');
    expect(onDone).toHaveBeenCalledWith(`reset --${mode}: main agora em abc1234`);
  });

  it('n cancels the confirmation', async () => {
    const {stdin, reset, onCancel} = open();
    await tick();
    await press(stdin, '\r', 'n');
    expect(onCancel).toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('hard warns of the losses and only runs after the branch name is typed', async () => {
    const {lastFrame, stdin, reset, onDone} = open();
    await tick();
    await press(stdin, 'j', 'j', '\r');
    expect(lastFrame()).toContain('reset --hard perde 2 arquivos modificados e 3 commits saem da branch, 1 só no reflog');
    expect(lastFrame()).toContain('Digite main para confirmar');
    // Enter without the name, and with a wrong one, does nothing.
    await press(stdin, '\r');
    expect(lastFrame()).toContain('digite exatamente main para confirmar');
    await press(stdin, 'm', 'a', 'i');
    await press(stdin, '\r');
    expect(reset).not.toHaveBeenCalled();
    await press(stdin, 'n', '\r');
    await tick();
    expect(reset).toHaveBeenCalledWith('hard', 'abc1234def');
    expect(onDone).toHaveBeenCalledWith('reset --hard: main agora em abc1234');
  });

  it('with a detached HEAD the word to type is "descartar"', async () => {
    const {lastFrame, stdin, reset} = open(undefined, null);
    await tick();
    expect(lastFrame()).toContain('Reset de HEAD para abc1234');
    await press(stdin, 'j', 'j', '\r');
    expect(lastFrame()).toContain('Digite descartar para confirmar');
    for (const letter of 'descartar') await press(stdin, letter);
    await press(stdin, '\r');
    await tick();
    expect(reset).toHaveBeenCalledWith('hard', 'abc1234def');
  });

  it('shows git\'s refusal and stays open', async () => {
    const reset = vi.fn().mockRejectedValue(new Error('fatal: cannot reset'));
    const {lastFrame, stdin, onDone} = open(undefined, 'main', reset);
    await tick();
    await press(stdin, '\r', 'y');
    await tick();
    expect(lastFrame()).toContain('cannot reset');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Esc cancels from any step', async () => {
    const first = open();
    await tick();
    await press(first.stdin, '\u001B');
    expect(first.onCancel).toHaveBeenCalled();
    const hard = open();
    await tick();
    await press(hard.stdin, 'j', 'j', '\r', '\u001B');
    expect(hard.onCancel).toHaveBeenCalled();
    expect(hard.reset).not.toHaveBeenCalled();
  });
});
