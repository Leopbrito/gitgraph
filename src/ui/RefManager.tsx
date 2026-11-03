import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import type {Commit, Ref} from '../graph/types.js';
import {UnmergedBranchError, type RefActions} from '../git/refsEdit.js';
import {DETAIL_LINES} from './CommitDetail.js';
import {ellipsis, separator, tint, useDisplay} from './display.js';
import {describeTarget, refTargets, type RefMode, type RefTarget} from './refTargets.js';
import {centerWindow, clamp} from './viewport.js';

interface Props {
  mode: RefMode;
  commit: Commit;
  /** Refs on `commit`. */
  refs: Ref[];
  currentBranch: string | null;
  actions: RefActions;
  /** The change was made; the message goes to the footer. */
  onDone: (notice: string) => void;
  onCancel: () => void;
}

type Step =
  | {type: 'choose'; targets: RefTarget[]; index: number}
  | {type: 'name'; target?: RefTarget; value: string}
  | {type: 'message'; name: string; value: string}
  | {type: 'confirm'; target: RefTarget}
  // A branch that is not merged: deleting it loses commits, so the name has to be typed.
  | {type: 'force'; target: RefTarget; lost: number | null; value: string};

const oneLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').replace(/^(error|fatal): /i, '').trim();

/**
 * Create, rename and delete branches and tags on the selected commit. A small
 * state machine (choose the ref → name → confirm → run) that takes the place of
 * the details panel and handles its own keys; the Browser only reloads on `onDone`.
 */
export function RefManager({mode, commit, refs, currentBranch, actions, onDone, onCancel}: Props) {
  const display = useDisplay();
  const dot = separator(display);
  const short = commit.hash.slice(0, 7);
  const [step, setStep] = useState<Step>(() => {
    if (mode === 'rename' || mode === 'delete') {
      const targets = refTargets(refs, mode, currentBranch);
      const only = targets.length === 1 ? targets[0] : undefined;
      if (!only) return {type: 'choose', targets, index: 0};
      return mode === 'rename' ? {type: 'name', target: only, value: only.name} : {type: 'confirm', target: only};
    }
    return {type: 'name', value: ''};
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Runs an async action; a failure stays on the current step as an error line. */
  const run = (work: () => Promise<string>, onError?: (e: unknown) => boolean) => {
    setBusy(true);
    setError(null);
    work()
      .then(onDone)
      .catch(e => {
        setBusy(false);
        if (!onError?.(e)) setError(oneLine(e));
      });
  };

  const submitName = (value: string, target?: RefTarget) => {
    const name = value.trim();
    if (name === '') return setError('type a name');
    if (target && name === target.name) return setError('that is already the current name');
    const kind = target?.kind ?? (mode === 'branch' ? 'branch' : 'tag');
    setBusy(true);
    setError(null);
    actions
      .validate(kind, name)
      .then(problem => {
        if (problem) {
          setBusy(false);
          setError(problem);
        } else if (mode === 'annotated') {
          setBusy(false);
          setStep({type: 'message', name, value: ''});
        } else {
          run(async () => {
            if (target) {
              await (kind === 'branch' ? actions.renameBranch(target.name, name) : actions.renameTag(target.name, name));
              return `${describeTarget(target)} renamed to ${name}`;
            }
            if (kind === 'branch') await actions.createBranch(name, commit.hash);
            else await actions.createTag(name, commit.hash);
            return `${kind === 'branch' ? 'branch' : 'tag'} ${name} created at ${short}`;
          });
        }
      })
      .catch(e => {
        setBusy(false);
        setError(oneLine(e));
      });
  };

  const deleteRef = (target: RefTarget) =>
    run(
      async () => {
        if (target.kind === 'tag') await actions.deleteTag(target.name);
        else await actions.deleteBranch(target.name, false);
        return `${describeTarget(target)} deleted`;
      },
      e => {
        if (!(e instanceof UnmergedBranchError)) return false;
        // Count what would be lost before asking for the strong confirmation.
        actions
          .uniqueCommits(target.name)
          // Unknown is not zero: the prompt must not claim that nothing is lost.
          .catch(() => null)
          .then(lost => setStep({type: 'force', target, lost, value: ''}));
        return true;
      },
    );

  useInput((input, key) => {
    if (busy) return;
    if (key.escape) return onCancel();

    if (step.type === 'choose') {
      const last = step.targets.length - 1;
      if (key.upArrow || input === 'k') setStep({...step, index: clamp(step.index - 1, 0, last)});
      else if (key.downArrow || input === 'j') setStep({...step, index: clamp(step.index + 1, 0, last)});
      else if (key.return) {
        const target = step.targets[step.index];
        if (!target) return;
        setError(null);
        setStep(mode === 'rename' ? {type: 'name', target, value: target.name} : {type: 'confirm', target});
      }
      return;
    }

    if (step.type === 'confirm') {
      if (input === 'n') onCancel();
      else if (key.return || input === 'y') deleteRef(step.target);
      return;
    }

    // The remaining steps are text fields.
    const edit = (value: string) => {
      setError(null);
      setStep({...step, value});
    };
    if (key.backspace || key.delete) edit(step.value.slice(0, -1));
    else if (key.return) {
      if (step.type === 'name') submitName(step.value, step.target);
      else if (step.type === 'message') {
        if (step.value.trim() === '') setError('type the tag message');
        else run(async () => (await actions.createTag(step.name, commit.hash, step.value.trim()), `tag ${step.name} created at ${short}`));
      } else if (step.value !== step.target.name) setError(`type exactly ${step.target.name} to confirm`);
      else run(async () => (await actions.deleteBranch(step.target.name, true), `${describeTarget(step.target)} deleted`));
    } else if (input && !key.ctrl && !key.meta && !key.tab) edit(step.value + input);
  });

  const title = {
    branch: `New branch at ${short}`,
    tag: `New tag at ${short}`,
    annotated: `New annotated tag at ${short}`,
    rename: 'Rename',
    delete: 'Delete',
  }[mode];

  const field = (label: string, value: string) => (
    <Text wrap="truncate-end">
      <Text bold>{label}</Text>
      {value}
      <Text inverse> </Text>
      {busy && <Text dimColor>{`  wait${ellipsis(display)}`}</Text>}
    </Text>
  );
  const problem = error && (
    <Text wrap="truncate-end" color={tint(display, 'red')}>
      {error}
    </Text>
  );
  const blank = <Text> </Text>;

  return (
    <Box flexDirection="column" height={DETAIL_LINES}>
      {step.type === 'choose' && (
        <>
          <Text bold wrap="truncate-end">{`${title} which ref of ${short}?`}</Text>
          {(() => {
            const size = DETAIL_LINES - 1;
            const start = centerWindow(step.targets.length, step.index, size);
            return step.targets.slice(start, start + size).map((target, i) => {
              const active = start + i === step.index;
              return (
                <Text key={`${target.kind}:${target.name}`} wrap="truncate-end" inverse={active}>
                  {`${active ? '>' : ' '} ${describeTarget(target)}`}
                </Text>
              );
            });
          })()}
        </>
      )}
      {step.type === 'name' && (
        <>
          <Text bold wrap="truncate-end">{step.target ? `${title} ${describeTarget(step.target)}` : title}</Text>
          {field(step.target ? 'New name: ' : 'Name: ', step.value)}
          {problem || <Text dimColor>{`Enter confirms ${dot} Esc cancels`}</Text>}
          {mode === 'annotated' ? <Text dimColor>Next, the tag message.</Text> : blank}
          {blank}
        </>
      )}
      {step.type === 'message' && (
        <>
          <Text bold wrap="truncate-end">{`Annotated tag ${step.name}`}</Text>
          {field('Message: ', step.value)}
          {problem || <Text dimColor>{`Enter creates ${dot} Esc cancels`}</Text>}
          {blank}
          {blank}
        </>
      )}
      {step.type === 'confirm' && (
        <>
          <Text bold wrap="truncate-end" color={tint(display, 'red')}>{`Delete ${describeTarget(step.target)}?`}</Text>
          <Text dimColor wrap="truncate-end">
            {step.target.kind === 'tag'
              ? 'Only the tag goes away; the commit and the other refs stay.'
              : 'Only the branch goes away; if it has commits no other ref has, git refuses and asks for another confirmation.'}
          </Text>
          {problem || blank}
          <Text dimColor>{`Enter/y confirms ${dot} Esc/n cancels`}</Text>
          {blank}
        </>
      )}
      {step.type === 'force' && (
        <>
          <Text bold wrap="truncate-end" color={tint(display, 'red')}>
            {step.lost === null
              ? `${step.target.name} is not merged: deleting loses the commits only it has (could not count)`
              : `${step.target.name} is not merged: deleting loses ${step.lost} ${step.lost === 1 ? 'commit' : 'commits'}`}
          </Text>
          <Text dimColor wrap="truncate-end">
            Those commits stay reachable only through the reflog for a while. To force it (git branch -D), type the name:
          </Text>
          {field('Name: ', step.value)}
          {problem || blank}
          {blank}
        </>
      )}
    </Box>
  );
}
