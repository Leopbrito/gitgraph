import React from 'react';
import {Box, Text} from 'ink';
import {
  describeOption,
  describeTarget,
  isCurrent,
  type CheckoutTarget,
} from '../git/checkout.js';
import type {RefInfo} from '../git/refs.js';
import {DETAIL_LINES} from './CommitDetail.js';
import {centerWindow} from './viewport.js';

interface Props {
  targets: CheckoutTarget[];
  index: number;
  head: RefInfo['head'];
}

/** Checkout confirmation; takes the place of the details panel. */
export function CheckoutPrompt({targets, index, head}: Props) {
  const only = targets.length === 1 ? targets[0] : undefined;
  if (only) {
    return (
      <Box flexDirection="column" height={DETAIL_LINES}>
        <Text wrap="truncate-end">
          <Text bold>Check out </Text>
          <Text bold color="yellow">
            {describeTarget(only)}
          </Text>
          <Text bold>?</Text>
        </Text>
        <Text wrap="truncate-end" dimColor>
          {only.kind === 'detach'
            ? 'No local branch points at this commit: HEAD will be detached.'
            : ' '}
        </Text>
      </Box>
    );
  }

  const size = DETAIL_LINES - 1;
  const start = centerWindow(targets.length, index, size);
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold wrap="truncate-end">
        {targets.some(t => t.kind === 'pull')
          ? 'The local and the remote branch are at different commits. Check out:'
          : 'Check out which branch?'}
      </Text>
      {targets.slice(start, start + size).map((target, i) => {
        const active = start + i === index;
        const label = `${active ? '>' : ' '} ${describeOption(target)}${isCurrent(target, head) ? ' (atual)' : ''}`;
        return (
          <Text key={label} wrap="truncate-end" inverse={active}>
            {label}
          </Text>
        );
      })}
    </Box>
  );
}
