import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {COMMIT_ORDERS, type CommitOrder} from './git/log.js';
import {DATE_STYLES, type DateStyle} from './ui/date.js';

/** Defaults read from the config file; every key is optional and a command line flag wins over it. */
export interface FileConfig {
  maxCount?: number;
  order?: CommitOrder;
  date?: DateStyle;
  compact?: boolean;
  ascii?: boolean;
  color?: boolean;
  stash?: boolean;
  uncommitted?: boolean;
  mouse?: boolean;
  watch?: boolean;
  colors?: {
    /** Colors of the graph lanes, cycled in order. */
    lanes?: string[];
  };
}

export class ConfigError extends Error {}

/** `$XDG_CONFIG_HOME/gitgraph/config.json`, or `~/.config/gitgraph/config.json` (the spec ignores a relative XDG_CONFIG_HOME). */
export function configPath(env: NodeJS.ProcessEnv, home = homedir()): string {
  const xdg = env['XDG_CONFIG_HOME'];
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.config');
  return join(base, 'gitgraph', 'config.json');
}

const NAMED_COLORS = new Set([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey',
  'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
]);

/** A color name Ink accepts (`red`, `cyanBright`) or a `#rrggbb` hex. */
export const isColor = (value: unknown): value is string =>
  typeof value === 'string' && (NAMED_COLORS.has(value) || /^#[0-9a-f]{6}$/i.test(value));

const oneOf = <T extends string>(values: readonly T[]) => ({
  check: (v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v),
  expected: values.join(', '),
});
const BOOLEAN = {check: (v: unknown): v is boolean => typeof v === 'boolean', expected: 'true or false'};

// Key -> how to validate it. Anything else in the file is an error: a typo would otherwise be ignored silently.
const SCHEMA = {
  maxCount: {check: (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0, expected: 'a positive integer'},
  order: oneOf(COMMIT_ORDERS),
  date: oneOf(DATE_STYLES),
  compact: BOOLEAN,
  ascii: BOOLEAN,
  color: BOOLEAN,
  stash: BOOLEAN,
  uncommitted: BOOLEAN,
  mouse: BOOLEAN,
  watch: BOOLEAN,
} as const;

/** Validates the file text. Errors name the file and the key. */
export function parseConfig(text: string, source: string): FileConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`${source}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${source}: the file must contain a JSON object`);
  }
  const config: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'colors') {
      config['colors'] = parseColors(value, source);
    } else if (key in SCHEMA) {
      const rule = SCHEMA[key as keyof typeof SCHEMA];
      if (!rule.check(value)) {
        throw new ConfigError(`${source}: "${key}" must be ${rule.expected} (got: ${JSON.stringify(value)})`);
      }
      config[key] = value;
    } else {
      throw new ConfigError(`${source}: unknown key "${key}" (valid: ${[...Object.keys(SCHEMA), 'colors'].join(', ')})`);
    }
  }
  return config as FileConfig;
}

function parseColors(value: unknown, source: string): NonNullable<FileConfig['colors']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${source}: "colors" must be an object (for example {"lanes": ["cyan", "#ff8800"]})`);
  }
  const colors: NonNullable<FileConfig['colors']> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== 'lanes') throw new ConfigError(`${source}: unknown key "colors.${key}" (valid: lanes)`);
    if (!Array.isArray(entry) || entry.length === 0 || !entry.every(isColor)) {
      throw new ConfigError(
        `${source}: "colors.lanes" must be a non-empty list of colors (names like red and cyanBright, or #rrggbb); got: ${JSON.stringify(entry)}`,
      );
    }
    colors.lanes = entry;
  }
  return colors;
}

/** Reads the config file; a missing file means no config. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  read: (path: string) => string = path => readFileSync(path, 'utf8'),
): FileConfig {
  const path = configPath(env);
  let text: string;
  try {
    text = read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError(`${path}: could not read (${error instanceof Error ? error.message : String(error)})`);
  }
  return parseConfig(text, path);
}
