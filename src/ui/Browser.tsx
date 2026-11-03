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
import type {CopyMethod} from '../clipboard.js';
import type {ChangesActions} from '../git/changes.js';
import type {ChangeSource} from '../git/watch.js';
import {canSkip, type Operation, type OperationActions} from '../git/operation.js';
import {OperationStoppedError, type HistoryActions} from '../git/history.js';
import type {RefActions} from '../git/refsEdit.js';
import {StashConflictError, type StashOp} from '../git/stash.js';
import {localBranchTips, type RefInfo} from '../git/refs.js';
import {needsConnector} from '../graph/glyphs.js';
import type {Commit, GraphRow} from '../graph/types.js';
import {BranchPicker} from './BranchPicker.js';
import {CheckoutPrompt} from './CheckoutPrompt.js';
import {ConfirmPrompt} from './ConfirmPrompt.js';
import {ConflictPrompt} from './ConflictPrompt.js';
import {CommitDetail, DETAIL_LINES} from './CommitDetail.js';
import {CommitView} from './CommitView.js';
import {separator, tint, useDisplay} from './display.js';
import {headLabel} from './format.js';
import {GraphRowView} from './GraphRowView.js';
import {MergePrompt} from './MergePrompt.js';
import {followCommit} from './follow.js';
import {OperationPrompt, operationOptions, type OperationChoice} from './OperationPrompt.js';
import {ResetPrompt} from './ResetPrompt.js';
import {RefManager} from './RefManager.js';
import {refTargets, type RefMode} from './refTargets.js';
import {SearchPrompt} from './SearchPrompt.js';
import {findMatches, firstFrom, nextMatch} from './search.js';
import {branchNames, chosenRevs, pickerOptions, toggleBranch} from './picker.js';
import type {MouseEvent, MouseSource} from './mouse.js';
import {useDoubleClick} from './useDoubleClick.js';
import {clamp, itemAt, scrollIntoView, visibleEnd} from './viewport.js';

export interface GraphData {
  rows: GraphRow[];
  refs: RefInfo;
}

/** Loads the graph of the given branches (empty = all), with at most `limit` commits. */
export type LoadGraph = (revs: string[], limit: number) => Promise<GraphData>;

interface Props {
  initial: GraphData;
  initialLimit: number;
  /** Branches filtering the list at the start (from the command line); empty = all. */
  initialRevs?: string[];
  /** Labels of the active log filters (--author, --since...), shown in the header. */
  filters?: string[];
  /** Teto de commits (--max-count): sem ele, a lista cresce sob demanda. */
  maxCommits?: number;
  load: LoadGraph;
  /** Switches the repository to the target; rejects with git's message on failure. */
  checkout: (target: CheckoutTarget) => Promise<void>;
  /** Git operations around a merge, injected like `load`. */
  merge: MergeActions;
  /** Files and diffs of a commit, for the full-screen commit view. */
  changes: ChangesActions;
  /** Clicks and wheel events; without it the list only answers to the keyboard. */
  mouse?: MouseSource;
  /** Fires when the repository changed outside the TUI (--watch); reloads the graph. */
  watch?: ChangeSource;
  /** Puts text on the clipboard (key y); without it the hash is only shown. */
  copy?: (text: string) => Promise<CopyMethod>;
  /** Fetches the remotes (key f); rejects with a one-line reason. */
  fetch?: () => Promise<void>;
  /** Applies, pops or drops the stash whose commit has this hash; resolves to the stash name. */
  stash?: (op: StashOp, hash: string) => Promise<string>;
  /** Creates, renames and deletes branches and tags (keys b, t, T, R, D). */
  refEdit?: RefActions;
  /** Abort, continue or skip a stopped cherry-pick, revert or rebase. */
  operation?: OperationActions;
  /** Cherry-pick, revert and reset of the selected commit (keys C, v, X). */
  history?: HistoryActions;
}

// Cabeçalho, separador, rodapé e uma linha de folga: se a saída ocupar todas as
// linhas do terminal, o Ink limpa a tela a cada render.
const CHROME_LINES = 4;
// Faltando tantos commits para o fim, busca mais histórico.
const LOAD_AHEAD = 20;
// The list starts below the header line.
const LIST_TOP = 1;
// Commits moved per wheel notch.
const WHEEL_STEP = 3;

// Git errors span several lines; the footer has one.
const oneLine = (message: string) =>
  message.replace(/\s+/g, ' ').replace(/^(error|fatal): /i, '').trim();

export function Browser({initial, initialLimit, initialRevs = [], filters = [], maxCommits, load, checkout, merge, changes, mouse, watch, copy, fetch, stash, refEdit, operation, history}: Props) {
  const {exit} = useApp();
  const display = useDisplay();
  const dot = separator(display);
  const {columns, rows: terminalRows} = useWindowSize();
  const [data, setData] = useState(initial);
  const [revs, setRevs] = useState<string[]>(initialRevs);
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
  const [viewing, setViewing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [refMode, setRefMode] = useState<RefMode | null>(null);
  // Cherry-pick and revert ask first; reset has its own prompt.
  const [replaying, setReplaying] = useState<{op: 'cherry-pick' | 'revert'; commit: Commit} | null>(null);
  const [resetting, setResetting] = useState(false);
  // A stopped cherry-pick, revert or rebase (a merge has its own, older dialog).
  const [stopped, setStopped] = useState<{op: Operation; files: string[]; index: number} | null>(null);
  // Dropping a stash is the only stash action that asks first: apply and pop keep the changes.
  const [dropping, setDropping] = useState<{hash: string; name: string} | null>(null);
  // Active search (highlight, n/N); `typing` is set while the input is open.
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState<{origin: number; previous: string} | null>(null);
  const request = useRef(0);
  const isDoubleClick = useDoubleClick();

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
  const matches = useMemo(() => findMatches(data.rows, query), [data.rows, query]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const listHeight = Math.max(3, terminalRows - DETAIL_LINES - CHROME_LINES);
  // Recalculado a cada render: o redimensionamento do terminal não esconde o cursor.
  const offset = scrollIntoView(heights, cursor.offset, cursor.selected, listHeight);
  const end = visibleEnd(heights, offset, listHeight);
  const pageSize = Math.max(1, end - offset);

  // What the cursor pointed at when a reload was asked for, to find the same commit again.
  const latest = useRef({rows: initial.rows, selected: 0});
  latest.current = {rows: data.rows, selected: cursor.selected};

  const reload = useCallback(
    (nextRevs: string[], nextLimit: number, resetCursor: boolean, after?: {follow?: boolean; notice?: string}) => {
      const id = ++request.current;
      setLoading(true);
      setError(null);
      load(nextRevs, nextLimit)
        .then(next => {
          if (id !== request.current) return;
          const {rows: before, selected} = latest.current;
          setData(next);
          if (resetCursor) setCursor({selected: 0, offset: 0});
          // The commit under the cursor may have moved (new commits above it) or vanished.
          else if (after?.follow) setCursor(c => ({...c, selected: followCommit(before, selected, next.rows)}));
          if (after?.notice) setNotice(after.notice);
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
  // The uncommitted-changes node is not a commit: nothing to open, check out, merge or copy.
  const notACommit = (what: string) =>
    commit?.uncommitted ? (setNotice(`as alterações não commitadas não são um commit: ${what}`), true) : false;
  const openCommit = () => {
    if (!commit || notACommit('não há o que abrir (use git status e git diff)')) return;
    setViewing(true);
  };
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

  /** Opens the dialog for the operation the repository is stopped in. */
  const manageOperation = (op: Operation) => {
    if (!operation) return setNotice(`${op} em andamento: resolva no terminal`);
    operation
      .conflicts()
      .then(files => setStopped({op, files, index: 0}))
      .catch(e => setError(failure(e)));
  };

  const runOperation = (op: Operation, choice: OperationChoice) => {
    setStopped(null);
    if (choice === 'leave' || !operation) {
      setNotice(`${op} deixado em andamento: resolva no terminal ou aperte m para voltar aqui`);
      return;
    }
    const done = {abort: 'abortado', proceed: 'continuado', skip: 'passo pulado'}[choice];
    setLoading(true);
    setError(null);
    operation[choice === 'proceed' ? 'proceed' : choice](op)
      .then(() => reload(revs, limit, false, {follow: true, notice: `${op} ${done}`}))
      .catch(e => {
        // The state may have changed even so (a later step stopped on new conflicts): refresh it.
        reload(revs, limit, false);
        setError(failure(e));
      });
  };

  const runReplay = (op: 'cherry-pick' | 'revert', target: Commit) => {
    if (!history) return;
    setReplaying(null);
    setLoading(true);
    setError(null);
    const mainline = target.parents.length > 1;
    (op === 'cherry-pick' ? history.cherryPick : history.revert)(target.hash, mainline)
      .then(() =>
        reload(revs, limit, false, {
          follow: true,
          notice: op === 'cherry-pick' ? `cherry-pick de ${target.hash.slice(0, 7)} aplicado` : `${target.hash.slice(0, 7)} revertido`,
        }),
      )
      .catch(e => {
        if (e instanceof OperationStoppedError) {
          // Stopped halfway: refresh so the header says so, then ask what to do.
          reload(revs, limit, false);
          setStopped({op: e.operation, files: e.files, index: 0});
        } else {
          setLoading(false);
          setError(failure(e));
        }
      });
  };

  const stashName = (hash: string) => refsOf(hash).find(r => r.kind === 'stash')?.name ?? 'o stash';

  const runStash = (op: StashOp, hash: string) => {
    if (!stash) return;
    setDropping(null);
    setLoading(true);
    setError(null);
    stash(op, hash)
      .then(name => {
        const done = {apply: `${name} aplicado (continua guardado)`, pop: `${name} aplicado e removido`, drop: `${name} apagado`}[op];
        // The changes are in the working tree (or the stash is gone): the graph changes either way.
        reload(revs, limit, false, {follow: true, notice: done});
      })
      .catch(e => {
        if (e instanceof StashConflictError) {
          const listed = e.files.slice(0, 3).join(', ') + (e.files.length > 3 ? ` +${e.files.length - 3}` : '');
          reload(revs, limit, false, {
            follow: true,
            notice: `${e.name}: conflitos em ${listed}; resolva no terminal (stash mantido)`,
          });
        } else {
          setLoading(false);
          setError(failure(e));
        }
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

  // Always the latest closure, so the subscription below is made only once.
  const onMouse = useRef<(event: MouseEvent) => void>(() => {});
  onMouse.current = event => {
    // Only the list answers to the mouse; dialogs and the commit view use the keyboard.
    if (viewing || prompt || mergePrompt || conflict || picker || typing || dropping || refMode || stopped || replaying || resetting) return;
    if (event.type === 'click') {
      const index = itemAt(heights, offset, event.row - LIST_TOP, listHeight);
      if (index === null) return;
      if (notice) setNotice(null);
      select(index);
      if (isDoubleClick(index)) openCommit();
    } else {
      select(cursor.selected + (event.type === 'wheelUp' ? -WHEEL_STEP : WHEEL_STEP));
    }
  };
  useEffect(() => mouse?.subscribe(event => onMouse.current(event)), [mouse]);

  // Same latest-closure trick: the subscription must not be remade on every render.
  const refresh = useRef<(notice: string) => void>(() => {});
  refresh.current = notice => reload(revs, limit, false, {follow: true, notice});
  useEffect(() => watch?.subscribe(() => refresh.current('atualizado (o repositório mudou)')), [watch]);

  useInput((input, key) => {
    // The commit view has its own keys.
    if (viewing) return;

    // The ref manager handles its own keys.
    if (refMode) return;

    if (replaying) {
      if (key.escape || input === 'n') setReplaying(null);
      else if (key.return || input === 'y') runReplay(replaying.op, replaying.commit);
      return;
    }

    // The reset prompt handles its own keys.
    if (resetting) return;

    if (stopped) {
      const options = operationOptions(stopped.op);
      const picked = options.find(o => o.key === input);
      if (key.escape) runOperation(stopped.op, 'leave');
      else if (picked) runOperation(stopped.op, picked.choice);
      else if (key.return) runOperation(stopped.op, options[stopped.index]?.choice ?? 'leave');
      else if (key.upArrow) setStopped({...stopped, index: clamp(stopped.index - 1, 0, options.length - 1)});
      else if (key.downArrow) setStopped({...stopped, index: clamp(stopped.index + 1, 0, options.length - 1)});
      return;
    }

    if (dropping) {
      if (key.escape || input === 'n') setDropping(null);
      else if (key.return || input === 'y') runStash('drop', dropping.hash);
      return;
    }

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

    if (typing) {
      // Each keystroke searches again and jumps to the first match from where the search began.
      const update = (next: string) => {
        setQuery(next);
        select(firstFrom(findMatches(data.rows, next), typing.origin) ?? typing.origin);
      };
      if (key.escape) {
        setQuery(typing.previous);
        setTyping(null);
        select(typing.origin);
      } else if (key.return) {
        setTyping(null);
        if (query.trim() !== '' && matches.length === 0) {
          setNotice(`nenhum commit encontrado para "${query.trim()}"`);
          setQuery('');
        }
      } else if (key.backspace || key.delete) {
        update(query.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        update(query + input);
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
    else if (key.return || input === 'd') openCommit();
    else if (input === 'y' && commit && !notACommit('não há hash')) {
      const hash = commit.hash;
      if (!copy) setNotice(`hash: ${hash}`);
      else {
        copy(hash)
          .then(method =>
            // OSC 52 gets no reply: show the whole hash so it can be taken by hand if nothing was pasted.
            setNotice(method === 'native' ? `hash copiado: ${hash.slice(0, 7)}` : `hash enviado ao terminal (OSC 52): ${hash}`),
          )
          .catch(() => setNotice(`não foi possível copiar; hash: ${hash}`));
      }
    }
    else if (input === 'f') {
      if (!fetch) setNotice('fetch indisponível');
      else if (fetching) setNotice('já estou buscando as remotas');
      else {
        setFetching(true);
        fetch()
          .then(() => {
            setFetching(false);
            reload(revs, limit, false, {follow: true, notice: 'remotas atualizadas'});
          })
          // After reload() would clear it; here nothing reloads, so set it directly.
          .catch(e => {
            setFetching(false);
            setError(failure(e));
          });
      }
    }
    else if (input === 'a' || input === 'p' || input === 'x') {
      if (!commit?.stash) setNotice('esta tecla só vale em um stash (a aplica, p dá pop, x apaga)');
      else if (!stash) setNotice('operações de stash indisponíveis');
      else if (loading) setNotice('espere a carga terminar');
      else if (input === 'x') setDropping({hash: commit.hash, name: stashName(commit.hash)});
      else runStash(input === 'a' ? 'apply' : 'pop', commit.hash);
    }
    else if (input === 'b' || input === 't' || input === 'T' || input === 'R' || input === 'D') {
      const mode: RefMode = {b: 'branch', t: 'tag', T: 'annotated', R: 'rename', D: 'delete'}[input] as RefMode;
      if (!commit || notACommit('não dá para criar nem editar refs nele')) return;
      if (commit.stash) setNotice('um stash não é um commit da história: não dá para criar nem editar refs nele');
      else if (!refEdit) setNotice('edição de branches e tags indisponível');
      else if (loading) setNotice('espere a carga terminar');
      else if ((mode === 'rename' || mode === 'delete') && refTargets(refsOf(commit.hash), mode, data.refs.head.branch).length === 0) {
        setNotice(
          mode === 'delete' && refsOf(commit.hash).some(r => r.kind === 'branch' && r.name === data.refs.head.branch)
            ? 'não dá para apagar a branch atual: troque de branch antes (c)'
            : 'nenhuma branch local nem tag neste commit',
        );
      } else {
        setError(null);
        setRefMode(mode);
      }
    }
    else if (input === 'C' || input === 'v' || input === 'X') {
      const head = data.refs.head;
      if (!commit || notACommit('não dá para aplicar, reverter nem resetar')) return;
      if (commit.stash) setNotice('um stash não é um commit da história: use a, p ou x');
      else if (!history) setNotice('cherry-pick, revert e reset indisponíveis');
      else if (loading) setNotice('espere a carga terminar');
      else if (head.operation) setNotice(`${head.operation} em andamento: aperte m para continuar, pular ou abortar`);
      else if (!head.hash) setNotice('o repositório ainda não tem commits');
      else if (input === 'X' && commit.hash === head.hash) setNotice('o HEAD já está nesse commit');
      else if (input === 'C' && commit.hash === head.hash) setNotice('esse commit já é o HEAD');
      else {
        setError(null);
        if (input === 'X') setResetting(true);
        else setReplaying({op: input === 'C' ? 'cherry-pick' : 'revert', commit});
      }
    }
    else if (input === 'r') refresh.current('atualizado');
    else if (input === 's') {
      setTyping({origin: cursor.selected, previous: query});
      setQuery('');
    }
    else if (input === 'n' || input === 'N') {
      const found = nextMatch(matches, cursor.selected, input === 'n' ? 1 : -1);
      if (found !== null) select(found);
      else setNotice(query === '' ? 'nenhuma busca: aperte s para buscar' : 'nenhum resultado na busca');
    }
    else if (input === '/') setPicker({query: '', index: 0, selected: revs});
    else if (input === 'm' && !loading) {
      const head = data.refs.head;
      if (head.operation && head.operation !== 'merge') manageOperation(head.operation);
      else if (head.merging) manageMerge();
      else if (!commit || notACommit('não há o que mesclar')) return;
      else if (commit.stash) setNotice('um stash não pode ser mesclado');
      else if (head.branch === null) setNotice('HEAD destacado: troque para uma branch antes do merge');
      else if (commit.hash === head.hash) setNotice('esse já é o commit da branch atual');
      else {
        setError(null);
        setMergePrompt({targets: mergeTargets(commit.hash, refsOf(commit.hash), head.branch), index: 0});
      }
    }
    else if (input === 'c' && notACommit('não há o que fazer checkout')) return;
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
    else if (key.escape) {
      setError(null);
      setQuery('');
    }
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
      : replaying
        ? confirmHint(1)
      : resetting
        ? `Esc cancela`
      : stopped
        ? `a aborta ${dot} c continua${canSkip(stopped.op) ? ` ${dot} s pula` : ''} ${dot} d/Esc deixa ${dot} ${arrows}/Enter escolhe`
      : refMode
        ? `Esc cancela`
      : dropping
        ? confirmHint(1)
      : conflict
        ? `a aborta ${dot} d/Esc deixa em andamento ${dot} ${arrows}/Enter escolhe`
        : typing
          ? `digite para buscar ${dot} Enter confirma ${dot} Esc cancela`
        : picker
          ? `digite filtra ${dot} ${arrows} escolhe ${dot} Espaço marca ${dot} Enter aplica ${dot} Esc cancela`
          : (notice ??
            `${query === '' ? '' : `n/N próximo/anterior ${dot} Esc limpa a busca ${dot} `}j/k ${arrows} mover ${dot} Enter abre ${dot} r atualiza ${dot} s busca ${dot} c checkout ${dot} m merge ${dot} / branch ${dot} q sair`);

  if (viewing && commit) {
    return (
      <CommitView
        commit={commit}
        refs={refsOf(commit.hash)}
        head={headOf(commit.hash)}
        changes={changes}
        mouse={mouse}
        onClose={() => setViewing(false)}
      />
    );
  }

  return (
    <Box flexDirection="column" height={terminalRows - 1}>
      <Text wrap="truncate-end">
        <Text bold>gitgraph</Text>
        <Text dimColor>{` ${dot} atual: `}</Text>
        <Text bold color={tint(display, data.refs.head.operation || data.refs.head.merging ? 'yellow' : 'cyan')}>
          {headLabel(data.refs.head, {ascii: display.ascii})}
        </Text>
        {query !== '' && (
          <Text bold color={tint(display, 'yellow')}>
            {` ${dot} busca "${query.trim()}" ${matchSet.has(cursor.selected) ? matches.indexOf(cursor.selected) + 1 : '-'}/${matches.length}${more ? '+' : ''}`}
          </Text>
        )}
        {filters.length > 0 && (
          <Text bold color={tint(display, 'magenta')}>
            {` ${dot} ${filters.join(', ')}`}
          </Text>
        )}
        <Text dimColor>
          {` ${dot} ${filterLabel} ${dot} ${total === 0 ? 0 : cursor.selected + 1}/${total}${more ? '+' : ''}${loading ? ` ${dot} carregando${display.ascii ? '...' : '…'}` : ''}${fetching ? ` ${dot} buscando remotas${display.ascii ? '...' : '…'}` : ''}`}
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
            matched={matchSet.has(offset + i)}
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
      ) : replaying ? (
        <ConfirmPrompt
          title={
            replaying.op === 'cherry-pick'
              ? `Cherry-pick de ${replaying.commit.hash.slice(0, 7)} em ${data.refs.head.branch ?? 'HEAD destacado'}?`
              : `Reverter ${replaying.commit.hash.slice(0, 7)}?`
          }
          lines={[
            replaying.commit.subject,
            replaying.commit.parents.length > 1
              ? 'Commit de merge: aplicado em relação ao 1º pai (git ... -m 1).'
              : replaying.op === 'cherry-pick'
                ? 'Cria um commit novo com as mesmas mudanças, com a mensagem original.'
                : 'Cria um commit novo que desfaz as mudanças dele, com a mensagem do git.',
            'Se houver conflitos, você escolhe entre abortar, continuar ou pular.',
          ]}
        />
      ) : resetting && history && commit ? (
        <ResetPrompt
          target={commit}
          branch={data.refs.head.branch}
          actions={history}
          onCancel={() => setResetting(false)}
          onDone={done => {
            setResetting(false);
            reload(revs, limit, false, {follow: true, notice: done});
          }}
        />
      ) : stopped ? (
        <OperationPrompt operation={stopped.op} files={stopped.files} index={stopped.index} />
      ) : refMode && refEdit && commit ? (
        <RefManager
          mode={refMode}
          commit={commit}
          refs={refsOf(commit.hash)}
          currentBranch={data.refs.head.branch}
          actions={refEdit}
          onCancel={() => setRefMode(null)}
          onDone={done => {
            setRefMode(null);
            reload(revs, limit, false, {follow: true, notice: done});
          }}
        />
      ) : dropping ? (
        <ConfirmPrompt
          danger
          title={`Apagar ${dropping.name}?`}
          lines={[
            'As alterações guardadas serão perdidas: o git não as devolve depois do drop.',
            'Para mantê-las, aplique (a) antes ou use o pop (p), que aplica e apaga.',
          ]}
        />
      ) : conflict ? (
        <ConflictPrompt files={conflict.files} index={conflict.index} />
      ) : typing ? (
        <SearchPrompt query={query} count={matches.length} more={more} />
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
