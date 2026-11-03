import React, {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {HistoryActions, ResetMode, ResetPreview} from '../git/history.js';
import type {Commit} from '../graph/types.js';
import {DETAIL_LINES} from './CommitDetail.js';
import {arrows, ellipsis, separator, tint, useDisplay} from './display.js';
import {clamp} from './viewport.js';

interface Props {
  /** The commit the branch would be moved to. */
  target: Commit;
  /** Current branch, or null when HEAD is detached. */
  branch: string | null;
  actions: HistoryActions;
  onDone: (notice: string) => void;
  onCancel: () => void;
}

const MODES: ResetMode[] = ['soft', 'mixed', 'hard'];

type Step =
  | {type: 'mode'; index: number}
  | {type: 'confirm'; mode: 'soft' | 'mixed'}
  // --hard throws work away: the name of the branch has to be typed.
  | {type: 'force'; value: string};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const oneLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').replace(/^(error|fatal): /i, '').trim();

/** Moves the current branch to a commit: soft, mixed or hard. Takes the place of the details panel and handles its own keys. */
export function ResetPrompt({target, branch, actions, onDone, onCancel}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  const short = target.hash.slice(0, 7);
  const where = branch ?? 'HEAD';
  // What must be typed for --hard. A detached HEAD has no name to type.
  const word = branch ?? 'descartar';
  const [step, setStep] = useState<Step>({type: 'mode', index: 0});
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    // The preview only informs: without it the choice is still possible.
    actions
      .resetPreview(target.hash)
      .then(result => current && setPreview(result))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [actions, target.hash]);

  const run = (mode: ResetMode) => {
    setBusy(true);
    setError(null);
    actions
      .reset(mode, target.hash)
      .then(() => onDone(`reset --${mode}: ${where} agora em ${short}`))
      .catch(e => {
        setBusy(false);
        setError(oneLine(e));
      });
  };

  useInput((input, key) => {
    if (busy) return;
    if (key.escape) return onCancel();
    if (step.type === 'mode') {
      if (key.upArrow || input === 'k') setStep({type: 'mode', index: clamp(step.index - 1, 0, MODES.length - 1)});
      else if (key.downArrow || input === 'j') setStep({type: 'mode', index: clamp(step.index + 1, 0, MODES.length - 1)});
      else if (key.return) {
        const mode = MODES[step.index];
        if (mode === 'hard') setStep({type: 'force', value: ''});
        else if (mode) setStep({type: 'confirm', mode});
      }
    } else if (step.type === 'confirm') {
      if (input === 'n') onCancel();
      else if (key.return || input === 'y') run(step.mode);
    } else if (key.backspace || key.delete) {
      setError(null);
      setStep({type: 'force', value: step.value.slice(0, -1)});
    } else if (key.return) {
      if (step.value !== word) setError(`digite exatamente ${word} para confirmar`);
      else run('hard');
    } else if (input && !key.ctrl && !key.meta && !key.tab) {
      setError(null);
      setStep({type: 'force', value: step.value + input});
    }
  });

  const effect = preview
    ? preview.ahead === 0
      ? 'nenhum commit sai da branch'
      : `${plural(preview.ahead, 'commit sai', 'commits saem')} da branch` +
        (preview.orphaned > 0 ? `, ${preview.orphaned} só no reflog` : '')
    : `calculando${ellipsis(display)}`;
  const discarded = preview ? plural(preview.changed, 'arquivo modificado', 'arquivos modificados') : ellipsis(display);
  const problem = error && (
    <Text wrap="truncate-end" color={tint(display, 'red')}>
      {error}
    </Text>
  );

  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      {step.type === 'mode' && (
        <>
          <Text bold wrap="truncate-end">{`Reset de ${where} para ${short}: ${effect}`}</Text>
          {[
            ['soft', 'mantém o índice e os arquivos; só move a branch'],
            ['mixed', 'mantém os arquivos e desfaz o stage'],
            ['hard', `descarta os arquivos modificados (${discarded}); pede o nome da branch`],
          ].map(([mode, text], i) => (
            <Text key={mode} wrap="truncate-end" inverse={i === step.index}>
              {`${i === step.index ? '>' : ' '} --${mode?.padEnd(5)} ${text}`}
            </Text>
          ))}
          {problem || <Text dimColor>{`${arrows(display)} escolhe ${dot} Enter segue ${dot} Esc cancela`}</Text>}
        </>
      )}
      {step.type === 'confirm' && (
        <>
          <Text bold wrap="truncate-end">{`git reset --${step.mode} ${short}?`}</Text>
          <Text dimColor wrap="truncate-end">{`${where} passa a apontar para ${short} (${target.subject}); ${effect}.`}</Text>
          <Text dimColor wrap="truncate-end">
            {step.mode === 'soft' ? 'O que estava nesses commits vira alterações em stage.' : 'O que estava nesses commits vira alterações fora do stage.'}
          </Text>
          {problem || <Text> </Text>}
          <Text dimColor>{`Enter/y confirma ${dot} Esc/n cancela`}</Text>
        </>
      )}
      {step.type === 'force' && (
        <>
          <Text bold wrap="truncate-end" color={tint(display, 'red')}>
            {`reset --hard perde ${discarded} e ${effect}`}
          </Text>
          <Text dimColor wrap="truncate-end">
            {`Nada disso volta pelo git, salvo os commits via reflog. Digite ${word} para confirmar:`}
          </Text>
          <Text wrap="truncate-end">
            <Text bold>{'> '}</Text>
            {step.value}
            <Text inverse> </Text>
            {busy && <Text dimColor>{`  aguarde${ellipsis(display)}`}</Text>}
          </Text>
          {problem || <Text> </Text>}
          <Text dimColor>{`Enter confirma ${dot} Esc cancela`}</Text>
        </>
      )}
    </Box>
  );
}
