import React from 'react';
import {Box, Text} from 'ink';
import type {Commit, Ref} from '../graph/types.js';
import {formatDate} from './date.js';
import {separator, tint, useDisplay} from './display.js';
import {describeWorkingTree} from '../git/status.js';
import {formatRefs, type HeadInfo} from './format.js';

/** Linhas fixas do painel, para o layout não pular ao trocar de commit. */
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
        <Text dimColor>Nenhum commit para mostrar.</Text>
      </Box>
    );
  }
  if (commit.uncommitted) {
    const parent = commit.parents[0]?.slice(0, 7);
    return (
      <Box flexDirection="column" height={DETAIL_LINES}>
        <Text wrap="truncate-end" bold color={tint(display, 'yellow')}>
          Alterações não commitadas
        </Text>
        <Text wrap="truncate-end" dimColor>
          {`sobre o HEAD${parent ? ` (${parent})` : ''}`}
        </Text>
        <Text wrap="truncate-end">{describeWorkingTree(commit.uncommitted)}</Text>
        <Text wrap="truncate-end" dimColor>
          Veja o conteúdo com git status e git diff; r recarrega depois de commitar.
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
        {parents ? ` ${dot} pais: ${parents}` : ` ${dot} commit raiz`}
      </Text>
      <Text wrap="truncate-end" bold>
        {commit.subject}
      </Text>
      <Text wrap="truncate-end">{body[0] ?? ' '}</Text>
      <Text wrap="truncate-end">{body[1] ?? ' '}</Text>
    </Box>
  );
}
