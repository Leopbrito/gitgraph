import React from 'react';
import {Box, Text} from 'ink';
import {DETAIL_LINES} from './CommitDetail.js';
import {tint, useDisplay} from './display.js';

/** The two things to do with a merge that is in progress. */
export const CONFLICT_OPTIONS = [
  'Abortar o merge (git merge --abort)',
  'Deixar em andamento (resolva no terminal)',
] as const;

interface Props {
  /** Files with unresolved conflicts (empty: a merge waiting to be concluded). */
  files: string[];
  /** 0 aborts, 1 leaves the merge in progress. */
  index: number;
}

const SHOWN_FILES = 3;

/** Merge in progress: abort it or leave it for the terminal. Takes the place of the details panel. */
export function ConflictPrompt({files, index}: Props) {
  const display = useDisplay();
  const listed = files.slice(0, SHOWN_FILES).join(', ');
  const more = files.length > SHOWN_FILES ? ` +${files.length - SHOWN_FILES}` : '';
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold color={tint(display, 'red')} wrap="truncate-end">
        {files.length > 0
          ? `Merge com conflitos (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'})`
          : 'Merge em andamento'}
      </Text>
      <Text dimColor wrap="truncate-end">
        {files.length > 0 ? `${listed}${more}` : ' '}
      </Text>
      {CONFLICT_OPTIONS.map((label, i) => (
        <Text key={label} wrap="truncate-end" inverse={i === index}>
          {`${i === index ? '>' : ' '} ${label}`}
        </Text>
      ))}
      <Text> </Text>
    </Box>
  );
}
