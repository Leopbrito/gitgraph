import React from 'react';
import {Box, Text} from 'ink';
import {canSkip, type Operation} from '../git/operation.js';
import {DETAIL_LINES} from './CommitDetail.js';
import {tint, useDisplay} from './display.js';

export type OperationChoice = 'abort' | 'proceed' | 'skip' | 'leave';

export interface OperationOption {
  choice: OperationChoice;
  /** Shortcut key. */
  key: string;
  label: string;
}

/** What can be done with an operation that is stopped; `skip` only exists for the ones that have steps. */
export function operationOptions(op: Operation): OperationOption[] {
  return [
    {choice: 'abort', key: 'a', label: `Abortar o ${op} (git ${op} --abort)`},
    {choice: 'proceed', key: 'c', label: `Continuar (git ${op} --continue), depois de resolver os conflitos`},
    ...(canSkip(op) ? [{choice: 'skip', key: 's', label: `Pular este passo (git ${op} --skip)`} as const] : []),
    {choice: 'leave', key: 'd', label: 'Deixar em andamento (resolva no terminal)'},
  ];
}

interface Props {
  operation: Operation;
  /** Files with unresolved conflicts (empty: nothing left to resolve, ready to continue). */
  files: string[];
  index: number;
}

const SHOWN_FILES = 2;

/** An operation (cherry-pick, revert, rebase) is stopped: abort, continue, skip or leave it. Takes the place of the details panel. */
export function OperationPrompt({operation, files, index}: Props) {
  const display = useDisplay();
  const listed = files.slice(0, SHOWN_FILES).join(', ') + (files.length > SHOWN_FILES ? ` +${files.length - SHOWN_FILES}` : '');
  const title =
    files.length > 0
      ? `${operation} com conflitos (${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}): ${listed}`
      : `${operation} em andamento: sem conflitos pendentes`;
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text bold color={tint(display, files.length > 0 ? 'red' : 'yellow')} wrap="truncate-end">
        {title}
      </Text>
      {operationOptions(operation).map((option, i) => (
        <Text key={option.choice} wrap="truncate-end" inverse={i === index}>
          {`${i === index ? '>' : ' '} ${option.label}`}
        </Text>
      ))}
    </Box>
  );
}
