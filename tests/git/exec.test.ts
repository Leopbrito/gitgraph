import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {git, gitStream} from '../../src/git/exec.js';
import {loadCommits} from '../../src/git/log.js';

afterEach(() => vi.unstubAllEnvs());

describe('git errors', () => {
  it('explains when the directory is not a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitgraph-norepo-'));
    try {
      await expect(loadCommits(dir)).rejects.toThrow(`${dir} is not a git repository`);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('explains when git is not in the PATH', async () => {
    vi.stubEnv('PATH', '');
    await expect(git(['--version'], process.cwd())).rejects.toThrow('git not found in PATH');
  });
});

describe('gitStream', () => {
  const collect = async (args: string[], cwd: string) => {
    let out = '';
    for await (const chunk of gitStream(args, cwd)) out += chunk;
    return out;
  };

  it('yields the output and reports failures with the same messages as git()', async () => {
    expect(await collect(['--version'], process.cwd())).toMatch(/^git version/);
    const dir = mkdtempSync(join(tmpdir(), 'gitgraph-norepo-'));
    try {
      await expect(collect(['log'], dir)).rejects.toThrow(`${dir} is not a git repository`);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('explains a git missing from the PATH', async () => {
    vi.stubEnv('PATH', '');
    await expect(collect(['--version'], process.cwd())).rejects.toThrow('git not found in PATH');
  });

  it('stops git and does not fail when the consumer quits early', async () => {
    const stream = gitStream(['log', '--format=%H', '-n', '50'], process.cwd());
    const first = await stream.next();
    expect(first.done).toBe(false);
    await expect(stream.return()).resolves.toEqual({done: true, value: undefined});
  });
});
