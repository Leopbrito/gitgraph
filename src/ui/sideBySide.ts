export interface Side {
  /** Line number in that version of the file. */
  no: number;
  text: string;
}

export type SideRowKind = 'context' | 'change' | 'del' | 'add' | 'gap';

/** One screen row of the side-by-side view: the old line and the new one, aligned. */
export interface SideRow {
  left: Side | null;
  right: Side | null;
  kind: SideRowKind;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Aligns a unified diff of one file into side-by-side rows. With the whole
 * file as context (`--unified=<huge>`) the rows cover the entire file. Inside
 * a block of changes, the n-th removed line is paired with the n-th added one;
 * the longer side is left with blanks opposite. Hunks that do not touch get a
 * `gap` row between them.
 */
export function alignDiff(lines: string[]): SideRow[] {
  const rows: SideRow[] = [];
  let removed: Side[] = [];
  let added: Side[] = [];
  let inHunk = false;
  let oldNo = 0;
  let newNo = 0;

  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let i = 0; i < count; i++) {
      const left = removed[i] ?? null;
      const right = added[i] ?? null;
      rows.push({left, right, kind: left && right ? 'change' : left ? 'del' : 'add'});
    }
    removed = [];
    added = [];
  };

  for (const line of lines) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      flush();
      if (inHunk) rows.push({left: null, right: null, kind: 'gap'});
      inHunk = true;
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      continue;
    }
    if (line.startsWith('diff --git')) {
      inHunk = false;
      continue;
    }
    // Before the first hunk is the file header; `\ No newline at end of file` is not content.
    if (!inHunk || line.startsWith('\\')) continue;

    const text = line.slice(1);
    if (line.startsWith('-')) removed.push({no: oldNo++, text});
    else if (line.startsWith('+')) added.push({no: newNo++, text});
    else {
      flush();
      rows.push({left: {no: oldNo++, text}, right: {no: newNo++, text}, kind: 'context'});
    }
  }
  flush();
  return rows;
}

/** Index of the first row of each block of changes. */
export function changeStarts(rows: SideRow[]): number[] {
  const starts: number[] = [];
  rows.forEach((row, i) => {
    const changed = row.kind !== 'context' && row.kind !== 'gap';
    const previous = rows[i - 1];
    if (changed && (!previous || previous.kind === 'context' || previous.kind === 'gap')) starts.push(i);
  });
  return starts;
}
