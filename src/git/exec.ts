import {execFile} from 'node:child_process';

export function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 256 * 1024 * 1024,
        // Mensagens de erro em inglês, para o código poder reconhecê-las em
        // qualquer idioma do sistema.
        env: {...process.env, LC_ALL: 'C'},
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
  error: {code?: string | number; message: string},
  stderr: string,
  cwd: string,
): Error {
  if (error.code === 'ENOENT') return new Error('git não encontrado no PATH');
  if (/not a git repository/i.test(stderr)) {
    return new Error(`${cwd} não é um repositório git`);
  }
  return new Error(stderr.trim() || error.message);
}
