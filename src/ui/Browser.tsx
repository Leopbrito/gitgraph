import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import type {RefInfo} from '../git/refs.js';
import {needsConnector} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {BranchPicker} from './BranchPicker.js';
import {CommitDetail, DETAIL_LINES} from './CommitDetail.js';
import {separator, tint, useDisplay} from './display.js';
import {GraphRowView} from './GraphRowView.js';
import {branchNames, pickerOptions} from './picker.js';
import {clamp, scrollIntoView, visibleEnd} from './viewport.js';

export interface GraphData {
  rows: GraphRow[];
  refs: RefInfo;
}

/** Carrega o grafo de uma branch (null = todas), com no máximo `limit` commits. */
export type LoadGraph = (rev: string | null, limit: number) => Promise<GraphData>;

interface Props {
  initial: GraphData;
  initialLimit: number;
  /** Teto de commits (--max-count): sem ele, a lista cresce sob demanda. */
  maxCommits?: number;
  load: LoadGraph;
}

// Cabeçalho, separador, rodapé e uma linha de folga: se a saída ocupar todas as
// linhas do terminal, o Ink limpa a tela a cada render.
const CHROME_LINES = 4;
// Faltando tantos commits para o fim, busca mais histórico.
const LOAD_AHEAD = 20;


export function Browser({initial, initialLimit, maxCommits, load}: Props) {
  const {exit} = useApp();
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const [data, setData] = useState(initial);
  const [rev, setRev] = useState<string | null>(null);
  const [limit, setLimit] = useState(initialLimit);
  const [cursor, setCursor] = useState({selected: 0, offset: 0});
  const [picker, setPicker] = useState<{query: string; index: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const branches = useMemo(() => branchNames(initial.refs), [initial.refs]);
  // A row takes two lines when it has a connector line below it.
  const heights = useMemo(
    () => data.rows.map(row => (needsConnector(row, {spaced: display.spaced}) ? 2 : 1)),
    [data.rows, display.spaced],
  );
  const graphWidth = useMemo(
    () => Math.max(1, ...data.rows.map(r => r.width)),
    [data.rows],
  );
  const total = data.rows.length;
  const listHeight = Math.max(3, terminalRows - DETAIL_LINES - CHROME_LINES);
  // Recalculado a cada render: o redimensionamento do terminal não esconde o cursor.
  const offset = scrollIntoView(heights, cursor.offset, cursor.selected, listHeight);
  const end = visibleEnd(heights, offset, listHeight);
  const pageSize = Math.max(1, end - offset);

  const reload = useCallback(
    (nextRev: string | null, nextLimit: number, resetCursor: boolean) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      load(nextRev, nextLimit)
        .then(next => {
          if (id !== request.current) return;
          setData(next);
          if (resetCursor) setCursor({selected: 0, offset: 0});
        })
        .catch(e => {
          if (id === request.current) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (id === request.current) setLoading(false);
        });
    },
    [load],
  );

  // Perto do fim com a lista cheia: provavelmente há mais histórico.
  const canGrow = maxCommits === undefined || limit < maxCommits;
  useEffect(() => {
    if (loading || error) return;
    if (canGrow && total >= limit && cursor.selected >= total - LOAD_AHEAD) {
      const next = Math.min(limit * 2, maxCommits ?? Infinity);
      setLimit(next);
      reload(rev, next, false);
    }
  }, [loading, error, canGrow, total, limit, maxCommits, cursor.selected, rev, reload]);

  const select = (index: number) =>
    setCursor({
      selected: clamp(index, 0, Math.max(0, total - 1)),
      offset,
    });

  useInput((input, key) => {
    if (picker) {
      const options = pickerOptions(branches, picker.query);
      if (key.escape) {
        setPicker(null);
      } else if (key.return) {
        const choice = options[picker.index];
        setPicker(null);
        if (choice) {
          setRev(choice.rev);
          setLimit(initialLimit);
          reload(choice.rev, initialLimit, true);
        }
      } else if (key.upArrow) {
        setPicker({...picker, index: clamp(picker.index - 1, 0, options.length - 1)});
      } else if (key.downArrow) {
        setPicker({...picker, index: clamp(picker.index + 1, 0, options.length - 1)});
      } else if (key.backspace || key.delete) {
        setPicker({query: picker.query.slice(0, -1), index: 0});
      } else if (input && !key.ctrl && !key.meta) {
        setPicker({query: picker.query + input, index: 0});
      }
      return;
    }

    if (input === 'q') exit();
    else if (key.downArrow || input === 'j') select(cursor.selected + 1);
    else if (key.upArrow || input === 'k') select(cursor.selected - 1);
    else if (key.pageDown) select(cursor.selected + pageSize);
    else if (key.pageUp) select(cursor.selected - pageSize);
    else if (key.home || input === 'g') select(0);
    else if (key.end || input === 'G') select(total - 1);
    else if (input === '/') setPicker({query: '', index: 0});
    else if (key.escape) setError(null);
  });

  const commit = data.rows[cursor.selected]?.commit;
  const refsOf = (hash: string) => data.refs.byCommit.get(hash) ?? [];
  const headOf = (hash: string) => ({
    isHead: data.refs.head.hash === hash,
    branch: data.refs.head.branch,
  });
  const arrows = display.ascii ? 'Up/Down' : '↑/↓';
  const more = canGrow && total >= limit;

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text bold>gitgraph</Text>
        <Text dimColor>
          {` ${dot} ${rev ?? 'todas as branches'} ${dot} ${total === 0 ? 0 : cursor.selected + 1}/${total}${more ? '+' : ''}${loading ? ` ${dot} carregando${display.ascii ? '...' : '…'}` : ''}`}
        </Text>
      </Text>
      <Box flexDirection="column" height={listHeight} overflow="hidden">
        {data.rows.slice(offset, end).map((row, i) => (
          <GraphRowView
            key={row.commit.hash}
            row={row}
            graphWidth={graphWidth}
            refs={refsOf(row.commit.hash)}
            head={headOf(row.commit.hash)}
            selected={offset + i === cursor.selected}
          />
        ))}
      </Box>
      <Text dimColor>{(display.ascii ? '-' : '─').repeat(columns)}</Text>
      {picker ? (
        <BranchPicker
          query={picker.query}
          options={pickerOptions(branches, picker.query)}
          index={picker.index}
        />
      ) : (
        <CommitDetail
          commit={commit}
          refs={commit ? refsOf(commit.hash) : []}
          head={commit ? headOf(commit.hash) : {isHead: false, branch: null}}
        />
      )}
      <Text wrap="truncate-end" color={error ? tint(display, 'red') : undefined} dimColor={!error}>
        {error
          ? `erro: ${error}`
          : picker
            ? `digite para filtrar ${dot} ${arrows} escolher ${dot} Enter aplicar ${dot} Esc cancelar`
            : `j/k ${arrows} mover ${dot} PgUp/PgDn página ${dot} g/G início/fim ${dot} / filtrar branch ${dot} q sair`}
      </Text>
    </Box>
  );
}
