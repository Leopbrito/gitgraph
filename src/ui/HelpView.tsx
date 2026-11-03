import React, {useMemo, useState} from 'react';
import {Box, Text, useInput, useWindowSize} from 'ink';
import {separator, useDisplay} from './display.js';
import {CONTEXT_TITLES, shortcutLines, type ShortcutContext} from './keymap.js';
import {scrollBy} from './scroll.js';

// Title, rule and footer, plus the Browser's spare line.
const CHROME_LINES = 4;
const CONTEXTS: ShortcutContext[] = ['list', 'commit', 'diff', 'dialog'];

interface Props {
  onClose: () => void;
}

/** Every shortcut, from the same table as the footer and `--help`. Scrolls when it does not fit. */
export function HelpView({onClose}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const [scroll, setScroll] = useState(0);
  const lines = useMemo(
    () =>
      CONTEXTS.flatMap((context, i) => [
        ...(i > 0 ? [{text: '', heading: false}] : []),
        {text: CONTEXT_TITLES[context], heading: true},
        ...shortcutLines(context, display.ascii).map(text => ({text: `  ${text}`, heading: false})),
      ]),
    [display.ascii],
  );
  const height = Math.max(1, terminalRows - 1 - CHROME_LINES + 1);
  const offset = scrollBy(scroll, 0, lines.length, height);
  const go = (delta: number) => setScroll(scrollBy(offset, delta, lines.length, height));
  const arrows = display.ascii ? 'Up/Down' : '↑/↓';

  useInput((input, key) => {
    if (key.escape || input === '?' || input === 'q') onClose();
    else if (key.downArrow || input === 'j') go(1);
    else if (key.upArrow || input === 'k') go(-1);
    else if (key.pageDown || input === ' ') go(height);
    else if (key.pageUp) go(-height);
    else if (key.home || input === 'g') go(-lines.length);
    else if (key.end || input === 'G') go(lines.length);
  });

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text bold wrap="truncate-end">
        {`gitgraph ${dot} ajuda`}
        {lines.length > height ? ` ${dot} ${offset + 1}-${Math.min(lines.length, offset + height)}/${lines.length}` : ''}
      </Text>
      <Text dimColor>{(display.ascii ? '-' : '─').repeat(columns)}</Text>
      <Box flexDirection="column" height={height} overflow="hidden">
        {lines.slice(offset, offset + height).map((line, i) => (
          <Text key={offset + i} wrap="truncate-end" bold={line.heading}>
            {line.text === '' ? ' ' : line.text}
          </Text>
        ))}
      </Box>
      <Text dimColor wrap="truncate-end">
        {`j/k ${arrows} rola ${dot} ? / Esc / q fecha`}
      </Text>
    </Box>
  );
}
