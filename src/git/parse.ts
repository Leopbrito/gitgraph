import type {Commit} from '../graph/types.js';

/** Fields per commit in LOG_FORMAT (see log.ts); `git log -z` ends each commit with a NUL too. */
export const LOG_FIELDS = 7;

/**
 * Parses `git log -z --format=<LOG_FORMAT>`: every field is NUL-terminated or
 * NUL-separated, and a commit message cannot contain NUL, so no message text
 * (control characters included) can be mistaken for a separator.
 */
export function parseLog(text: string): Commit[] {
  const tokens = text.split('\0');
  // The output ends with the NUL that terminates the last commit.
  if (tokens.at(-1) === '') tokens.pop();
  if (tokens.length % LOG_FIELDS !== 0) {
    throw new Error(`Invalid commit record: ${JSON.stringify(tokens.at(-1) ?? '')}`);
  }
  const commits: Commit[] = [];
  for (let i = 0; i < tokens.length; i += LOG_FIELDS) {
    const [hash, parents, author, email, date, subject, body] = tokens.slice(i, i + LOG_FIELDS) as [
      string, string, string, string, string, string, string,
    ];
    if (!hash || date === '') {
      throw new Error(`Invalid commit record: ${JSON.stringify(tokens.slice(i, i + LOG_FIELDS).join('\0'))}`);
    }
    commits.push({
      hash,
      parents: parents ? parents.split(' ') : [],
      author,
      email,
      date,
      subject,
      body: body.trim(),
    });
  }
  return commits;
}
