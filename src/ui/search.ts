/** In-memory search over the loaded commits (pure). */
import type {Commit} from '../graph/types.js';

/** Case-insensitive substring match on hash, subject, body, author name and email. */
export function matchesCommit(commit: Commit, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return false;
  return [commit.hash, commit.subject, commit.body, commit.author, commit.email].some(field =>
    field.toLowerCase().includes(needle),
  );
}

/** Indexes of the rows that match, in list order. */
export function findMatches(rows: {commit: Commit}[], query: string): number[] {
  const found: number[] = [];
  rows.forEach((row, i) => {
    if (matchesCommit(row.commit, query)) found.push(i);
  });
  return found;
}

/** First match at or after `from`, wrapping to the first one; null without matches. */
export function firstFrom(matches: number[], from: number): number | null {
  return matches.find(i => i >= from) ?? matches[0] ?? null;
}

/** The match after (`step` 1) or before (`step` -1) `from`, wrapping around; null without matches. */
export function nextMatch(matches: number[], from: number, step: 1 | -1): number | null {
  if (matches.length === 0) return null;
  if (step === 1) return matches.find(i => i > from) ?? matches[0] ?? null;
  return [...matches].reverse().find(i => i < from) ?? matches[matches.length - 1] ?? null;
}
