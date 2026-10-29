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
          <Text bold>Merge de </Text>
          <Text bold color={tint(display, 'yellow')}>
            {describeMergeTarget(only)}
          </Text>
          <Text bold> em </Text>
          <Text bold color={tint(display, 'cyan')}>
            {branch}
          </Text>
          <Text bold>?</Text>
        </Text>
        <Text wrap="truncate-end" dimColor>
          {only.kind === 'commit'
            ? 'Nenhuma branch aponta para este commit: o merge usa o commit.'
            : only.remote
              ? 'Branch remota: usa a cópia local já buscada, sem acessar a rede.'
              : ' '}
        </Text>
        <Text wrap="truncate-end" dimColor>
          Fast-forward quando possível; senão cria um merge commit.
        </Text>
        <Text wrap="truncate-end" dimColor>
          Se houver conflitos, você escolhe entre abortar e deixar em andamento.
        </Text>
      </Box>
    );
  }

  const size = DETAIL_LINES - 1;
  const start = centerWindow(targets.length, index, size);
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold wrap="truncate-end">{`Merge de qual branch em ${branch}?`}</Text>
      {targets.slice(start, start + size).map((target, i) => {
        const active = start + i === index;
        const label = `${active ? '>' : ' '} ${describeMergeTarget(target)}${
          target.kind === 'branch' && target.remote ? ' (remota)' : ''
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
