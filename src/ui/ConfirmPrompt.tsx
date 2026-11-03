import React from 'react';
import {Box, Text} from 'ink';
import {DETAIL_LINES} from './CommitDetail.js';
import {tint, useDisplay} from './display.js';

interface Props {
  title: string;
  /** Up to `DETAIL_LINES - 1` explanatory lines under the title. */
  lines: string[];
  /** The action is destructive: the title is red. */
  danger?: boolean;
}

/** A yes/no question; takes the place of the details panel. */
export function ConfirmPrompt({title, lines, danger = false}: Props) {
  const display = useDisplay();
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold wrap="truncate-end" color={danger ? tint(display, 'red') : undefined}>
        {title}
      </Text>
      {lines.slice(0, DETAIL_LINES - 1).map((line, i) => (
        <Text key={i} wrap="truncate-end" dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
