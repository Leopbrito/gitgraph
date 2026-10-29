import {execFile} from 'node:child_process';

/** Time limit for commands that talk to a remote. */
const NETWORK_TIMEOUT_MS = 120_000;

export interface GitOptions {
  /**
   * The command talks to a remote. It must not hang the TUI waiting for a
   * password: git gets no terminal prompts, the process has no controlling
   * terminal (so ssh cannot ask for a passphrase either) and there is a time
   * limit. Credentials must be available non-interactively (agent, helper).
   */
  network?: boolean;
}

export function git(args: string[], cwd: string, {network = false}: GitOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 256 * 1024 * 1024,
        // Mensagens de erro em inglês, para o código poder reconhecê-las em
        // qualquer idioma do sistema.
        env: {...process.env, LC_ALL: 'C', ...(network ? {GIT_TERMINAL_PROMPT: '0'} : {})},
        ...(network ? {detached: true, timeout: NETWORK_TIMEOUT_MS} : {}),
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(describeError(error, stderr, cwd));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function describeError(
  error: {code?: string | number; message: string; killed?: boolean},
  stderr: string,
  cwd: string,
): Error {
  if (error.code === 'ENOENT') return new Error('git não encontrado no PATH');
  if (error.killed) return new Error('tempo esgotado ao falar com a remota');
  if (/not a git repository/i.test(stderr)) {
    return new Error(`${cwd} não é um repositório git`);
  }
  return new Error(stderr.trim() || error.message);
}
