import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {
  checkoutTargets,
  describeTarget,
  isCurrent,
  PartialCheckoutError,
  type CheckoutTarget,
} from '../git/checkout.js';
import {
  describeMergeTarget,
  MergeConflictError,
  mergeTargets,
  type MergeActions,
  type MergeResult,
  type MergeTarget,
} from '../git/merge.js';
import {localBranchTips, type RefInfo} from '../git/refs.js';
import {needsConnector} from '../graph/glyphs.js';
import type {GraphRow} from '../graph/types.js';
import {BranchPicker} from './BranchPicker.js';
import {CheckoutPrompt} from './CheckoutPrompt.js';
import {ConflictPrompt} from './ConflictPrompt.js';
import {CommitDetail, DETAIL_LINES} from './CommitDetail.js';
import {separator, tint, useDisplay} from './display.js';
import {headLabel} from './format.js';
import {GraphRowView} from './GraphRowView.js';
import {MergePrompt} from './MergePrompt.js';
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
  /** Git operations around a merge, injected like `load`. */
  merge: MergeActions;
}

// Cabeçalho, separador, rodapé e uma linha de folga: se a saída ocupar todas as
// linhas do terminal, o Ink limpa a tela a cada render.
const CHROME_LINES = 4;
// Faltando tantos commits para o fim, busca mais histórico.
const LOAD_AHEAD = 20;

// Git errors span several lines; the footer has one.
const oneLine = (message: string) =>
  message.replace(/\s+/g, ' ').replace(/^(error|fatal): /i, '').trim();

export function Browser({initial, initialLimit, maxCommits, load, checkout, merge}: Props) {
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
  const [mergePrompt, setMergePrompt] = useState<{targets: MergeTarget[]; index: number} | null>(null);
  // A merge in progress: 0 = abort it, 1 = leave it for the terminal.
  const [conflict, setConflict] = useState<{files: string[]; index: number} | null>(null);
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

  const failure = (e: unknown) => oneLine(e instanceof Error ? e.message : String(e));

  const mergeNotice = (result: MergeResult, target: MergeTarget, branch: string) => {
    const from = describeMergeTarget(target);
    if (result === 'up-to-date') return `${from} já está incluído em ${branch}`;
    return result === 'fast-forward'
      ? `fast-forward: ${branch} avançou até ${from}`
      : `merge de ${from} em ${branch} concluído`;
  };

  const runMerge = (target: MergeTarget) => {
    const branch = data.refs.head.branch ?? '';
    setMergePrompt(null);
    setLoading(true);
    setError(null);
    merge
      .merge(target)
      .then(result => {
        setNotice(mergeNotice(result, target, branch));
        // The result is the newest commit, at the top: select it.
        reload(revs, limit, result !== 'up-to-date');
      })
      .catch(e => {
        if (e instanceof MergeConflictError) {
          // The merge is in progress now: refresh so the header says so, then ask.
          reload(revs, limit, false);
          setConflict({files: e.files, index: 0});
        } else {
          setLoading(false);
          setError(failure(e));
        }
      });
  };

  const abortMerge = () => {
    setConflict(null);
    setLoading(true);
    merge
      .abort()
      .then(() => {
        setNotice('merge abortado');
        reload(revs, limit, false);
      })
      .catch(e => {
        setLoading(false);
        setError(failure(e));
      });
  };

  const leaveMerge = () => {
    setConflict(null);
    setNotice('merge deixado em andamento: resolva no terminal ou aperte m para abortar');
  };

  // A merge is already in progress (started here or elsewhere): same dialog.
  const manageMerge = () => {
    merge.conflicts().then(files => setConflict({files, index: 0})).catch(e => setError(failure(e)));
  };

  useInput((input, key) => {
    if (mergePrompt) {
      const single = mergePrompt.targets.length === 1;
      const last = mergePrompt.targets.length - 1;
      if (key.escape || (single && input === 'n')) {
        setMergePrompt(null);
      } else if (key.return || (single && input === 'y')) {
        const target = mergePrompt.targets[mergePrompt.index];
        if (target) runMerge(target);
      } else if (key.upArrow) {
        setMergePrompt({...mergePrompt, index: clamp(mergePrompt.index - 1, 0, last)});
      } else if (key.downArrow) {
        setMergePrompt({...mergePrompt, index: clamp(mergePrompt.index + 1, 0, last)});
      }
      return;
    }

    if (conflict) {
      if (input === 'a') abortMerge();
      else if (input === 'd' || key.escape) leaveMerge();
      else if (key.return) (conflict.index === 0 ? abortMerge : leaveMerge)();
      else if (key.upArrow) setConflict({...conflict, index: 0});
      else if (key.downArrow) setConflict({...conflict, index: 1});
      return;
    }

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
    else if (input === 'm' && !loading) {
      const head = data.refs.head;
      if (head.merging) manageMerge();
      else if (!commit) return;
      else if (commit.stash) setNotice('um stash não pode ser mesclado');
      else if (head.branch === null) setNotice('HEAD destacado: troque para uma branch antes do merge');
      else if (commit.hash === head.hash) setNotice('esse já é o commit da branch atual');
      else {
        setError(null);
        setMergePrompt({targets: mergeTargets(commit.hash, refsOf(commit.hash), head.branch), index: 0});
      }
    }
    else if (input === 'c' && commit?.stash) setNotice('um stash não pode ser usado em checkout');
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
  const confirmHint = (count: number) =>
    count === 1
      ? `Enter/y confirma ${dot} Esc/n cancela`
      : `${arrows} escolher ${dot} Enter confirma ${dot} Esc cancela`;
  const footerHint = prompt
    ? confirmHint(prompt.targets.length)
    : mergePrompt
      ? confirmHint(mergePrompt.targets.length)
      : conflict
        ? `a aborta ${dot} d/Esc deixa em andamento ${dot} ${arrows}/Enter escolhe`
        : picker
          ? `digite filtra ${dot} ${arrows} escolhe ${dot} Espaço marca ${dot} Enter aplica ${dot} Esc cancela`
          : (notice ??
            `j/k ${arrows} mover ${dot} g/G início/fim ${dot} c checkout ${dot} m merge ${dot} / branch ${dot} q sair`);

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text bold>gitgraph</Text>
        <Text dimColor>{` ${dot} atual: `}</Text>
        <Text bold color={tint(display, data.refs.head.merging ? 'yellow' : 'cyan')}>
          {headLabel(data.refs.head)}
        </Text>
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
      ) : mergePrompt ? (
        <MergePrompt
          targets={mergePrompt.targets}
          index={mergePrompt.index}
          branch={data.refs.head.branch ?? ''}
        />
      ) : conflict ? (
        <ConflictPrompt files={conflict.files} index={conflict.index} />
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
        {error ? `erro: ${error}` : footerHint}
      </Text>
    </Box>
  );
}
