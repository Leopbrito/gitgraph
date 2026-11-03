import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useInput, useWindowSize} from 'ink';
import type {ChangedFile, ChangesActions} from '../git/changes.js';
import type {Commit, Ref} from '../graph/types.js';
import {formatDate} from './date.js';
import {arrow as arrowOf, arrows as arrowKeys, ellipsis as ellipsisOf, rule as ruleOf, separator, tint, useDisplay} from './display.js';
import {DiffView} from './DiffView.js';
import {formatRefs, type HeadInfo} from './format.js';
import type {MouseEvent, MouseSource} from './mouse.js';
import {keepVisible, scrollBy, wrapText} from './scroll.js';
import {useDoubleClick} from './useDoubleClick.js';
import {clamp} from './viewport.js';

// Header (3 lines), separator, footer and the Browser's spare line.
const CHROME_LINES = 5;
// Lines above the area (header, author line, subject and rule).
const AREA_TOP = 4;
// Lines moved per wheel notch.
const WHEEL_STEP = 3;

interface Props {
  commit: Commit;
  refs: Ref[];
  head: HeadInfo;
  changes: ChangesActions;
  mouse?: MouseSource;
  onClose: () => void;
}

type Focus = 'message' | 'files';

const oneLine = (message: string) => message.replace(/\s+/g, ' ').trim();

/** Full-screen view of what a commit changed: message, files and the diff. */
export function CommitView({commit, refs, head, changes, mouse, onClose}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>('files');
  const [bodyScroll, setBodyScroll] = useState(0);
  const [file, setFile] = useState({selected: 0, offset: 0});
  // Set while a diff is open: `target` is the file, or undefined for the whole commit.
  const [diff, setDiff] = useState<{target?: ChangedFile} | null>(null);

  useEffect(() => {
    let current = true;
    changes
      .files(commit)
      .then(result => current && setFiles(result))
      .catch(e => current && setError(oneLine(e instanceof Error ? e.message : String(e))));
    return () => {
      current = false;
    };
  }, [changes, commit]);

  const body = useMemo(() => {
    const text = commit.body.trim();
    return text === '' ? [] : wrapText(text, columns - 2);
  }, [commit.body, columns]);
  const area = Math.max(1, terminalRows - 1 - CHROME_LINES);
  const headings = (body.length > 0 ? 1 : 0) + 1;
  const remaining = Math.max(0, area - headings);
  const bodyHeight = body.length > 0 ? Math.min(body.length, Math.max(1, Math.floor(remaining / 3))) : 0;
  const filesHeight = Math.max(0, remaining - bodyHeight);

  const fileCount = files?.length ?? 0;
  const bodyOffset = scrollBy(bodyScroll, 0, body.length, bodyHeight);
  const fileOffset = keepVisible(file.offset, file.selected, filesHeight);

  const openDiff = (target?: ChangedFile) => setDiff({target});

  const isDoubleClick = useDoubleClick();
  // Always the latest closure, so the subscription is made only once.
  const onMouse = useRef<(event: MouseEvent) => void>(() => {});
  onMouse.current = event => {
    // The diff has the screen while it is open.
    if (diff) return;
    const bodyTop = AREA_TOP + 1;
    // Past the message: its height, plus the files heading.
    const filesTop = body.length > 0 ? bodyTop + bodyHeight + 1 : bodyTop;
    const inBody = body.length > 0 && event.row >= bodyTop && event.row < filesTop - 1;
    const inFiles = event.row >= filesTop && event.row < filesTop + filesHeight;
    const selectFile = (index: number) =>
      setFile({selected: clamp(index, 0, Math.max(0, fileCount - 1)), offset: fileOffset});
    if (event.type === 'click') {
      if (inBody) {
        setFocus('message');
      } else if (inFiles) {
        const index = fileOffset + event.row - filesTop;
        if (index >= fileCount) return;
        setFocus('files');
        selectFile(index);
        if (isDoubleClick(index)) openDiff(files?.[index]);
      }
    } else {
      const delta = event.type === 'wheelUp' ? -WHEEL_STEP : WHEEL_STEP;
      if (inBody) setBodyScroll(scrollBy(bodyOffset, delta, body.length, bodyHeight));
      else if (inFiles) {
        setFocus('files');
        selectFile(file.selected + delta);
      }
    }
  };
  useEffect(() => mouse?.subscribe(event => onMouse.current(event)), [mouse]);

  useInput((input, key) => {
    if (key.escape || input === 'q') onClose();
    else if (key.tab) setFocus(focus === 'files' ? 'message' : 'files');
    else if (input === 'd') openDiff();
    else if (key.return) openDiff(focus === 'files' ? files?.[file.selected] : undefined);
    else if (focus === 'message') {
      const scroll = (delta: number) => setBodyScroll(scrollBy(bodyOffset, delta, body.length, bodyHeight));
      if (key.downArrow || input === 'j') scroll(1);
      else if (key.upArrow || input === 'k') scroll(-1);
      else if (key.pageDown) scroll(bodyHeight);
      else if (key.pageUp) scroll(-bodyHeight);
      else if (key.home || input === 'g') scroll(-body.length);
      else if (key.end || input === 'G') scroll(body.length);
    } else {
      const select = (index: number) =>
        setFile({selected: clamp(index, 0, Math.max(0, fileCount - 1)), offset: fileOffset});
      const page = Math.max(1, filesHeight);
      if (key.downArrow || input === 'j') select(file.selected + 1);
      else if (key.upArrow || input === 'k') select(file.selected - 1);
      else if (key.pageDown) select(file.selected + page);
      else if (key.pageUp) select(file.selected - page);
      else if (key.home || input === 'g') select(0);
      else if (key.end || input === 'G') select(fileCount - 1);
    }
    // The diff has its own keys while it is open.
  }, {isActive: diff === null});

  const rule = <Text dimColor>{ruleOf(display, columns)}</Text>;
  const ellipsis = ellipsisOf(display);
  const arrows = arrowKeys(display);

  if (diff) {
    return <DiffView commit={commit} target={diff.target} changes={changes} onClose={() => setDiff(null)} />;
  }

  const stats = fileStats(files ?? []);
  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text color={tint(display, 'yellow')}>{commit.hash}</Text>
        {formatRefs(refs, head).map(label => (
          <Text key={label.text} color={tint(display, label.color)} bold>
            {` (${label.text})`}
          </Text>
        ))}
      </Text>
      <Text wrap="truncate-end" dimColor>
        {`${commit.author} <${commit.email}> ${dot} ${formatDate(commit.date, display.date ?? 'short', {detail: true})}`}
        {commit.parents.length > 0
          ? ` ${dot} parents: ${commit.parents.map(p => p.slice(0, 7)).join(', ')}`
          : ` ${dot} root commit`}
      </Text>
      <Text wrap="truncate-end" bold>
        {commit.subject}
      </Text>
      {rule}
      <Box flexDirection="column" height={area} overflow="hidden">
        {body.length > 0 && (
          <>
            <Text wrap="truncate-end" bold={focus === 'message'} dimColor={focus !== 'message'}>
              {`Message${body.length > bodyHeight ? ` ${dot} ${bodyOffset + 1}-${bodyOffset + bodyHeight}/${body.length}` : ''}`}
            </Text>
            {body.slice(bodyOffset, bodyOffset + bodyHeight).map((line, i) => (
              <Text key={bodyOffset + i} wrap="truncate-end">
                {`  ${line}`}
              </Text>
            ))}
          </>
        )}
        <Text wrap="truncate-end" bold={focus === 'files'} dimColor={focus !== 'files'}>
          {files
            ? `Changed files (${fileCount})${fileCount > 0 ? ` ${dot} +${stats.added} -${stats.deleted}` : ''}${commit.parents.length > 1 ? ` ${dot} relative to the 1st parent` : ''}`
            : `Changed files`}
        </Text>
        {error ? (
          <Text color={tint(display, 'red')}>{`error: ${error}`}</Text>
        ) : !files ? (
          <Text dimColor>{`loading${ellipsis}`}</Text>
        ) : files.length === 0 ? (
          <Text dimColor>No changed files.</Text>
        ) : (
          files
            .slice(fileOffset, fileOffset + filesHeight)
            .map((entry, i) => (
              <FileRow
                key={entry.path}
                file={entry}
                stats={stats}
                selected={focus === 'files' && fileOffset + i === file.selected}
              />
            ))
        )}
      </Box>
      <Text wrap="truncate-end" dimColor>
        {`Tab switches ${dot} j/k ${arrows} move ${dot} Enter ${focus === 'files' && fileCount > 0 ? 'file diff' : 'commit diff'} ${dot} d commit diff ${dot} Esc back`}
      </Text>
    </Box>
  );
}

interface Stats {
  added: number;
  deleted: number;
  addedWidth: number;
  deletedWidth: number;
}

function fileStats(files: ChangedFile[]): Stats {
  let added = 0;
  let deleted = 0;
  for (const f of files) {
    added += f.added ?? 0;
    deleted += f.deleted ?? 0;
  }
  const width = (pick: (f: ChangedFile) => number | null) =>
    Math.max(1, ...files.map(f => String(pick(f) ?? '').length));
  return {added, deleted, addedWidth: width(f => f.added), deletedWidth: width(f => f.deleted)};
}

const STATUS_COLOR = {A: 'green', M: 'yellow', D: 'red', R: 'cyan', C: 'cyan', T: 'magenta'} as const;

function FileRow({file, stats, selected}: {file: ChangedFile; stats: Stats; selected: boolean}) {
  const display = useDisplay();
  const arrow = arrowOf(display);
  const binary = file.added === null || file.deleted === null;
  const plus = binary ? 'bin'.padStart(stats.addedWidth + 1) : `+${file.added}`.padStart(stats.addedWidth + 1);
  const minus = binary ? ''.padStart(stats.deletedWidth + 1) : `-${file.deleted}`.padStart(stats.deletedWidth + 1);
  return (
    <Text wrap="truncate-end">
      <Text>{selected ? '>' : ' '}</Text>
      <Text inverse={selected}>
        <Text color={tint(display, STATUS_COLOR[file.status])} bold>{` ${file.status} `}</Text>
        <Text color={tint(display, 'green')}>{plus}</Text>
        <Text>{' '}</Text>
        <Text color={tint(display, 'red')}>{minus}</Text>
        <Text>{`  ${file.oldPath ? `${file.oldPath} ${arrow} ` : ''}${file.path}`}</Text>
      </Text>
    </Text>
  );
}
