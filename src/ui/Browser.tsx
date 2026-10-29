import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {
  checkoutTargets,
  describeTarget,
  isCurrent,
  PartialCheckoutError,
  type CheckoutTarget,
} from '../git/checkout.js';
import {localBranchTips, type RefInfo} from '../git/refs.js';
import {needsConnector} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {BranchPicker} from './BranchPicker.js';
import {CheckoutPrompt} from './CheckoutPrompt.js';
import {CommitDetail, DETAIL_LINES} from './CommitDetail.js';
import {separator, tint, useDisplay} from './display.js';
import {GraphRowView} from './GraphRowView.js';
import {branchNames, chosenRevs, pickerOptions, toggleBranch} from './picker.js';
import {clamp, scrollIntoView, visibleEnd} from './viewport.js';

export interface GraphData {
  rows: GraphRow[];
  refs: RefInfo;
}

/** Loads the graph of the given branches (empty = all), with at most `limit` commits. */
export type LoadGraph = (revs: string[], limit: number) => Promise<GraphData>;

interface Props {
  initial: GraphData;
  initialLimit: number;
  /** Teto de commits (--max-count): sem ele, a lista cresce sob demanda. */
  maxCommits?: number;
  load: LoadGraph;
  /** Switches the repository to the target; rejects with git's message on failure. */
  checkout: (target: CheckoutTarget) => Promise<void>;
}

// Cabeçalho, separador, rodapé e uma linha de folga: se a saída ocupar todas as
// linhas do terminal, o Ink limpa a tela a cada render.
const CHROME_LINES = 4;
// Faltando tantos commits para o fim, busca mais histórico.
const LOAD_AHEAD = 20;

// Git errors span several lines; the footer has one.
const oneLine = (message: string) =>
  message.replace(/\s+/g, ' ').replace(/^(error|fatal): /i, '').trim();

export function Browser({initial, initialLimit, maxCommits, load, checkout}: Props) {
  const {exit} = useApp();
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const [data, setData] = useState(initial);
  const [revs, setRevs] = useState<string[]>([]);
  const [limit, setLimit] = useState(initialLimit);
  const [cursor, setCursor] = useState({selected: 0, offset: 0});
  const [picker, setPicker] = useState<{query: string; index: number; selected: string[]} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{targets: CheckoutTarget[]; index: number} | null>(null);
  const request = useRef(0);

  const branches = useMemo(() => branchNames(data.refs), [data.refs]);
  const tips = useMemo(() => localBranchTips(data.refs.byCommit), [data.refs]);
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
    (nextRevs: string[], nextLimit: number, resetCursor: boolean) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      load(nextRevs, nextLimit)
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
      reload(revs, next, false);
    }
  }, [loading, error, canGrow, total, limit, maxCommits, cursor.selected, revs, reload]);

  const select = (index: number) =>
    setCursor({
      selected: clamp(index, 0, Math.max(0, total - 1)),
      offset,
    });

  const commit = data.rows[cursor.selected]?.commit;
  const refsOf = (hash: string) => data.refs.byCommit.get(hash) ?? [];

  const runCheckout = (target: CheckoutTarget) => {
    setPrompt(null);
    if (isCurrent(target, data.refs.head)) {
      setNotice(`já está em ${describeTarget(target)}`);
      return;
    }
    setLoading(true);
    setError(null);
    checkout(target)
      .then(() => {
        setNotice(`agora em ${describeTarget(target)}`);
        // Refreshes refs so the HEAD marker moves; the cursor stays where it is.
        reload(revs, limit, false);
      })
      .catch(e => {
        const message = oneLine(e instanceof Error ? e.message : String(e));
        // The switch happened and only the pull failed: refresh so HEAD is right.
        if (e instanceof PartialCheckoutError) reload(revs, limit, false);
        else setLoading(false);
        // After reload(), which clears the error when it starts.
        setError(message);
      });
  };

  useInput((input, key) => {
    if (prompt) {
      const single = prompt.targets.length === 1;
      const last = prompt.targets.length - 1;
      if (key.escape || (single && input === 'n')) {
        setPrompt(null);
      } else if (key.return || (single && input === 'y')) {
        const target = prompt.targets[prompt.index];
        if (target) runCheckout(target);
      } else if (key.upArrow) {
        setPrompt({...prompt, index: clamp(prompt.index - 1, 0, last)});
      } else if (key.downArrow) {
        setPrompt({...prompt, index: clamp(prompt.index + 1, 0, last)});
      }
      return;
    }

    if (picker) {
      const options = pickerOptions(branches, picker.query);
      if (key.escape) {
        setPicker(null);
      } else if (key.return) {
        const next = chosenRevs(picker.selected, branches, options[picker.index]);
        setPicker(null);
        if (next) {
          setRevs(next);
          setLimit(initialLimit);
          reload(next, initialLimit, true);
        }
      } else if (input === ' ') {
        // Branch names have no spaces, so Space is free to toggle the selection.
        const option = options[picker.index];
        if (option) {
          setPicker({
            ...picker,
            selected: option.rev === null ? [] : toggleBranch(picker.selected, option.rev),
          });
        }
      } else if (key.upArrow) {
        setPicker({...picker, index: clamp(picker.index - 1, 0, options.length - 1)});
      } else if (key.downArrow) {
        setPicker({...picker, index: clamp(picker.index + 1, 0, options.length - 1)});
      } else if (key.backspace || key.delete) {
        setPicker({...picker, query: picker.query.slice(0, -1), index: 0});
      } else if (input && !key.ctrl && !key.meta) {
        setPicker({...picker, query: picker.query + input, index: 0});
      }
      return;
    }

    if (notice) setNotice(null);
    if (input === 'q') exit();
    else if (key.downArrow || input === 'j') select(cursor.selected + 1);
    else if (key.upArrow || input === 'k') select(cursor.selected - 1);
    else if (key.pageDown) select(cursor.selected + pageSize);
    else if (key.pageUp) select(cursor.selected - pageSize);
    else if (key.home || input === 'g') select(0);
    else if (key.end || input === 'G') select(total - 1);
    else if (input === '/') setPicker({query: '', index: 0, selected: revs});
    else if (input === 'c' && commit && !loading) {
      const targets = checkoutTargets(commit.hash, refsOf(commit.hash), tips);
      const only = targets.length === 1 ? targets[0] : undefined;
      if (only && isCurrent(only, data.refs.head)) {
        setNotice(`já está em ${describeTarget(only)}`);
      } else {
        setError(null);
        // With several branches, start on the first one that is not the current.
        const index = Math.max(0, targets.findIndex(t => !isCurrent(t, data.refs.head)));
        setPrompt({targets, index});
      }
    }
    else if (key.escape) setError(null);
  });

  const headOf = (hash: string) => ({
    isHead: data.refs.head.hash === hash,
    branch: data.refs.head.branch,
  });
  const arrows = display.ascii ? 'Up/Down' : '↑/↓';
  const filterLabel =
    revs.length === 0
      ? 'todas as branches'
      : revs.length <= 2
        ? revs.join(', ')
        : `${revs.slice(0, 2).join(', ')} +${revs.length - 2}`;
  const more = canGrow && total >= limit;

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text bold>gitgraph</Text>
        <Text dimColor>
          {` ${dot} ${filterLabel} ${dot} ${total === 0 ? 0 : cursor.selected + 1}/${total}${more ? '+' : ''}${loading ? ` ${dot} carregando${display.ascii ? '...' : '…'}` : ''}`}
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
      {prompt ? (
        <CheckoutPrompt targets={prompt.targets} index={prompt.index} head={data.refs.head} />
      ) : picker ? (
        <BranchPicker
          query={picker.query}
          options={pickerOptions(branches, picker.query)}
          index={picker.index}
          selected={picker.selected}
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
          : prompt
            ? prompt.targets.length === 1
              ? `Enter/y confirma ${dot} Esc/n cancela`
              : `${arrows} escolher ${dot} Enter confirma ${dot} Esc cancela`
            : picker
              ? `digite filtra ${dot} ${arrows} escolhe ${dot} Espaço marca ${dot} Enter aplica ${dot} Esc cancela`
              : (notice ??
                `j/k ${arrows} mover ${dot} PgUp/PgDn ${dot} g/G início/fim ${dot} c checkout ${dot} / branch ${dot} q sair`)}
      </Text>
    </Box>
  );
}
