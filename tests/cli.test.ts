import {execFile} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';
import {createRepo} from './git/helpers.js';

const exec = promisify(execFile);
const tsx = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx');
const entry = join(import.meta.dirname, '..', 'src', 'cli.tsx');

/** Runs the CLI with stdout piped, so it prints plain text. */
const gitgraph = (cwd: string, ...args: string[]) => gitgraphEnv(cwd, {}, ...args);

const gitgraphEnv = (cwd: string, env: Record<string, string>, ...args: string[]) =>
  exec(tsx, [entry, ...args], {cwd, env: {...process.env, NO_COLOR: '1', ...env}}).then(
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

describe('cli (pipe mode, long output)', () => {
  it('writes the whole history, aligned, and ends quietly when the reader stops early', async () => {
    const {dir, run} = repo();
    for (let i = 0; i < 120; i++) run('commit', '--allow-empty', '-q', '-m', `more ${i}`);
    const all = (await gitgraph(dir)).stdout.trimEnd().split('\n');
    // 120 + base + 2 branch commits, plus connector lines in the spaced layout.
    expect(all.filter(line => line.includes('Ana,'))).toHaveLength(123);

    // `| head -1` closes the pipe long before the end: no error, exit status of head.
    const head = await exec('sh', ['-c', `${tsx} ${entry} | head -1; echo "status=\${PIPESTATUS:-ok}"`], {
      cwd: dir,
      env: {...process.env, NO_COLOR: '1'},
    }).catch((error: {stdout: string; stderr: string}) => error);
    expect(head.stderr).toBe('');
    expect(head.stdout.split('\n')[0]).toBe(all[0]);
  });
});

describe('cli (config file)', () => {
  function configDir(content: string) {
    const root = mkdtempSync(join(tmpdir(), 'gitgraph-config-'));
    cleanups.push(() => rmSync(root, {recursive: true, force: true}));
    mkdirSync(join(root, 'gitgraph'));
    writeFileSync(join(root, 'gitgraph', 'config.json'), content);
    return root;
  }

  it('applies the defaults from the file, and a flag overrides them', async () => {
    const {dir} = repo();
    const xdg = configDir('{"date": "iso", "maxCount": 1}');
    const fromFile = await gitgraphEnv(dir, {XDG_CONFIG_HOME: xdg}, 'main');
    // One commit (maxCount) with the iso date (has the time).
    expect(fromFile.stdout.split('\n').filter(line => line.includes('Ana,'))).toHaveLength(1);
    expect(fromFile.stdout).toMatch(/Ana, \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

    const flags = await gitgraphEnv(dir, {XDG_CONFIG_HOME: xdg}, 'main', '--date=short', '-n', '2');
    expect(flags.stdout).toMatch(/Ana, \d{4}-\d{2}-\d{2}\s/);
    expect(flags.stdout).not.toMatch(/\d{2}:\d{2}/);
    expect(flags.stdout).toContain('only on main');
    expect(flags.stdout).toContain('base');
  });

  it('fails with the file name and key on an invalid config, but still answers --help', async () => {
    const {dir} = repo();
    const xdg = configDir('{"order": "newest"}');
    const bad = await gitgraphEnv(dir, {XDG_CONFIG_HOME: xdg});
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('config.json');
    expect(bad.stderr).toContain('"order" deve ser date, author-date, topo');

    const help = await gitgraphEnv(dir, {XDG_CONFIG_HOME: xdg}, '--help');
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Uso: gitgraph');
  });
});
