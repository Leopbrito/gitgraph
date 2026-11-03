import React from 'react';
import {Box, Text} from 'ink';
import type {Commit, Ref} from '../graph/types.js';
import {formatDate} from './date.js';
import {separator, tint, useDisplay} from './display.js';
import {describeWorkingTree} from '../git/status.js';
import {formatRefs, type HeadInfo} from './format.js';

/** Fixed lines of the panel, so the layout does not jump when changing commits. */
export const DETAIL_LINES = 5;

interface Props {
  commit: Commit | undefined;
  refs: Ref[];
  head: HeadInfo;
}

export function CommitDetail({commit, refs, head}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  if (!commit) {
    return (
      <Box height={DETAIL_LINES}>
        <Text dimColor>No commit to show.</Text>
      </Box>
    );
  }
  if (commit.uncommitted) {
    const parent = commit.parents[0]?.slice(0, 7);
    return (
      <Box flexDirection="column" height={DETAIL_LINES}>
        <Text wrap="truncate-end" bold color={tint(display, 'yellow')}>
          Uncommitted changes
        </Text>
        <Text wrap="truncate-end" dimColor>
          {`on top of HEAD${parent ? ` (${parent})` : ''}`}
        </Text>
        <Text wrap="truncate-end">{describeWorkingTree(commit.uncommitted)}</Text>
        <Text wrap="truncate-end" dimColor>
          See the content with git status and git diff; r reloads after committing.
        </Text>
        <Text> </Text>
      </Box>
    );
  }
  const body = commit.body.split('\n').slice(0, 2);
  const parents = commit.parents.map(p => p.slice(0, 7)).join(', ');
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
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
        {parents ? ` ${dot} parents: ${parents}` : ` ${dot} root commit`}
      </Text>
      <Text wrap="truncate-end" bold>
        {commit.subject}
      </Text>
      <Text wrap="truncate-end">{body[0] ?? ' '}</Text>
      <Text wrap="truncate-end">{body[1] ?? ' '}</Text>
    </Box>
  );
}
