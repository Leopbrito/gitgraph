import React from 'react';
import {Box, Text} from 'ink';
import {DETAIL_LINES} from './CommitDetail.js';

interface Props {
  query: string;
  /** Number of matches among the loaded commits. */
  count: number;
  /** More history can still be loaded, so there may be more matches. */
  more: boolean;
}

/** Search input; takes the place of the details panel. */
export function SearchPrompt({query, count, more}: Props) {
  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      <Text wrap="truncate-end">
        <Text bold>Buscar: </Text>
        {query}
        <Text inverse> </Text>
        {query.trim() !== '' && (
          <Text dimColor>{`  ${count === 0 ? 'nenhum resultado' : `${count}${more ? '+' : ''} ${count === 1 ? 'resultado' : 'resultados'}`}`}</Text>
        )}
      </Text>
      <Text dimColor wrap="truncate-end">
        Mensagem, autor, e-mail ou hash, sem diferenciar maiúsculas.
      </Text>
      <Text> </Text>
      <Text> </Text>
      <Text> </Text>
    </Box>
  );
}
