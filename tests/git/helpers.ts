import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/** Cria um repositório git temporário e devolve o caminho e uma função de limpeza. */
export function createRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gitgraph-test-'));
  const run = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Ana',
        GIT_AUTHOR_EMAIL: 'ana@example.com',
        GIT_COMMITTER_NAME: 'Ana',
        GIT_COMMITTER_EMAIL: 'ana@example.com',
      },
    }).trim();
  run('init', '-q', '-b', 'main');
  run('config', 'commit.gpgsign', 'false');
  run('config', 'tag.gpgsign', 'false');
  return {dir, run, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}
