import React from 'react';
import {render} from 'ink-testing-library';
import {describe, expect, it, vi} from 'vitest';
import type {Commit, Ref} from '../../src/graph/types.js';
import {UnmergedBranchError, type RefActions} from '../../src/git/refsEdit.js';
import {RefManager} from '../../src/ui/RefManager.js';
import {refTargets, type RefMode} from '../../src/ui/refTargets.js';

const commit: Commit = {
  hash: 'abc1234def',
  parents: [],
  author: 'Ana',
  email: 'a@x',
  date: '2026-03-04T10:00:00+00:00',
  subject: 's',
  body: '',
};

const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function press(stdin: {write: (s: string) => void}, ...keys: string[]) {
  for (const key of keys) {
    stdin.write(key);
    await tick();
  }
}
const type = (stdin: {write: (s: string) => void}, text: string) => press(stdin, ...text.split(''));

function actions(over: Partial<RefActions> = {}): RefActions {
  return {
    validate: vi.fn().mockResolvedValue(null),
    createBranch: vi.fn().mockResolvedValue(undefined),
    createTag: vi.fn().mockResolvedValue(undefined),
    renameBranch: vi.fn().mockResolvedValue(undefined),
    renameTag: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    uniqueCommits: vi.fn().mockResolvedValue(3),
    ...over,
  };
}

function open(mode: RefMode, refs: Ref[] = [], act = actions(), currentBranch: string | null = 'main') {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const rendered = render(
    <RefManager mode={mode} commit={commit} refs={refs} currentBranch={currentBranch} actions={act} onDone={onDone} onCancel={onCancel} />,
  );
  return {...rendered, act, onDone, onCancel};
}

const refs: Ref[] = [
  {name: 'main', kind: 'branch'},
  {name: 'feature', kind: 'branch'},
  {name: 'origin/feature', kind: 'remote'},
  {name: 'v1', kind: 'tag'},
];

describe('refTargets', () => {
  it('lists local branches and tags, never remotes, and skips the current branch for delete', () => {
    expect(refTargets(refs, 'rename', 'main').map(t => t.name)).toEqual(['main', 'feature', 'v1']);
    expect(refTargets(refs, 'delete', 'main').map(t => t.name)).toEqual(['feature', 'v1']);
    expect(refTargets(refs, 'delete', null).map(t => t.name)).toEqual(['main', 'feature', 'v1']);
  });
});

describe('RefManager create', () => {
  it('creates a branch at the commit with the typed name', async () => {
    const {stdin, act, onDone, lastFrame} = open('branch');
    expect(lastFrame()).toContain('Nova branch em abc1234');
    await type(stdin, 'feat/x');
    expect(lastFrame()).toContain('Nome: feat/x');
    await press(stdin, '\r');
    await tick();
    expect(act.validate).toHaveBeenCalledWith('branch', 'feat/x');
    expect(act.createBranch).toHaveBeenCalledWith('feat/x', 'abc1234def');
    expect(onDone).toHaveBeenCalledWith('branch feat/x criada em abc1234');
  });

  it('backspace edits and an empty name is refused', async () => {
    const {stdin, act, lastFrame} = open('branch');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('digite um nome');
    await type(stdin, 'abc');
    await press(stdin, '\u007F');
    expect(lastFrame()).toContain('Nome: ab');
    expect(lastFrame()).not.toContain('digite um nome');
    expect(act.createBranch).not.toHaveBeenCalled();
  });

  it('shows why a name is not allowed and stays to fix it', async () => {
    const validate = vi.fn().mockResolvedValueOnce('já existe uma branch chamada main').mockResolvedValueOnce(null);
    const {stdin, act, onDone, lastFrame} = open('branch', [], actions({validate}));
    await type(stdin, 'main');
    await press(stdin, '\r');
    await tick();
    expect(lastFrame()).toContain('já existe uma branch chamada main');
    expect(act.createBranch).not.toHaveBeenCalled();
    await press(stdin, '\u007F', '2');
    await press(stdin, '\r');
    await tick();
    expect(act.createBranch).toHaveBeenCalledWith('mai2', 'abc1234def');
    expect(onDone).toHaveBeenCalled();
  });

  it('creates a lightweight tag, and an annotated one after asking for the message', async () => {
    const light = open('tag');
    await type(light.stdin, 'v2');
    await press(light.stdin, '\r');
    await tick();
    expect(light.act.createTag).toHaveBeenCalledWith('v2', 'abc1234def');
    expect(light.onDone).toHaveBeenCalledWith('tag v2 criada em abc1234');

    const noted = open('annotated');
    await type(noted.stdin, 'v3');
    await press(noted.stdin, '\r');
    await tick();
    expect(noted.lastFrame()).toContain('Mensagem:');
    expect(noted.act.createTag).not.toHaveBeenCalled();
    await press(noted.stdin, '\r');
    expect(noted.lastFrame()).toContain('digite a mensagem da tag');
    await type(noted.stdin, 'release 3');
    await press(noted.stdin, '\r');
    await tick();
    expect(noted.act.createTag).toHaveBeenCalledWith('v3', 'abc1234def', 'release 3');
    expect(noted.onDone).toHaveBeenCalledWith('tag v3 criada em abc1234');
  });

  it('shows the error of a failing action and stays open', async () => {
    const createBranch = vi.fn().mockRejectedValue(new Error('fatal: boom'));
    const {stdin, onDone, lastFrame} = open('branch', [], actions({createBranch}));
    await type(stdin, 'x');
    await press(stdin, '\r');
    await tick();
    expect(lastFrame()).toContain('boom');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Esc cancels', async () => {
    const {stdin, onCancel} = open('branch');
    await press(stdin, '\u001B');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('RefManager rename', () => {
  it('asks which ref when there are several, then for the new name starting from the old one', async () => {
    const {stdin, act, onDone, lastFrame} = open('rename', refs);
    expect(lastFrame()).toContain('branch main');
    expect(lastFrame()).toContain('branch feature');
    expect(lastFrame()).toContain('tag v1');
    expect(lastFrame()).not.toContain('origin/feature');
    await press(stdin, 'j', '\r');
    expect(lastFrame()).toContain('Renomear branch feature');
    expect(lastFrame()).toContain('Novo nome: feature');
    await type(stdin, '-v2');
    await press(stdin, '\r');
    await tick();
    expect(act.validate).toHaveBeenCalledWith('branch', 'feature-v2');
    expect(act.renameBranch).toHaveBeenCalledWith('feature', 'feature-v2');
    expect(onDone).toHaveBeenCalledWith('branch feature renomeada para feature-v2');
  });

  it('goes straight to the name when there is only one ref, and renames tags', async () => {
    const {stdin, act, onDone, lastFrame} = open('rename', [{name: 'v1', kind: 'tag'}]);
    expect(lastFrame()).toContain('Novo nome: v1');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('esse já é o nome atual');
    await type(stdin, '.0');
    await press(stdin, '\r');
    await tick();
    expect(act.renameTag).toHaveBeenCalledWith('v1', 'v1.0');
    expect(onDone).toHaveBeenCalledWith('tag v1 renomeada para v1.0');
  });
});

describe('RefManager delete', () => {
  it('never offers the current branch', () => {
    const {lastFrame} = open('delete', refs);
    expect(lastFrame()).toContain('feature');
    expect(lastFrame()).not.toContain('> branch main');
    expect(lastFrame()).not.toMatch(/branch main/);
  });

  it('deletes a tag after confirming; n cancels', async () => {
    const one = open('delete', [{name: 'v1', kind: 'tag'}]);
    expect(one.lastFrame()).toContain('Apagar tag v1?');
    await press(one.stdin, 'n');
    expect(one.onCancel).toHaveBeenCalled();
    expect(one.act.deleteTag).not.toHaveBeenCalled();

    const two = open('delete', [{name: 'v1', kind: 'tag'}]);
    await press(two.stdin, 'y');
    await tick();
    expect(two.act.deleteTag).toHaveBeenCalledWith('v1');
    expect(two.onDone).toHaveBeenCalledWith('tag v1 apagada');
  });

  it('deletes a merged branch with the safe delete', async () => {
    const {stdin, act, onDone} = open('delete', [{name: 'topic', kind: 'branch'}]);
    await press(stdin, '\r');
    await tick();
    expect(act.deleteBranch).toHaveBeenCalledWith('topic', false);
    expect(onDone).toHaveBeenCalledWith('branch topic apagada');
  });

  it('for an unmerged branch warns how many commits are lost and needs the name typed', async () => {
    const deleteBranch = vi.fn().mockRejectedValueOnce(new UnmergedBranchError('topic')).mockResolvedValue(undefined);
    const {stdin, act, onDone, lastFrame} = open('delete', [{name: 'topic', kind: 'branch'}], actions({deleteBranch}));
    await press(stdin, 'y');
    await tick();
    await tick();
    expect(lastFrame()).toContain('topic não foi mesclada: apagar perde 3 commits');
    expect(onDone).not.toHaveBeenCalled();

    await press(stdin, '\r');
    expect(lastFrame()).toContain('digite exatamente topic para confirmar');
    await type(stdin, 'top');
    await press(stdin, '\r');
    expect(deleteBranch).toHaveBeenCalledTimes(1);

    await type(stdin, 'ic');
    await press(stdin, '\r');
    await tick();
    expect(act.deleteBranch).toHaveBeenLastCalledWith('topic', true);
    expect(onDone).toHaveBeenCalledWith('branch topic apagada');
  });
});
