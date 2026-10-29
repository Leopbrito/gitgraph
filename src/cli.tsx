#!/usr/bin/env node
import {createRequire} from 'node:module';
import React from 'react';
import {render} from 'ink';
import {HELP, parseCliArgs, UsageError} from './args.js';
import {checkout} from './git/checkout.js';
import {loadCommits} from './git/log.js';
import {loadRefs} from './git/refs.js';
import {layoutGraph} from './graph/layout.js';
import {Browser, type LoadGraph} from './ui/Browser.js';
import {DisplayContext} from './ui/display.js';
import {formatPlain} from './ui/plain.js';

/** Commits carregados de início na TUI; o resto vem sob demanda. */
const DEFAULT_LIMIT = 500;

async function main() {
  const options = parseCliArgs(process.argv.slice(2), process.env);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    const {version} = createRequire(import.meta.url)('../package.json') as {version: string};
    console.log(version);
    return;
  }

  const cwd = process.cwd();
  // Refs are read on every load: after a checkout, HEAD has moved.
  const graph = async (revs: string[], maxCount: number | undefined) => {
    const [commits, refs] = await Promise.all([
      loadCommits(cwd, revs.length === 0 ? {all: true, maxCount} : {revs, maxCount}),
      loadRefs(cwd),
    ]);
    return {rows: layoutGraph(commits), refs};
  };

  // Sem TTY (pipe/redirecionamento) a saída é texto puro e completa, como o `git log`.
  if (!process.stdout.isTTY) {
    const {rows, refs} = await graph([], options.maxCount);
    if (rows.length === 0) {
      console.error('gitgraph: o repositório não tem commits');
      return;
    }
    // O leitor pode fechar o pipe antes do fim (`| head`, `| less` + q): sai sem erro.
    process.stdout.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0);
      throw error;
    });
    for (const line of formatPlain(rows, refs, {ascii: options.ascii, spaced: !options.compact})) console.log(line);
    return;
  }

  const load: LoadGraph = (revs, limit) => graph(revs, limit);
  const initialLimit = options.maxCount ?? DEFAULT_LIMIT;
  const initial = await load([], initialLimit);
  const {waitUntilExit} = render(
    <DisplayContext.Provider value={{color: options.color, ascii: options.ascii, spaced: !options.compact}}>
      <Browser
        initial={initial}
        initialLimit={initialLimit}
        maxCommits={options.maxCount}
        load={load}
        checkout={target => checkout(cwd, target)}
      />
    </DisplayContext.Provider>,
    {alternateScreen: true},
  );
  await waitUntilExit();
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`gitgraph: ${message}`);
  if (error instanceof UsageError) {
    console.error('Use --help para ver as opções.');
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
});
