#!/usr/bin/env node
import {statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import React from 'react';
import {render} from 'ink';
import {HELP, parseCliArgs, UsageError} from './args.js';
import {gitChanges} from './git/changes.js';
import {checkout} from './git/checkout.js';
import {abortMerge, conflictedFiles, merge as mergeInto} from './git/merge.js';
import {loadConfig} from './config.js';
import {copyText} from './clipboard.js';
import {gitHistoryActions} from './git/history.js';
import {gitOperationActions} from './git/operation.js';
import {gitRefActions} from './git/refsEdit.js';
import {loadStashes, runStash} from './git/stash.js';
import {fetchAll} from './git/fetch.js';
import {describeFilters, loadCommits, streamCommits, type LogOptions} from './git/log.js';
import {headHash, loadRefs} from './git/refs.js';
import {verifyRevisions} from './git/revs.js';
import {watchRepository} from './git/watch.js';
import {enableTerminalMouse} from './terminalMouse.js';
import {createLayout, layoutGraph} from './graph/layout.js';
import {Browser, type LoadGraph} from './ui/Browser.js';
import {DisplayContext} from './ui/display.js';
import {plainLines} from './ui/plain.js';

/** Commits loaded at the start of the TUI; the rest comes on demand. */
const DEFAULT_LIMIT = 500;

async function main() {
  const options = parseCliArgs(process.argv.slice(2), process.env, () => loadConfig(process.env));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    const {version} = createRequire(import.meta.url)('../package.json') as {version: string};
    console.log(version);
    return;
  }

  const cwd = resolve(options.directory ?? process.cwd());
  if (options.directory !== undefined && !statSync(cwd, {throwIfNoEntry: false})?.isDirectory()) {
    throw new UsageError(`-C: ${options.directory} is not a directory`);
  }
  await verifyRevisions(cwd, options.revs);
  const logOptions = (revs: string[], maxCount: number | undefined): LogOptions => ({
    ...(revs.length === 0 ? {all: true} : {revs}),
    maxCount,
    paths: options.paths,
    order: options.order,
    stashes: options.stash,
    uncommitted: options.uncommitted,
    ...options.filters,
  });
  // Refs are read on every load: after a checkout, HEAD has moved.
  const graph = async (revs: string[], maxCount: number | undefined) => {
    // Both loads need the stash list and HEAD: ask git once.
    const [stashes, head] = await Promise.all([loadStashes(cwd), headHash(cwd)]);
    const [commits, refs] = await Promise.all([
      loadCommits(cwd, {...logOptions(revs, maxCount), known: {stashes, head}}),
      loadRefs(cwd, {stashes, head}),
    ]);
    return {rows: layoutGraph(commits), refs};
  };

  // Without a TTY (pipe/redirect) the output is plain text and complete, like `git log`.
  if (!process.stdout.isTTY) {
    // The reader may close the pipe before the end (`| head`, `| less` + q): exit without an error.
    process.stdout.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0);
      throw error;
    });
    const rows = async function* () {
      const next = createLayout();
      for await (const commit of streamCommits(cwd, logOptions(options.revs, options.maxCount))) yield next(commit);
    };
    // The text is aligned to the widest row, so a first pass measures it. Only the width is kept,
    // which lets the history be any size; the second pass writes each row as it is read.
    let width = 0;
    let count = 0;
    for await (const row of rows()) {
      width = Math.max(width, row.width);
      count++;
    }
    if (count === 0) {
      console.error('gitgraph: the repository has no commits');
      return;
    }
    const refs = await loadRefs(cwd);
    const style = {ascii: options.ascii, spaced: !options.compact, date: options.date};
    for await (const row of rows()) {
      for (const line of plainLines(row, refs, width, style)) {
        // Respect backpressure: wait for the reader instead of queueing the whole history.
        if (!process.stdout.write(`${line}\n`)) await new Promise<void>(resolve => process.stdout.once('drain', resolve));
      }
    }
    return;
  }

  const load: LoadGraph = (revs, limit) => graph(revs, limit);
  const initialLimit = options.maxCount ?? DEFAULT_LIMIT;
  const initial = await load(options.revs, initialLimit);
  const repoWatch = options.watch ? await watchRepository(cwd) : undefined;
  const terminalMouse = options.mouse ? enableTerminalMouse(process.stdin, process.stdout) : undefined;
  try {
    const {waitUntilExit} = render(
      <DisplayContext.Provider value={{color: options.color, ascii: options.ascii, spaced: !options.compact, date: options.date, lanes: options.laneColors}}>
        <Browser
          initial={initial}
          initialLimit={initialLimit}
          initialRevs={options.revs}
          filters={[...describeFilters(options.filters), ...(options.paths.length > 0 ? [`paths ${options.paths.join(' ')}`] : [])]}
          maxCommits={options.maxCount}
          load={load}
          checkout={target => checkout(cwd, target)}
          changes={gitChanges(cwd)}
          merge={{
            merge: target => mergeInto(cwd, target),
            abort: () => abortMerge(cwd),
            conflicts: () => conflictedFiles(cwd),
          }}
          mouse={terminalMouse?.source}
          watch={repoWatch?.source}
          copy={text => copyText(text)}
          fetch={() => fetchAll(cwd)}
          stash={(op, hash) => runStash(cwd, op, hash)}
          refEdit={gitRefActions(cwd)}
          operation={gitOperationActions(cwd)}
          history={gitHistoryActions(cwd)}
        />
      </DisplayContext.Provider>,
      {alternateScreen: true},
    );
    await waitUntilExit();
  } finally {
    terminalMouse?.dispose();
    repoWatch?.close();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`gitgraph: ${message}`);
  if (error instanceof UsageError) {
    console.error('Use --help to see the options.');
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
});
