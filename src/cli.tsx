#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {loadCommits} from './git/log.js';
import {loadRefs} from './git/refs.js';
import {layoutGraph} from './graph/layout.js';
import {Browser, type LoadGraph} from './ui/Browser.js';
import {formatPlain} from './ui/plain.js';

const MAX_COMMITS = 500;

async function main() {
  const cwd = process.cwd();
  const refs = await loadRefs(cwd);
  const load: LoadGraph = async (rev, limit) => {
    const commits = await loadCommits(
      cwd,
      rev === null ? {all: true, maxCount: limit} : {revs: [rev], maxCount: limit},
    );
    return {rows: layoutGraph(commits), refs};
  };
  const initial = await load(null, MAX_COMMITS);

  // Sem TTY (pipe/redirecionamento) a saída é texto puro, como o `git log`.
  if (!process.stdout.isTTY) {
    // O leitor pode fechar o pipe antes do fim (`| head`, `| less` + q): sai sem erro.
    process.stdout.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0);
      throw error;
    });
    for (const line of formatPlain(initial.rows, refs)) console.log(line);
    return;
  }
  const {waitUntilExit} = render(
    <Browser initial={initial} initialLimit={MAX_COMMITS} load={load} />,
    {alternateScreen: true},
  );
  await waitUntilExit();
}

main().catch(error => {
  console.error(`gitgraph: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
