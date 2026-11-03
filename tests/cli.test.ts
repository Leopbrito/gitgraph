import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';
import {createRepo} from './git/helpers.js';

const exec = promisify(execFile);
const tsx = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx');
const entry = join(import.meta.dirname, '..', 'src', 'cli.tsx');

/** Runs the CLI with stdout piped, so it prints plain text. */
const gitgraph = (cwd: string, ...args: string[]) =>
  exec(tsx, [entry, ...args], {cwd, env: {...process.env, NO_COLOR: '1'}}).then(
    ({stdout}) => ({stdout, code: 0, stderr: ''}),
    (error: {stdout: string; stderr: string; code: number}) => ({stdout: error.stdout, stderr: error.stderr, code: error.code}),
  );

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));

function repo() {
  const r = createRepo();
  cleanups.push(r.cleanup);
  r.run('commit', '--allow-empty', '-q', '-m', 'base');
  r.run('checkout', '-q', '-b', 'feature');
  r.run('commit', '--allow-empty', '-q', '-m', 'only on feature');
  r.run('checkout', '-q', 'main');
  r.run('commit', '--allow-empty', '-q', '-m', 'only on main');
  return r;
}

describe('cli (pipe mode)', () => {
  it('shows every branch by default and only the given revisions otherwise', async () => {
    const {dir} = repo();
    const all = (await gitgraph(dir)).stdout;
    expect(all).toContain('only on feature');
    expect(all).toContain('only on main');

    const main = (await gitgraph(dir, 'main')).stdout;
    expect(main).toContain('only on main');
    expect(main).not.toContain('only on feature');

    const range = (await gitgraph(dir, 'main..feature')).stdout;
    expect(range).toContain('only on feature');
    expect(range).not.toContain('only on main');
    expect(range).not.toContain('base');
  });

  it('opens another repository with -C', async () => {
    const {dir} = repo();
    const result = await gitgraph(join(dir, '..'), '-C', dir, 'feature');
    expect(result.stdout).toContain('only on feature');
  });

  it('fails clearly on an unknown revision or directory', async () => {
    const {dir} = repo();
    const unknown = await gitgraph(dir, 'nope');
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('revisão desconhecida: nope');

    const missing = await gitgraph(dir, '-C', join(dir, 'missing'));
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('não é um diretório');
  });
});
