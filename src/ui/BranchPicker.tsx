import React from 'react';
import {Box, Text} from 'ink';
import type {PickerOption} from './picker.js';
import {centerWindow} from './viewport.js';
import {DETAIL_LINES} from './CommitDetail.js';

interface Props {
  query: string;
  options: PickerOption[];
  index: number;
}

/** Seletor de branch; ocupa o lugar do painel de detalhes. */
export function BranchPicker({query, options, index}: Props) {
  const size = DETAIL_LINES - 1;
  const start = centerWindow(options.length, index, size);
  const visible = options.slice(start, start + size);
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text wrap="truncate-end">
        <Text bold>Branch: </Text>
        {query}
        <Text inverse> </Text>
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>Nenhuma branch encontrada.</Text>
      ) : (
        visible.map((option, i) => {
          const active = start + i === index;
          return (
            <Text key={option.label} wrap="truncate-end" inverse={active}>
              {`${active ? '>' : ' '} ${option.label}`}
            </Text>
          );
        })
      )}
    </Box>
  );
}
