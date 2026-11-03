import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {watchRepository} from '../../src/git/watch.js';
import {createRepo} from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

/** Resolves with the number of events seen until `ms` after the first one. */
function events(source: {subscribe(l: () => void): () => void}, ms: number) {
  let count = 0;
  let first: (() => void) | undefined;
  const done = new Promise<number>(resolve => {
    first = () => setTimeout(() => resolve(count), ms);
  });
  source.subscribe(() => {
    if (count++ === 0) first?.();
  });
  return Promise.race([done, new Promise<number>(resolve => setTimeout(() => resolve(count), 8000))]);
}

describe('watchRepository', () => {
  it('reports a commit and a new branch, debounced into one event each burst', async () => {
    const r = createRepo();
    cleanups.push(r.cleanup);
    r.run('commit', '--allow-empty', '-q', '-m', 'one');
    const watch = await watchRepository(r.dir, 100);
    cleanups.push(watch.close);

    const seen = events(watch.source, 600);
    r.run('commit', '--allow-empty', '-q', '-m', 'two');
    // A commit touches HEAD's ref, the index lock and logs: still a single debounced event.
    expect(await seen).toBe(1);

    const branch = events(watch.source, 600);
    r.run('branch', 'feature');
    expect(await branch).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['cherry-pick', ['cherry-pick', 'side']],
    ['revert', ['revert', '--no-edit', 'HEAD~1']],
  ])('notices when a stopped %s is dropped with --quit', async (name, args) => {
    const r = createRepo();
    cleanups.push(r.cleanup);
    const write = (text: string) => writeFileSync(join(r.dir, 'a.txt'), `${text}\n`);
    write('1');
    r.run('add', 'a.txt');
    r.run('commit', '-q', '-m', 'base');
    r.run('checkout', '-q', '-b', 'side');
    write('2');
    r.run('commit', '-q', '-am', 'side');
    r.run('checkout', '-q', 'main');
    write('3');
    r.run('commit', '-q', '-am', 'main');
    // Both conflict and stop, leaving CHERRY_PICK_HEAD / REVERT_HEAD behind.
    expect(() => r.run(...(args as [string, ...string[]]))).toThrow();
    const watch = await watchRepository(r.dir, 100);
    cleanups.push(watch.close);

    const seen = events(watch.source, 300);
    r.run(name, '--quit');
    expect(await seen).toBeGreaterThanOrEqual(1);
  });

  it('stops after close()', async () => {
    const r = createRepo();
    cleanups.push(r.cleanup);
    r.run('commit', '--allow-empty', '-q', '-m', 'one');
    const watch = await watchRepository(r.dir, 50);
    let count = 0;
    watch.source.subscribe(() => count++);
    watch.close();
    r.run('commit', '--allow-empty', '-q', '-m', 'two');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(count).toBe(0);
  });

  it('fails clearly outside a repository', async () => {
    const r = createRepo();
    r.cleanup();
    await expect(watchRepository(r.dir)).rejects.toThrow();
  });
});
