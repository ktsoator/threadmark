export type DiffLine = {
  kind: 'context' | 'addition' | 'deletion' | 'hunk' | 'note';
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type ParsedDiff = {
  lines: DiffLine[];
  additions: number;
  deletions: number;
};

// Track hunk lengths so code beginning with --- or +++ is not mistaken for a header.
export function parseDiff(diff: string): ParsedDiff | null {
  const result: ParsedDiff = { lines: [], additions: 0, deletions: 0 };
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let inHunk = false;
  const lines = diff.split('\n');

  for (const [index, line] of lines.entries()) {
    if (index === lines.length - 1 && line === '') break;
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      if (oldRemaining || newRemaining) return null;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
      if (
        ![oldLine, newLine, oldRemaining, newRemaining].every(
          Number.isSafeInteger,
        )
      )
        return null;
      inHunk = true;
      result.lines.push({ kind: 'hunk', text: line });
    } else if (inHunk && line === '\\ No newline at end of file') {
      result.lines.push({ kind: 'note', text: line.slice(2) });
    } else if (inHunk && line.startsWith('+') && newRemaining > 0) {
      result.lines.push({ kind: 'addition', text: line.slice(1), newLine });
      newLine++;
      newRemaining--;
      result.additions++;
    } else if (inHunk && line.startsWith('-') && oldRemaining > 0) {
      result.lines.push({ kind: 'deletion', text: line.slice(1), oldLine });
      oldLine++;
      oldRemaining--;
      result.deletions++;
    } else if (
      inHunk &&
      line.startsWith(' ') &&
      oldRemaining > 0 &&
      newRemaining > 0
    ) {
      result.lines.push({
        kind: 'context',
        text: line.slice(1),
        oldLine,
        newLine,
      });
      oldLine++;
      newLine++;
      oldRemaining--;
      newRemaining--;
    } else if (
      !inHunk &&
      (line.startsWith('--- ') || line.startsWith('+++ '))
    ) {
      continue;
    } else {
      return null;
    }
  }

  return inHunk && !oldRemaining && !newRemaining ? result : null;
}
