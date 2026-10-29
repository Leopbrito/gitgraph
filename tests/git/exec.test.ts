import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {git} from '../../src/git/exec.js';
import {loadCommits} from '../../src/git/log.js';

afterEach(() => vi.unstubAllEnvs());

describe('erros do git', () => {
  it('explica quando o diretório não é um repositório', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitgraph-norepo-'));
    try {
      await expect(loadCommits(dir)).rejects.toThrow(`${dir} não é um repositório git`);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('explica quando o git não está no PATH', async () => {
    vi.stubEnv('PATH', '');
    await expect(git(['--version'], process.cwd())).rejects.toThrow('git não encontrado no PATH');
  });
});
