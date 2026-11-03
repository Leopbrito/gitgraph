import type {Commit} from '../graph/types.js';
import {git} from './exec.js';

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T';

export interface ChangedFile {
  path: string;
  /** Previous path of a renamed or copied file. */
  oldPath?: string;
  status: ChangeStatus;
  /** Added and deleted lines; null for binary files. */
  added: number | null;
  deleted: number | null;
}

export interface Diff {
  lines: string[];
  /** The diff had more than `DIFF_MAX_LINES` lines and was cut. */
  truncated: boolean;
}

/** A huge commit must not freeze the TUI: the diff is cut at this many lines. */
export const DIFF_MAX_LINES = 5000;

/** Whole files are shown side by side, so the cap is higher than for hunks. */
export const FULL_DIFF_MAX_LINES = 20000;

/** What the changes view needs from git, injected like `LoadGraph` and `MergeActions`. */
export interface ChangesActions {
  files(commit: Commit): Promise<ChangedFile[]>;
  /** The diff of one file or, without `file`, of the whole commit. */
  diff(commit: Commit, file?: ChangedFile): Promise<Diff>;
  /** The diff of one file with the whole file as context (one huge hunk). */
  fullDiff(commit: Commit, file: ChangedFile): Promise<Diff>;
}

const STATUSES = 'AMDRCT';
const NUMSTAT = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/;

/**
 * Parses `git diff-tree --raw --numstat -z`: the raw entries (status and
 * paths) come first, then one numstat entry per file. A rename has two paths
 * in each, and an empty path in numstat means "the next two tokens are the
 * old and the new path".
 */
export function parseChanges(out: string): ChangedFile[] {
  const tokens = out.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const files: ChangedFile[] = [];
  const stats = new Map<string, [number | null, number | null]>();
  const count = (value: string | undefined) => (value === '-' || value === undefined ? null : Number(value));

  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i++] ?? '';
    if (token.startsWith(':')) {
      const code = token.split(' ').at(-1)?.[0] ?? 'M';
      const status = (STATUSES.includes(code) ? code : 'M') as ChangeStatus;
      if (status === 'R' || status === 'C') {
        const oldPath = tokens[i++] ?? '';
        files.push({path: tokens[i++] ?? '', oldPath, status, added: 0, deleted: 0});
      } else {
        files.push({path: tokens[i++] ?? '', status, added: 0, deleted: 0});
      }
      continue;
    }
    const match = NUMSTAT.exec(token);
    if (!match) continue;
    let path = match[3] ?? '';
    if (path === '') {
      i++; // the old path
      path = tokens[i++] ?? '';
    }
    stats.set(path, [count(match[1]), count(match[2])]);
  }

  return files.map(file => {
    const [added, deleted] = stats.get(file.path) ?? [0, 0];
    return {...file, added, deleted};
  });
}

/** Splits a diff into lines, cutting it at `max`. */
export function splitDiff(text: string, max = DIFF_MAX_LINES): Diff {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? {lines: lines.slice(0, max), truncated: true} : {lines, truncated: false};
}

/**
 * The trees to compare: the first parent and the commit (so a merge shows what
 * it brought into the branch, and a stash what it saved) or, for a root
 * commit, the commit alone.
 */
const range = (commit: Commit) =>
  commit.parents.length > 0 ? [`${commit.hash}^1`, commit.hash] : ['--root', commit.hash];

export async function loadChanges(cwd: string, commit: Commit): Promise<ChangedFile[]> {
  const out = await git(
    ['diff-tree', '-r', '-M', '--raw', '--numstat', '-z', '--no-commit-id', ...range(commit)],
    cwd,
  );
  return parseChanges(out);
}

export async function loadDiff(cwd: string, commit: Commit, file?: ChangedFile): Promise<Diff> {
  // Both paths of a rename, or git would show it as a deletion plus an addition.
  const paths = file ? ['--', ...(file.oldPath ? [file.oldPath] : []), file.path] : [];
  const out = await git(
    ['diff-tree', '-p', '-M', '--no-ext-diff', '--no-color', '--no-commit-id', ...range(commit), ...paths],
    cwd,
  );
  return splitDiff(out);
}

export async function loadFullDiff(cwd: string, commit: Commit, file: ChangedFile): Promise<Diff> {
  const paths = ['--', ...(file.oldPath ? [file.oldPath] : []), file.path];
  const out = await git(
    [
      'diff-tree', '-p', '-M', '--no-ext-diff', '--no-color', '--no-commit-id',
      '--unified=1000000', ...range(commit), ...paths,
    ],
    cwd,
  );
  return splitDiff(out, FULL_DIFF_MAX_LINES);
}

/** Most recent results kept: going back and forth between commits is the common case. */
const CACHE_SIZE = 50;

/**
 * A promise cache that drops the least recently used entry beyond `size`: a hit moves the entry to the
 * end of the Map (which keeps insertion order), so the first key is always the one used longest ago.
 * A failure is not kept, since it may be gone on the next try.
 */
export function lruCache(size: number) {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit as Promise<T>;
    }
    const promise = run();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
    if (cache.size > size) cache.delete(cache.keys().next().value as string);
    return promise;
  };
}

/** The real git behind `ChangesActions`, with a small cache (commits are immutable). */
export function gitChanges(cwd: string): ChangesActions {
  const cached = lruCache(CACHE_SIZE);
  return {
    files: commit => cached(`files:${commit.hash}`, () => loadChanges(cwd, commit)),
    diff: (commit, file) =>
      cached(`diff:${commit.hash}:${file?.path ?? ''}`, () => loadDiff(cwd, commit, file)),
    fullDiff: (commit, file) => cached(`full:${commit.hash}:${file.path}`, () => loadFullDiff(cwd, commit, file)),
  };
}
