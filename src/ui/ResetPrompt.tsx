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
  const word = branch ?? 'discard';
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
      .then(() => onDone(`reset --${mode}: ${where} now at ${short}`))
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
      if (step.value !== word) setError(`type exactly ${word} to confirm`);
      else run('hard');
    } else if (input && !key.ctrl && !key.meta && !key.tab) {
      setError(null);
      setStep({type: 'force', value: step.value + input});
    }
  });

  const effect = preview
    ? preview.ahead === 0
      ? 'no commit leaves the branch'
      : `${plural(preview.ahead, 'commit leaves', 'commits leave')} the branch` +
        (preview.orphaned > 0 ? `, ${preview.orphaned} only in the reflog` : '')
    : `calculating${ellipsis(display)}`;
  const discarded = preview ? plural(preview.changed, 'modified file', 'modified files') : ellipsis(display);
  const problem = error && (
    <Text wrap="truncate-end" color={tint(display, 'red')}>
      {error}
    </Text>
  );

  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      {step.type === 'mode' && (
        <>
          <Text bold wrap="truncate-end">{`Reset ${where} to ${short}: ${effect}`}</Text>
          {[
            ['soft', 'keeps the index and the files; only moves the branch'],
            ['mixed', 'keeps the files and unstages the changes'],
            ['hard', `discards the modified files (${discarded}); asks for the branch name`],
          ].map(([mode, text], i) => (
            <Text key={mode} wrap="truncate-end" inverse={i === step.index}>
              {`${i === step.index ? '>' : ' '} --${mode?.padEnd(5)} ${text}`}
            </Text>
          ))}
          {problem || <Text dimColor>{`${arrows(display)} chooses ${dot} Enter continues ${dot} Esc cancels`}</Text>}
        </>
      )}
      {step.type === 'confirm' && (
        <>
          <Text bold wrap="truncate-end">{`git reset --${step.mode} ${short}?`}</Text>
          <Text dimColor wrap="truncate-end">{`${where} will point at ${short} (${target.subject}); ${effect}.`}</Text>
          <Text dimColor wrap="truncate-end">
            {step.mode === 'soft' ? 'What was in those commits becomes staged changes.' : 'What was in those commits becomes unstaged changes.'}
          </Text>
          {problem || <Text> </Text>}
          <Text dimColor>{`Enter/y confirms ${dot} Esc/n cancels`}</Text>
        </>
      )}
      {step.type === 'force' && (
        <>
          <Text bold wrap="truncate-end" color={tint(display, 'red')}>
            {`reset --hard loses ${discarded} and ${effect}`}
          </Text>
          <Text dimColor wrap="truncate-end">
            {`None of this comes back through git, except the commits via the reflog. Type ${word} to confirm:`}
          </Text>
          <Text wrap="truncate-end">
            <Text bold>{'> '}</Text>
            {step.value}
            <Text inverse> </Text>
            {busy && <Text dimColor>{`  wait${ellipsis(display)}`}</Text>}
          </Text>
          {problem || <Text> </Text>}
          <Text dimColor>{`Enter confirms ${dot} Esc cancels`}</Text>
        </>
      )}
    </Box>
  );
}
