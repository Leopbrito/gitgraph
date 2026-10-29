import React from 'react';
import {Box, Text} from 'ink';
import type {Commit, Ref} from '../graph/types.js';
import {formatRefs, type HeadInfo} from './format.js';

/** Linhas fixas do painel, para o layout não pular ao trocar de commit. */
export const DETAIL_LINES = 5;

interface Props {
  commit: Commit | undefined;
  refs: Ref[];
  head: HeadInfo;
}

export function CommitDetail({commit, refs, head}: Props) {
  if (!commit) {
    return (
      <Box height={DETAIL_LINES}>
        <Text dimColor>Nenhum commit para mostrar.</Text>
      </Box>
    );
  }
  const body = commit.body.split('\n').slice(0, 2);
  const parents = commit.parents.map(p => p.slice(0, 7)).join(', ');
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text wrap="truncate-end">
        <Text color="yellow">{commit.hash}</Text>
        {formatRefs(refs, head).map(label => (
          <Text key={label.text} color={label.color} bold>
            {` (${label.text})`}
          </Text>
        ))}
      </Text>
      <Text wrap="truncate-end" dimColor>
        {`${commit.author} <${commit.email}> · ${commit.date.replace('T', ' ').slice(0, 16)}`}
        {parents ? ` · pais: ${parents}` : ' · commit raiz'}
      </Text>
      <Text wrap="truncate-end" bold>
        {commit.subject}
      </Text>
      <Text wrap="truncate-end">{body[0] ?? ' '}</Text>
      <Text wrap="truncate-end">{body[1] ?? ' '}</Text>
    </Box>
  );
}
