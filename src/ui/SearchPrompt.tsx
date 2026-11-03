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
        <Text bold>Search: </Text>
        {query}
        <Text inverse> </Text>
        {query.trim() !== '' && (
          <Text dimColor>
            {`  ${count === 0 ? (more ? 'no loaded results' : 'no results') : `${count}${more ? '+' : ''} ${count === 1 ? 'result' : 'results'}`}`}
          </Text>
        )}
      </Text>
      <Text dimColor wrap="truncate-end">
        {query.trim() !== '' && count === 0 && more
          ? 'Enter searches the rest of the history, loading more commits.'
          : 'Message, author, e-mail or hash, case-insensitive.'}
      </Text>
      <Text> </Text>
      <Text> </Text>
      <Text> </Text>
    </Box>
  );
}
