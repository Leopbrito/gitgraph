#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {loadCommits} from './git/log.js';
import {loadRefs} from './git/refs.js';
import {layoutGraph} from './graph/layout.js';
import {App} from './ui/App.js';
import {formatPlain} from './ui/plain.js';

const MAX_COMMITS = 500;

async function main() {
  const cwd = process.cwd();
  const [commits, refs] = await Promise.all([
    loadCommits(cwd, {all: true, maxCount: MAX_COMMITS}),
    loadRefs(cwd),
  ]);
  const rows = layoutGraph(commits);
  // Sem TTY (pipe/redirecionamento) a saída é texto puro, como o `git log`.
  if (!process.stdout.isTTY) {
    for (const line of formatPlain(rows, refs)) console.log(line);
    return;
  }
  const {waitUntilExit} = render(<App rows={rows} refs={refs} />);
  await waitUntilExit();
}

main().catch(error => {
  console.error(`gitgraph: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
