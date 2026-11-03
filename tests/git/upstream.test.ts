import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {fetchAll} from '../../src/git/fetch.js';
import {loadRefs, parseAheadBehind} from '../../src/git/refs.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Ana',
  GIT_AUTHOR_EMAIL: 'ana@example.com',
  GIT_COMMITTER_NAME: 'Ana',
  GIT_COMMITTER_EMAIL: 'ana@example.com',
};
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, {cwd, encoding: 'utf8', env}).trim();

/** A bare "remote", the repo under test pushed to it, and a second clone to push from "elsewhere". */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gitgraph-remote-'));
  cleanups.push(() => rmSync(root, {recursive: true, force: true}));
  const bare = join(root, 'origin.git');
  sh(root, 'init', '-q', '--bare', '-b', 'main', bare);
  const local = createRepo();
  cleanups.push(local.cleanup);
  local.run('commit', '--allow-empty', '-q', '-m', 'one');
  local.run('remote', 'add', 'origin', bare);
  local.run('push', '-q', '-u', 'origin', 'main');
  const other = join(root, 'other');
  sh(root, 'clone', '-q', bare, other);
  sh(other, 'config', 'commit.gpgsign', 'false');
  return {bare, local, other};
}

describe('parseAheadBehind', () => {
  it('reads the two counts', () => {
    expect(parseAheadBehind('2\t3\n')).toEqual({ahead: 2, behind: 3});
    expect(parseAheadBehind('0\t0')).toEqual({ahead: 0, behind: 0});
  });
  it('rejects anything else', () => {
    expect(parseAheadBehind('')).toBeNull();
    expect(parseAheadBehind('fatal: no upstream')).toBeNull();
  });
});

describe('upstream in loadRefs', () => {
  it('has none for a branch that tracks nothing, or when detached', async () => {
    const {dir, run, cleanup} = createRepo();
    cleanups.push(cleanup);
    run('commit', '--allow-empty', '-q', '-m', 'one');
    expect((await loadRefs(dir)).head.upstream).toBeUndefined();
    run('checkout', '-q', '--detach');
    expect((await loadRefs(dir)).head.upstream).toBeUndefined();
  });

  it('counts commits ahead and behind', async () => {
    const {local, other} = setup();
    expect((await loadRefs(local.dir)).head.upstream).toEqual({name: 'origin/main', ahead: 0, behind: 0});

    local.run('commit', '--allow-empty', '-q', '-m', 'local only');
    local.run('commit', '--allow-empty', '-q', '-m', 'local only 2');
    sh(other, 'commit', '--allow-empty', '-q', '-m', 'remote only');
    sh(other, 'push', '-q');
    // The remote commit is unknown until a fetch.
    expect((await loadRefs(local.dir)).head.upstream).toEqual({name: 'origin/main', ahead: 2, behind: 0});
    await fetchAll(local.dir);
    expect((await loadRefs(local.dir)).head.upstream).toEqual({name: 'origin/main', ahead: 2, behind: 1});
  });

  it('has none when the upstream branch was deleted on the remote', async () => {
    const {local, other} = setup();
    sh(other, 'push', '-q', 'origin', 'HEAD:refs/heads/gone');
    local.run('checkout', '-q', '-b', 'topic');
    local.run('push', '-q', '-u', 'origin', 'topic');
    sh(other, 'push', '-q', 'origin', '--delete', 'topic');
    await fetchAll(local.dir);
    expect((await loadRefs(local.dir)).head.upstream).toBeUndefined();
  });
});

describe('fetchAll', () => {
  it('brings new remote branches and prunes deleted ones', async () => {
    const {local, other} = setup();
    sh(other, 'push', '-q', 'origin', 'HEAD:refs/heads/feature');
    await fetchAll(local.dir);
    expect(local.run('branch', '-r')).toContain('origin/feature');
    sh(other, 'push', '-q', 'origin', '--delete', 'feature');
    await fetchAll(local.dir);
    expect(local.run('branch', '-r')).not.toContain('origin/feature');
  });

  it('succeeds with no remotes', async () => {
    const {dir, run, cleanup} = createRepo();
    cleanups.push(cleanup);
    run('commit', '--allow-empty', '-q', '-m', 'one');
    await expect(fetchAll(dir)).resolves.toBeUndefined();
  });

  it('rejects with a one-line reason when the remote cannot be reached', async () => {
    const {local} = setup();
    local.run('remote', 'set-url', 'origin', join(local.dir, 'does-not-exist'));
    const error = await fetchAll(local.dir).catch(e => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/does-not-exist|repository/);
    expect((error as Error).message).not.toContain('\n');
  });
});
