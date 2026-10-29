import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  checkout,
  checkoutTargets,
  describeOption,
  describeTarget,
  isCurrent,
  PartialCheckoutError,
  summarizeGitError,
  type CheckoutTarget,
} from '../../src/git/checkout.js';
import {loadRefs, localBranchTips} from '../../src/git/refs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  return r;
}

describe('checkoutTargets', () => {
  it('uses the local branches at the commit, sorted', () => {
    expect(
      checkoutTargets('abc', [
        {name: 'zeta', kind: 'branch'},
        {name: 'alpha', kind: 'branch'},
        {name: 'origin/alpha', kind: 'remote'},
        {name: 'v1', kind: 'tag'},
      ], new Map()),
    ).toEqual([
      {kind: 'branch', name: 'alpha'},
      {kind: 'branch', name: 'zeta'},
    ]);
  });

  it('falls back to a detached HEAD without local branches', () => {
    expect(checkoutTargets('abc', [], new Map())).toEqual([{kind: 'detach', hash: 'abc'}]);
    // Remote-only tips and tags do not count as branches.
    expect(
      checkoutTargets('abc', [
        {name: 'origin/x', kind: 'remote'},
        {name: 'v1', kind: 'tag'},
      ], new Map()),
    ).toEqual([{kind: 'detach', hash: 'abc'}]);
  });
});

describe('checkoutTargets with a remote branch out of sync with the local one', () => {
  const remote = (name: string) => ({name, kind: 'remote' as const});
  const branch = (name: string) => ({name, kind: 'branch' as const});

  it('offers pull, the plain local branch and a detached HEAD', () => {
    // origin/main is at "new"; the local main is still at "old".
    const tips = new Map([['main', 'old']]);
    expect(checkoutTargets('new', [remote('origin/main')], tips)).toEqual([
      {kind: 'pull', name: 'main', remote: 'origin'},
      {kind: 'branch', name: 'main', unsynced: true},
      {kind: 'detach', hash: 'new'},
    ]);
  });

  it('keeps the branches that really are at the commit between pull and detach', () => {
    const tips = new Map([['main', 'old'], ['other', 'new']]);
    expect(checkoutTargets('new', [branch('other'), remote('origin/main')], tips)).toEqual([
      {kind: 'pull', name: 'main', remote: 'origin'},
      {kind: 'branch', name: 'other'},
      {kind: 'branch', name: 'main', unsynced: true},
      {kind: 'detach', hash: 'new'},
    ]);
  });

  it('suggests nothing when local and remote are at the same commit', () => {
    const tips = new Map([['main', 'new']]);
    expect(checkoutTargets('new', [branch('main'), remote('origin/main')], tips)).toEqual([
      {kind: 'branch', name: 'main'},
    ]);
  });

  it('suggests nothing when there is no local branch with that name', () => {
    expect(checkoutTargets('new', [remote('origin/main')], new Map([['dev', 'x']]))).toEqual([
      {kind: 'detach', hash: 'new'},
    ]);
  });

  it('understands branch names with slashes', () => {
    const tips = new Map([['feature/ssr', 'old']]);
    expect(checkoutTargets('new', [remote('origin/feature/ssr')], tips)[0]).toEqual({
      kind: 'pull',
      name: 'feature/ssr',
      remote: 'origin',
    });
  });

  it('offers one pull per remote that is out of sync', () => {
    const tips = new Map([['main', 'old']]);
    const targets = checkoutTargets('new', [remote('upstream/main'), remote('origin/main')], tips);
    expect(targets.filter(t => t.kind === 'pull')).toEqual([
      {kind: 'pull', name: 'main', remote: 'origin'},
      {kind: 'pull', name: 'main', remote: 'upstream'},
    ]);
    // The plain local branch appears only once.
    expect(targets.filter(t => t.kind === 'branch')).toHaveLength(1);
  });
});

describe('isCurrent and describeTarget', () => {
  const onMain = {hash: 'h1', branch: 'main'};
  const detached = {hash: 'h1', branch: null};

  it('recognizes the current branch', () => {
    expect(isCurrent({kind: 'branch', name: 'main'}, onMain)).toBe(true);
    expect(isCurrent({kind: 'branch', name: 'other'}, onMain)).toBe(false);
  });

  it('recognizes a detached HEAD only when HEAD is detached on that commit', () => {
    expect(isCurrent({kind: 'detach', hash: 'h1'}, detached)).toBe(true);
    expect(isCurrent({kind: 'detach', hash: 'h2'}, detached)).toBe(false);
    // On a branch whose tip is that commit, a detach is a real change.
    expect(isCurrent({kind: 'detach', hash: 'h1'}, onMain)).toBe(false);
  });

  it('never considers a pull as already done', () => {
    expect(isCurrent({kind: 'pull', name: 'main', remote: 'origin'}, onMain)).toBe(false);
  });

  it('describes pull and unsynced options', () => {
    const pull: CheckoutTarget = {kind: 'pull', name: 'main', remote: 'origin'};
    expect(describeOption(pull)).toBe('main e pull de origin/main');
    expect(describeTarget(pull)).toBe('main (atualizada de origin/main)');
    expect(describeOption({kind: 'branch', name: 'main', unsynced: true})).toBe('main (sem pull)');
    expect(describeOption({kind: 'branch', name: 'main'})).toBe('main');
    expect(describeOption({kind: 'detach', hash: 'abcdef1234'})).toBe(
      'abcdef1 (HEAD destacado neste commit)',
    );
  });

  it('describes targets for the prompt', () => {
    expect(describeTarget({kind: 'branch', name: 'main'})).toBe('main');
    expect(describeTarget({kind: 'detach', hash: 'abcdef1234'})).toBe('abcdef1 (HEAD destacado)');
  });
});

describe('checkout', () => {
  it('switches to a branch', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'base');
    run('branch', 'feature');
    await checkout(dir, {kind: 'branch', name: 'feature'});
    expect(run('branch', '--show-current')).toBe('feature');
  });

  it('detaches HEAD at a commit', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'one');
    const first = run('rev-parse', 'HEAD');
    run('commit', '--allow-empty', '-q', '-m', 'two');
    await checkout(dir, {kind: 'detach', hash: first});
    expect(run('branch', '--show-current')).toBe('');
    expect(run('rev-parse', 'HEAD')).toBe(first);
  });

  it('refuses, without touching anything, when local changes would be overwritten', async () => {
    const {dir, run} = repo();
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'one');
    run('add', 'a.txt');
    run('commit', '-q', '-m', 'one');
    run('checkout', '-q', '-b', 'other');
    writeFileSync(file, 'two');
    run('commit', '-q', '-am', 'two');
    run('checkout', '-q', 'main');
    writeFileSync(file, 'dirty');

    await expect(checkout(dir, {kind: 'branch', name: 'other'})).rejects.toThrow(
      /local changes/,
    );
    expect(run('branch', '--show-current')).toBe('main');
    expect(readFileSync(file, 'utf8')).toBe('dirty');
  });

  it('rejects an unknown branch', async () => {
    const {dir, run} = repo();
    run('commit', '--allow-empty', '-q', '-m', 'base');
    const target: CheckoutTarget = {kind: 'branch', name: 'nope'};
    await expect(checkout(dir, target)).rejects.toThrow(/invalid reference|nope/);
    expect(run('branch', '--show-current')).toBe('main');
  });
});

describe('checkout with pull', () => {
  const identity = {
    GIT_AUTHOR_NAME: 'Ana',
    GIT_AUTHOR_EMAIL: 'ana@example.com',
    GIT_COMMITTER_NAME: 'Ana',
    GIT_COMMITTER_EMAIL: 'ana@example.com',
  };
  const sh = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {cwd, encoding: 'utf8', env: {...process.env, ...identity}}).trim();

  /** A local repo one commit behind origin/main, with a bare repo as the remote. */
  function behindRemote() {
    const local = repo();
    const remoteDir = mkdtempSync(join(tmpdir(), 'gitgraph-remote-'));
    const cloneDir = mkdtempSync(join(tmpdir(), 'gitgraph-clone-'));
    cleanups.push(() => {
      rmSync(remoteDir, {recursive: true, force: true});
      rmSync(cloneDir, {recursive: true, force: true});
    });
    sh(remoteDir, 'init', '-q', '--bare', '-b', 'main');
    local.run('commit', '--allow-empty', '-q', '-m', 'base');
    local.run('remote', 'add', 'origin', remoteDir);
    local.run('push', '-q', '-u', 'origin', 'main');
    // Another clone advances the remote; the local repo only fetches.
    sh(tmpdir(), 'clone', '-q', remoteDir, cloneDir);
    sh(cloneDir, 'config', 'commit.gpgsign', 'false');
    sh(cloneDir, 'commit', '--allow-empty', '-q', '-m', 'remote work');
    sh(cloneDir, 'push', '-q', 'origin', 'main');
    local.run('fetch', '-q', 'origin');
    return {...local, remoteTip: local.run('rev-parse', 'origin/main')};
  }

  const pull: CheckoutTarget = {kind: 'pull', name: 'main', remote: 'origin'};

  it('is suggested for the remote tip and fast-forwards the local branch', async () => {
    const {dir, run, remoteTip} = behindRemote();
    const refs = await loadRefs(dir);
    const targets = checkoutTargets(
      remoteTip,
      refs.byCommit.get(remoteTip) ?? [],
      localBranchTips(refs.byCommit),
    );
    expect(targets[0]).toEqual(pull);

    await checkout(dir, pull);
    expect(run('branch', '--show-current')).toBe('main');
    expect(run('rev-parse', 'HEAD')).toBe(remoteTip);
  });

  it('switches to the branch first when HEAD is somewhere else', async () => {
    const {dir, run, remoteTip} = behindRemote();
    run('checkout', '-q', '-b', 'other');
    await checkout(dir, pull);
    expect(run('branch', '--show-current')).toBe('main');
    expect(run('rev-parse', 'HEAD')).toBe(remoteTip);
  });

  it('keeps the plain option as it is, without pulling', async () => {
    const {dir, run, remoteTip} = behindRemote();
    run('checkout', '-q', '-b', 'other');
    await checkout(dir, {kind: 'branch', name: 'main', unsynced: true});
    expect(run('branch', '--show-current')).toBe('main');
    expect(run('rev-parse', 'HEAD')).not.toBe(remoteTip);
  });

  it('reports a partial failure when the branches diverged, without merging', async () => {
    const {dir, run, remoteTip} = behindRemote();
    run('checkout', '-q', '-b', 'other');
    run('checkout', '-q', 'main');
    run('commit', '--allow-empty', '-q', '-m', 'local work');
    const localTip = run('rev-parse', 'HEAD');
    run('checkout', '-q', 'other');

    const failure = checkout(dir, pull);
    await expect(failure).rejects.toBeInstanceOf(PartialCheckoutError);
    await expect(failure).rejects.toThrow(/checkout feito para main, mas o pull falhou.*fast-forward/s);
    // The switch happened; nothing was merged or rebased.
    expect(run('branch', '--show-current')).toBe('main');
    expect(run('rev-parse', 'HEAD')).toBe(localTip);
    expect(run('rev-parse', 'HEAD')).not.toBe(remoteTip);
  });

  it('fails as a plain error when the switch itself is refused', async () => {
    const {dir} = behindRemote();
    const failure = checkout(dir, {kind: 'pull', name: 'nope', remote: 'origin'});
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(PartialCheckoutError);
  });
});

describe('summarizeGitError', () => {
  it('keeps only the reason of a failed ff-only pull', () => {
    // Real stderr of `git pull --ff-only` on diverged branches.
    const stderr = [
      'From ../remote',
      ' * branch            main       -> FETCH_HEAD',
      "hint: Diverging branches can't be fast-forwarded, you need to either:",
      'hint:',
      'hint: \tgit merge --no-ff',
      'hint:',
      'hint: or:',
      'hint:',
      'hint: \tgit rebase',
      'hint:',
      'hint: Disable this message with "git config set advice.diverging false"',
      'fatal: Not possible to fast-forward, aborting.',
    ].join('\n');
    expect(summarizeGitError(stderr)).toBe('Not possible to fast-forward, aborting.');
  });

  it('drops the ref update lines of a fetch', () => {
    const stderr = [
      'From github.com:me/repo',
      '   f1f4db0..be632a2  main       -> origin/main',
      ' + abc1234...def5678 topic      -> origin/topic  (forced update)',
      ' * [new branch]      other      -> origin/other',
      'error: Your local changes to the following files would be overwritten by merge:',
      '\ta.txt',
      'Please commit your changes or stash them before you merge.',
      'Aborting',
    ].join('\n');
    expect(summarizeGitError(stderr)).toBe(
      'Your local changes to the following files would be overwritten by merge: a.txt Please commit your changes or stash them before you merge. Aborting',
    );
  });

  it('falls back to the whole message when everything looks like noise', () => {
    expect(summarizeGitError('hint: only a hint')).toBe('hint: only a hint');
  });
});
