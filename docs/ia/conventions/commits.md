# Commit conventions

- **Never commit or push without an explicit request.** Before committing, show the diff (or the list of files) and the proposed message and wait for the OK; only then run `git commit`.
- Messages in **English**: an imperative title (`Add…`, `Fix…`, `Compact…`), up to ~70 characters, no final period.
- Optional body, separated by a blank line, wrapped at ~72 columns, explaining the **why** and what changes for the user.
- One commit per cohesive change (a phase of the plan, a fix). Documentation changed by the change goes in the same commit.
- Before committing, `npm run typecheck`, `npm run build` and `npm test` pass.
