import {execFile, spawn} from 'node:child_process';

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
  /** Extra environment variables for this command (e.g. `GIT_EDITOR` so no editor opens inside the TUI). */
  env?: Record<string, string>;
}

export function git(args: string[], cwd: string, {network = false, env}: GitOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 256 * 1024 * 1024,
        // English error messages, so the code can recognize them in
        // any system language.
        env: {...process.env, LC_ALL: 'C', ...(network ? {GIT_TERMINAL_PROMPT: '0'} : {}), ...env},
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

/**
 * Runs git and yields its stdout as it arrives (decoded as UTF-8), so a huge
 * output never has to fit in memory. The consumer pulling slowly slows git
 * down too (backpressure). Stopping early kills the process; a failure is
 * thrown once the output ends, with the same messages as `git()`.
 */
export async function* gitStream(args: string[], cwd: string): AsyncGenerator<string, void, undefined> {
  const child = spawn('git', args, {cwd, env: {...process.env, LC_ALL: 'C'}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data: string) => {
    if (stderr.length < 64 * 1024) stderr += data;
  });
  let failure: Error | undefined;
  const closed = new Promise<number | null>(resolve => {
    child.on('error', error => {
      failure = error;
      resolve(null);
    });
    child.on('close', code => resolve(code));
  });
  child.stdout.setEncoding('utf8');
  let finished = false;
  try {
    for await (const chunk of child.stdout) yield chunk as string;
    finished = true;
  } finally {
    if (!finished) child.kill();
  }
  const code = await closed;
  if (failure) throw describeError(failure as NodeJS.ErrnoException, stderr, cwd);
  if (code !== 0) throw describeError({message: `Command failed: git ${args.join(' ')}`}, stderr, cwd);
}

function describeError(
  error: {code?: string | number; message: string; killed?: boolean},
  stderr: string,
  cwd: string,
): Error {
  if (error.code === 'ENOENT') return new Error('git not found in PATH');
  if (error.killed) return new Error('timed out talking to the remote');
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new Error('git output is too large; limit the history with -n or a path');
  }
  if (/not a git repository/i.test(stderr)) {
    return new Error(`${cwd} is not a git repository`);
  }
  return new Error(stderr.trim() || error.message);
}
