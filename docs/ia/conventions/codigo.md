# Code conventions

- **Strict TypeScript** (`strict` and `noUncheckedIndexedAccess`), ESM with `NodeNext`: relative imports carry the `.js` extension (`import {x} from './x.js'`).
- **Pure modules first.** `graph/` and `git/parse.ts` depend on neither the UI nor the process: they receive data and return data. Only `git/exec.ts` and `cli.tsx` touch the system.
- **The UI receives its dependencies through props.** `Browser` receives `load(rev, limit)` instead of calling git, which lets it be tested with fake data.
- **Display options through context** (`ui/display.ts`: color and ASCII), not through props passed down to every component.
- **Everything is in English**: the code, the comments, the interface texts (`--help`, footers, dialogs, errors) and the documentation. Comments only where the why is not obvious (decisions, git or Ink traps), not to repeat the code. The code recognizes git's output (always English because of `LC_ALL=C`), never the project's own messages.
- **No linter besides `tsc`.** The project does not use ESLint (decision: an extra dependency and configuration are not worth it for code this size); `strict` and the tests are the safety net. That is why there are no `eslint-disable` comments: where a hooks rule is broken on purpose (the dependencies of a `useEffect` that are only some), the comment explains why. If there is ever a linter, it comes with an `npm run lint` and a CI step.
- **No new dependency without a justification.** Prefer Node's standard library (e.g. `util.parseArgs`).
- **Did an architecture or convention decision change?** Update `ARCHITECTURE.md` and this folder in the same piece of work.
