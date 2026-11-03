import {spawn} from 'node:child_process';

export type CopyMethod = 'native' | 'osc52';

export interface Command {
  cmd: string;
  args: string[];
}

/** OSC 52: asks the terminal to put the text on the clipboard (works through ssh; no reply, so it cannot be confirmed). */
export const osc52 = (text: string) => `\u001B]52;c;${Buffer.from(text).toString('base64')}\u0007`;

/** Clipboard programs worth trying on this system, best first. */
export function clipboardCommands(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Command[] {
  if (platform === 'darwin') return [{cmd: 'pbcopy', args: []}];
  if (platform === 'win32') return [{cmd: 'clip', args: []}];
  return [
    ...(env['WAYLAND_DISPLAY'] ? [{cmd: 'wl-copy', args: []}] : []),
    ...(env['DISPLAY']
      ? [
          {cmd: 'xclip', args: ['-selection', 'clipboard']},
          {cmd: 'xsel', args: ['--clipboard', '--input']},
        ]
      : []),
  ];
}

const pipeTo = ({cmd, args}: Command, text: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {stdio: ['pipe', 'ignore', 'ignore']});
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
    child.stdin.on('error', reject);
    child.stdin.end(text);
  });

export interface CopyDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Writes to the terminal; defaults to stdout. */
  write?: (data: string) => void;
  run?: (command: Command, text: string) => Promise<void>;
}

/**
 * Copies the text. Over ssh the local clipboard is on the other machine, so
 * only OSC 52 can reach it. Otherwise a native program is tried first because
 * its exit code says whether it worked; OSC 52 is the fallback and the result
 * says which one was used, since only `native` is known to have worked.
 */
export async function copyText(text: string, deps: CopyDeps = {}): Promise<CopyMethod> {
  const {platform = process.platform, env = process.env, write = d => process.stdout.write(d), run = pipeTo} = deps;
  if (!env['SSH_CONNECTION'] && !env['SSH_TTY']) {
    for (const command of clipboardCommands(platform, env)) {
      try {
        await run(command, text);
        return 'native';
      } catch {
        // missing program or failure: try the next one
      }
    }
  }
  write(osc52(text));
  return 'osc52';
}
