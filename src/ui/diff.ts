export type DiffLineKind = 'header' | 'hunk' | 'add' | 'del' | 'context';

/**
 * Tells what each line of a unified diff is. Lines before the first `@@` of a
 * file are its header, so a removed line like `-- comment` (shown as
 * `--- comment`) is not mistaken for the `---` file header.
 */
export function classifyDiff(lines: string[]): DiffLineKind[] {
  let inHeader = true;
  return lines.map(line => {
    if (line.startsWith('diff --git')) {
      inHeader = true;
      return 'header';
    }
    if (inHeader) {
      if (line.startsWith('@@')) inHeader = false;
      else return 'header';
    }
    if (line.startsWith('@@')) return 'hunk';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'del';
    return 'context';
  });
}
