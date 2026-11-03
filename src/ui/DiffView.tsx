import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useInput, useWindowSize} from 'ink';
import type {ChangedFile, ChangesActions, Diff} from '../git/changes.js';
import type {Commit} from '../graph/types.js';
import {classifyDiff, type DiffLineKind} from './diff.js';
import {arrow, arrows as arrowKeys, ellipsis as ellipsisOf, rule, separator, tint, useDisplay} from './display.js';
import {scrollBy} from './scroll.js';
import {alignDiff, changeStarts, type Side, type SideRow} from './sideBySide.js';

// Title, column header (or rule) and footer, plus the Browser's spare line.
const CHROME_LINES = 3;
// Where a jump to a change lands: a couple of lines of context above it.
const JUMP_MARGIN = 2;

interface Props {
  commit: Commit;
  /** The file to show; without it, the whole commit (unified only). */
  target?: ChangedFile;
  changes: ChangesActions;
  onClose: () => void;
}

type Mode = 'split' | 'unified';

type Loaded =
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ready'; diff: Diff};

const oneLine = (message: string) => message.replace(/\s+/g, ' ').trim();

/**
 * The diff of a file or commit. A file opens side by side (old and new
 * versions, whole file, aligned); `u` switches to the unified hunks. A binary
 * file and the whole-commit diff are unified only.
 */
export function DiffView({commit, target, changes, onClose}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const splittable = target !== undefined && target.added !== null;
  const [mode, setMode] = useState<Mode>(splittable ? 'split' : 'unified');
  const [loaded, setLoaded] = useState<Loaded>({status: 'loading'});
  const [scroll, setScroll] = useState(0);
  const height = Math.max(1, terminalRows - 1 - CHROME_LINES);

  const title = target
    ? `${target.oldPath ? `${target.oldPath} ${arrow(display)} ` : ''}${target.path}`
    : `commit ${commit.hash.slice(0, 7)}`;

  useEffect(() => {
    let current = true;
    setLoaded({status: 'loading'});
    const request = target && mode === 'split' ? changes.fullDiff(commit, target) : changes.diff(commit, target);
    request
      .then(diff => current && setLoaded({status: 'ready', diff}))
      .catch(
        e => current && setLoaded({status: 'error', message: oneLine(e instanceof Error ? e.message : String(e))}),
      );
    return () => {
      current = false;
    };
  }, [changes, commit, target, mode]);

  const diff = loaded.status === 'ready' ? loaded.diff : null;
  const rows = useMemo(() => (diff && mode === 'split' ? alignDiff(diff.lines) : []), [diff, mode]);
  const starts = useMemo(() => changeStarts(rows), [rows]);
  const kinds = useMemo(() => (diff && mode === 'unified' ? classifyDiff(diff.lines) : []), [diff, mode]);
  const total = mode === 'split' ? rows.length : (diff?.lines.length ?? 0);

  // A whole file starts at line 1, far from what changed: open on the first change.
  useEffect(() => {
    setScroll(mode === 'split' && starts[0] !== undefined ? scrollBy(0, starts[0] - JUMP_MARGIN, rows.length, height) : 0);
  }, [diff, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input, key) => {
    const go = (delta: number) => setScroll(current => scrollBy(current, delta, total, height));
    if (key.escape || key.backspace || input === 'q') onClose();
    else if (key.downArrow || input === 'j') go(1);
    else if (key.upArrow || input === 'k') go(-1);
    else if (key.pageDown || input === ' ') go(height);
    else if (key.pageUp) go(-height);
    else if (key.home || input === 'g') go(-total);
    else if (key.end || input === 'G') go(total);
    else if (input === 'u' && splittable) setMode(mode === 'split' ? 'unified' : 'split');
    else if (mode === 'split' && (input === 'n' || input === 'N')) {
      const here = scroll + JUMP_MARGIN;
      const next = input === 'n' ? starts.find(s => s > here) : [...starts].reverse().find(s => s < here);
      if (next !== undefined) setScroll(scrollBy(0, next - JUMP_MARGIN, total, height));
    }
  });

  const ellipsis = ellipsisOf(display);
  const arrows = arrowKeys(display);
  const position =
    total > 0 ? `${scroll + 1}-${Math.min(total, scroll + height)}/${total}${diff?.truncated ? '+' : ''}` : '';
  const toggle = splittable ? ` ${dot} u ${mode === 'split' ? 'unificado' : 'lado a lado'}` : '';
  const jump = mode === 'split' && starts.length > 0 ? ` ${dot} n/N muda` : '';

  let content: React.ReactNode;
  let header: React.ReactNode = <Text dimColor>{rule(display, columns)}</Text>;
  if (loaded.status === 'loading') {
    content = <Text dimColor>{`carregando${ellipsis}`}</Text>;
  } else if (loaded.status === 'error') {
    content = <Text color={tint(display, 'red')}>{`erro: ${loaded.message}`}</Text>;
  } else if (total === 0) {
    content = (
      <Text dimColor>
        {mode === 'split'
          ? 'Sem alterações de conteúdo (arquivo só renomeado ou com outro modo).'
          : 'Sem diferenças para mostrar.'}
      </Text>
    );
  } else if (mode === 'split' && target) {
    const layout = splitLayout(rows, columns, display.ascii);
    header = <SplitHeader target={target} layout={layout} />;
    content = rows
      .slice(scroll, scroll + height)
      .map((row, i) => <SplitRow key={scroll + i} row={row} layout={layout} />);
  } else {
    content = (diff?.lines ?? [])
      .slice(scroll, scroll + height)
      .map((line, i) => <UnifiedLine key={scroll + i} line={line} kind={kinds[scroll + i] ?? 'context'} />);
  }

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text bold>{title}</Text>
        <Text dimColor>{` ${dot} ${commit.hash.slice(0, 7)}`}</Text>
      </Text>
      {header}
      <Box flexDirection="column" height={height} overflow="hidden">
        {content}
      </Box>
      <Text wrap="truncate-end" dimColor>
        {diff?.truncated
          ? `cortado em ${diff.lines.length} linhas ${dot} Esc volta ${dot} ${position}`
          : `j/k ${arrows} rolar ${dot} PgUp/PgDn página ${dot} g/G início/fim${jump}${toggle} ${dot} Esc volta ${dot} ${position}`}
      </Text>
    </Box>
  );
}

interface Layout {
  leftWidth: number;
  rightWidth: number;
  numWidth: number;
  divider: string;
}

/** Splits the screen in two equal columns (and a divider) sized for the largest line number. */
function splitLayout(rows: SideRow[], columns: number, ascii: boolean): Layout {
  let max = 1;
  for (const row of rows) max = Math.max(max, row.left?.no ?? 0, row.right?.no ?? 0);
  const leftWidth = Math.floor((columns - 1) / 2);
  return {
    leftWidth,
    rightWidth: columns - 1 - leftWidth,
    numWidth: String(max).length,
    divider: ascii ? '|' : '│',
  };
}

const fit = (text: string, width: number) => text.slice(0, Math.max(0, width)).padEnd(Math.max(0, width));

function SplitHeader({target, layout}: {target: ChangedFile; layout: Layout}) {
  const before = target.status === 'A' ? 'antes: (não existia)' : `antes: ${target.oldPath ?? target.path}`;
  const after = target.status === 'D' ? 'depois: (removido)' : `depois: ${target.path}`;
  return (
    <Text wrap="truncate-end" dimColor bold>
      {`${fit(before, layout.leftWidth)}${layout.divider}${fit(after, layout.rightWidth)}`}
    </Text>
  );
}

function SplitRow({row, layout}: {row: SideRow; layout: Layout}) {
  const display = useDisplay();
  if (row.kind === 'gap') {
    return <Text dimColor>{fit(display.ascii ? '...' : '⋯', layout.leftWidth + 1 + layout.rightWidth)}</Text>;
  }
  // The marker keeps removed and added lines apart when colors are off.
  const cell = (side: Side | null, marker: string, width: number) =>
    side === null
      ? fit('', width)
      : fit(`${marker}${String(side.no).padStart(layout.numWidth)} ${side.text.replace(/\t/g, '    ')}`, width);
  const removed = row.kind === 'del' || row.kind === 'change';
  const added = row.kind === 'add' || row.kind === 'change';
  return (
    <Text wrap="truncate-end">
      <Text color={tint(display, removed ? 'red' : undefined)}>
        {cell(row.left, removed ? '-' : ' ', layout.leftWidth)}
      </Text>
      <Text dimColor>{layout.divider}</Text>
      <Text color={tint(display, added ? 'green' : undefined)}>
        {cell(row.right, added ? '+' : ' ', layout.rightWidth)}
      </Text>
    </Text>
  );
}

function UnifiedLine({line, kind}: {line: string; kind: DiffLineKind}) {
  const display = useDisplay();
  const text = line.replace(/\t/g, '    ') || ' ';
  if (kind === 'header') return <Text wrap="truncate-end" bold>{text}</Text>;
  const color = {hunk: 'cyan', add: 'green', del: 'red', context: undefined}[kind];
  return <Text wrap="truncate-end" color={tint(display, color)}>{text}</Text>;
}
