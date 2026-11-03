import React from 'react';
import {Box, Text} from 'ink';
import {describeMergeTarget, type MergeTarget} from '../git/merge.js';
import {DETAIL_LINES} from './CommitDetail.js';
import {tint, useDisplay} from './display.js';
import {centerWindow} from './viewport.js';

interface Props {
  targets: MergeTarget[];
  index: number;
  /** The branch the merge goes into. */
  branch: string;
}

/** Merge confirmation; takes the place of the details panel. */
export function MergePrompt({targets, index, branch}: Props) {
  const display = useDisplay();
  const only = targets.length === 1 ? targets[0] : undefined;
  if (only) {
    return (
      <Box flexDirection="column" height={DETAIL_LINES}>
        <Text wrap="truncate-end">
          <Text bold>Merge </Text>
          <Text bold color={tint(display, 'yellow')}>
            {describeMergeTarget(only)}
          </Text>
          <Text bold> into </Text>
          <Text bold color={tint(display, 'cyan')}>
            {branch}
          </Text>
          <Text bold>?</Text>
        </Text>
        <Text wrap="truncate-end" dimColor>
          {only.kind === 'commit'
            ? 'No branch points at this commit: the merge uses the commit.'
            : only.remote
              ? 'Remote branch: uses the local copy already fetched, without touching the network.'
              : ' '}
        </Text>
        <Text wrap="truncate-end" dimColor>
          Fast-forward when possible; otherwise creates a merge commit.
        </Text>
        <Text wrap="truncate-end" dimColor>
          If there are conflicts, you choose between aborting and leaving it in progress.
        </Text>
      </Box>
    );
  }

  const size = DETAIL_LINES - 1;
  const start = centerWindow(targets.length, index, size);
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold wrap="truncate-end">{`Merge which branch into ${branch}?`}</Text>
      {targets.slice(start, start + size).map((target, i) => {
        const active = start + i === index;
        const label = `${active ? '>' : ' '} ${describeMergeTarget(target)}${
          target.kind === 'branch' && target.remote ? ' (remote)' : ''
        }`;
        return (
          <Text key={label} wrap="truncate-end" inverse={active}>
            {label}
          </Text>
        );
      })}
    </Box>
  );
}
