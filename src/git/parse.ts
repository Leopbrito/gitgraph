import type {Commit} from '../graph/types.js';

/** Separadores usados em LOG_FORMAT (ver log.ts). */
export const FIELD_SEP = '\0';
export const RECORD_SEP = '\x1e';

export function parseLog(text: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of text.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '');
    if (trimmed === '') continue;
    const [hash, parents, author, email, date, subject, body] =
      trimmed.split(FIELD_SEP);
    if (!hash || date === undefined) {
      throw new Error(`Registro de commit inválido: ${JSON.stringify(trimmed)}`);
    }
    commits.push({
      hash,
      parents: parents ? parents.split(' ') : [],
      author: author ?? '',
      email: email ?? '',
      date,
      subject: subject ?? '',
      body: (body ?? '').trim(),
    });
  }
  return commits;
}
