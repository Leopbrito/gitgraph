# Test conventions

- Runner: **Vitest** (`npm test`). The tests live in `tests/`, mirroring `src/`.
- **Pure logic** (`parse`, `layout`, `glyphs`, `viewport`, `picker`, `args`): table tests with synthetic commits, no git.
- **Real git:** use `createRepo()` from `tests/git/helpers.ts`, which creates a temporary repository with a fixed author and `gpgsign` off, and clean up with `cleanup()`. Do not depend on the order between parallel commits (`--topo-order` does not guarantee it).
- **Ink components:** `ink-testing-library`. For keys, write to `stdin` and wait a tick (see `press()` in `tests/ui/Browser.test.tsx`). There is no TTY in a test, so colors cannot be asserted: test text and structure.
- **Graph drawings:** check the output by hand against `git log --graph` before fixing it as the expectation; do not copy what the code returned without checking.
- Did the output format change? Update the tests that pin it and say so in the commit.
- Before finishing: `npm run typecheck`, `npm run build` and `npm test`.
- **Windows.** CI also runs the tests on `windows-latest`, for now in a job that does not block (`continue-on-error`). The CLI tests call tsx's `cli.mjs` with the current `node` (not `.bin/tsx`, which is a shell script); whatever depends on `sh` or `head` uses `it.skipIf(process.platform === 'win32')`. When the job is green, remove the `continue-on-error`.
