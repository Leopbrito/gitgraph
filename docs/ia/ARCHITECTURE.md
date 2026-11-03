# Architecture

> Living document. Sections marked **To be defined** have no decision yet.

## Goal

A CLI that reads a git repository and renders its branch and commit graph in the terminal.

## Scope (decision)

`gitgraph` is a **history viewer with a small set of actions**, not a full git client: it does not compete with lazygit or tig. The criterion for an action to get in is: **a) its result is visible in the graph** (a node, a ref or HEAD changes) and **b) one question is enough** (confirm, type a name, choose a ref), with no multi-screen flow the user would have to understand from the inside. In: checkout, merge, stash (apply/pop/drop), create/rename/delete branches and tags, fetch, cherry-pick, revert and reset (issue #12).

**Out of purpose: starting a rebase.** It rewrites several commits at once and stops on **conflicts in series** (one per commit), and the interactive one (`-i`) is a todo-list editor, which needs an editing screen, exactly what the project does not want to be. With merge, cherry-pick and revert, a conflict is an isolated event and the dialog (abort or leave) is enough; with rebase there would be N events, with `--continue` and `--skip` in between, and the graph would change at every step. Whoever wants a rebase uses the terminal, and `gitgraph` helps look at the result (`r`, `--watch`).

**What gets in instead: operations already in progress.** A rebase (or cherry-pick, revert, merge) started outside the TUI, or stopped on conflicts, is detected (`operationInProgress`: `rebase-merge/` and `rebase-apply/` in the git directory, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `MERGE_HEAD`, all by file checks after a single `rev-parse --absolute-git-dir`; rebase comes first because, stopped on a commit, it also leaves `CHERRY_PICK_HEAD`). The header shows `(rebase in progress)` in yellow and `m` opens a dialog with **abort, continue, skip the step or leave it in progress** (`OperationPrompt`). That way nobody is stuck on a screen with no exit, and the TUI never starts what it cannot follow. If the decision changes (for example, a plain `git rebase <base>` with this same dialog), the base already exists: a `git/rebase.ts` and a key would be enough.

## Stack

- **UI:** React + [Ink](https://github.com/vadimdemedes/ink)
- **Language:** TypeScript (strict, ESM), run in dev with `tsx`
- **Reading git:** call `git log` through `child_process` (no library)
- **Tests:** Vitest + ink-testing-library
- **Package manager:** npm

## Overview

```
git repository ──▶ data reading ──▶ graph building ──▶ rendering (Ink)
```

1. **Data reading:** gets commits, parents, branches and tags from the repository.
2. **Graph building:** turns the commits into a model with rows, columns and edges, independent of the UI.
3. **Rendering:** Ink components that draw the model in the terminal.

## Directory structure

```
src/
  cli.tsx          # entry: arguments, data loading and the choice between Browser (TTY) and plain text (pipe)
  terminalMouse.ts # turns the terminal mouse on/off (modes 1000/1006) and strips the reports from stdin before Ink
  clipboard.ts     # copyText(): native program (pbcopy/wl-copy/xclip/xsel/clip) or OSC 52; pure osc52() and clipboardCommands()
  config.ts        # config.json (XDG): configPath(), parseConfig() (validates the schema), loadConfig(); FileConfig
  args.ts          # parseCliArgs() (util.parseArgs), HELP and UsageError
  git/
    exec.ts        # runs `git` (execFile, LC_ALL=C), translates the common errors; `network` option for remotes
                   # gitStream(): the same git through spawn, handing the output over little by little (with backpressure) and killing the process if the consumer stops
    revs.ts        # verifyRevisions()/revisionNames(): validates the command line revisions (`rev-parse --verify`)
    log.ts         # streamCommits(): git log -z -> Commit one by one, with stashes and changes in the right place; loadCommits() collects them into a Commit[] (all/revs/paths/maxCount/order/stashes; `all` excludes the stash; an empty repo gives [])
    parse.ts       # parseLog(): text -> Commit[] (pure)
    watch.ts       # watchRepository(): fs.watch on HEAD/index/packed-refs/refs with debounce; ChangeSource
    status.ts      # parseStatus()/describeWorkingTree() (pure), loadWorkingTree() through `git status --porcelain=v2`, uncommittedNode()
    fetch.ts       # fetchAll(): `git fetch --all --prune` with `network: true`; translates an authentication failure
    refsEdit.ts    # RefActions/gitRefActions(): validate, create, rename and delete branches and tags; UnmergedBranchError
    operation.ts   # Operation, operationInProgress(), OperationActions/gitOperationActions(): abort/continue/skip of a stopped merge, cherry-pick, revert and rebase
    history.ts     # HistoryActions/gitHistoryActions(): cherry-pick, revert, reset and the reset preview; OperationStoppedError
    stash.ts       # loadStashes()/parseStashList(): entries of `git stash list` (hash and stash@{n}); runStash() (apply/pop/drop) and StashConflictError
    refs.ts        # loadRefs()/parseRefs(): branches, remotes, tags and HEAD by commit
    merge.ts       # mergeTargets()/describeMergeTarget() (pure), merge(), abortMerge(), mergeInProgress(), conflictedFiles(), MergeConflictError
    changes.ts     # parseChanges()/splitDiff() (pure), loadChanges()/loadDiff()/loadFullDiff() through `git diff-tree`, gitChanges() (ChangesActions with a cache), DIFF_MAX_LINES and FULL_DIFF_MAX_LINES
    checkout.ts    # checkoutTargets()/isCurrent()/describeTarget()/describeOption() (pure) and checkout() through `git switch` (+ `merge --ff-only <remote>/<branch>`)
  graph/
    types.ts       # Commit, Ref, Edge, GraphRow
    layout.ts      # layoutGraph(): Commit[] -> GraphRow[] (pure, no UI); createLayout(): the same one commit at a time
    glyphs.ts      # GraphRow -> character cells (node and connector line), pure
  ui/
    Browser.tsx    # TUI: selection, scrolling, branch filter and on-demand loading
    display.ts     # DisplayContext (color/ASCII), tint(), separator() and the other symbols (ellipsis, arrow, arrows, rule)
    GraphRowView.tsx # one graph row in Ink (colors per lane, truncated, highlighted)
    CommitDetail.tsx # panel with the details of the selected commit (5 fixed lines; the full detail is in CommitView)
    useDoubleClick.ts # hook: two clicks on the same target within 400 ms
    CommitView.tsx # full-screen view of the commit: message, changed files and diff (Enter/d)
    DiffView.tsx   # diff of a file (side by side or unified) or of the commit (unified), with scrolling
    diff.ts        # classifyDiff(): the kind of each line of a unified diff (pure)
    sideBySide.ts  # alignDiff()/changeStarts(): unified diff -> aligned before/after rows (pure)
    scroll.ts      # wrapText(), scrollBy() and keepVisible() for scrolling rows of height 1 (pure)
    BranchPicker.tsx # branch picker (takes the place of the details panel)
    CheckoutPrompt.tsx # checkout confirmation (takes the place of the details panel)
    MergePrompt.tsx # merge confirmation (same)
    RefManager.tsx # create/rename/delete a branch or tag: a step machine that takes the panel and handles its own keys
    refTargets.ts  # refTargets(): which refs of a commit can be renamed/deleted (pure)
    OperationPrompt.tsx # stopped operation (cherry-pick, revert, rebase): abort, continue, skip or leave
    ResetPrompt.tsx # reset soft/mixed/hard: preview of the effect and confirmation (strong for --hard)
    ConfirmPrompt.tsx # generic yes/no question (title and lines), used for the stash drop
    ConflictPrompt.tsx # merge in progress: abort or leave (same)
    viewport.ts    # window of visible rows with items of height 1 or 2, and itemAt(): screen row -> item (pure)
    mouse.ts       # parseMouse()/splitMouse(): SGR reports -> click/wheel events (pure); MouseSource
    graphWindow.ts # visibleColumns()/clampOffset()/followColumn(): horizontal window over the graph columns (pure)
    picker.ts      # branch list and filter (pure)
    follow.ts      # followCommit(): where the selected commit is after reloading (pure)
    search.ts      # matchesCommit()/findMatches()/firstFrom()/nextMatch(): in-memory search over the loaded commits (pure)
    SearchPrompt.tsx # search field (takes the place of the details panel)
    date.ts        # formatDate()/relativeDate(): short, ISO and relative dates (pure, the clock is a parameter)
    keymap.ts      # SHORTCUTS: the single table of shortcuts (footer, help screen and --help come from it); footerHint(), shortcutLines()
    HelpView.tsx   # help screen (?) with scrolling, generated from the table
    format.ts      # ref labels (HEAD, branches, remotes, tags)
    plain.ts       # formatPlain()/plainLines(): the same output as plain text, for pipes (accepts ascii)
tests/
  graph/           # layout and glyphs with synthetic commits (no git)
  ui/              # pure viewport/picker/format/plain; Browser and GraphRowView through ink-testing-library
  git/             # pure parse/refs and integration with temporary git repos (helpers.ts)
```


### Layout model

`layoutGraph` receives commits in topological order (children before parents) and keeps a **dense** list of *lanes* (expected hashes, with no gaps): the lane index is the column on screen. Rules:

- The commit takes the lane that expects it; with no lane (a new tip), it goes at the **end** of the list, so as not to push existing lanes without a connector line.
- The first parent inherits the child's lane (and color); the others open lanes right next to it.
- A parent that already has a lane gets the edge in it, without duplicating a lane.
- When a lane ends (a root, or a first parent already present in another lane), the ones to its right slide to the left. That is why the graph leaves no empty columns.
- Each `GraphRow` exposes `lanesBefore`/`lanesAfter` (and the parallel colors) and `edges` (the parent's column in `lanesAfter`). A lane keeps its color when sliding: the color belongs to the lane, not to the column.

### Drawing (glyphs)

The commit line shows `●` and the passing lanes (`│`) of `lanesBefore`. The **connector line** exists only if some lane changes column (`needsConnector`) and draws, for each path (a commit edge or a passing lane), up-run-down between the source and the destination column. The directions meeting in a cell add up and become the glyph (`├ ┤ ┬ ┴ ┼ ╭ ╮ ╰ ╯`). Lanes that only slide one column use `╱` (left) or `╲` (right) in the gap between the columns, if it is free.

With `spaced` (the CLI default), the connector line exists after **every** commit that still has lanes going on, even with no lane changing column: it only draws the `│` that joins a commit to the next. Without `spaced` (`--compact`), one line per commit and the connector line only appears when some lane changes column. The option reaches the components through `DisplayContext` and the text output through `formatPlain`; `Browser` uses `needsConnector(row, {spaced})` to compute the height of each row (1 or 2), so scrolling stays correct.

### Output

- **TTY:** `Browser` runs on the alternate screen (Ink's `alternateScreen`), so the terminal scrollback is not affected. The layout has a fixed height: header, list, separator, details (5 lines) and footer, plus 1 spare line (if the output takes every line, Ink clears the screen on each render). Each line is truncated to the terminal width.
- **No TTY (pipe/redirect):** prints plain text, with no color or wrapping, like `git log`, and does not go through Ink. The output does not fit in memory: `streamCommits` + `createLayout` (the layout one commit at a time) run in **two passes**: the first only measures the width of the widest graph row (the text is aligned to it) and drops the rows; the second writes each line (`plainLines`) waiting for stdout's `drain`. If the reader closes the pipe (`| head`), the process exits and git stops. With `--author`, `--since` or `--until`, `streamCommits` reads everything first (`relink` needs the whole list). `formatPlain` still exists for whoever has the lines at hand (tests).
- Each graph column takes 2 characters (glyph + space, `─`, `╱` or `╲`).

### Wide graphs (`h`/`l`)

With many open lanes the graph goes past the terminal width and pushes the commit text out. The issue gave two ways out, and the implementation uses both: **the text has priority** (`visibleColumns` reserves `MIN_TEXT_WIDTH` = 48 characters for the marker, hash, subject and author and gives the rest, in columns of 2 characters, to the graph, never fewer than 4) and **the graph scrolls** (`h`/`l` or `←`/`→`, `PAN_STEP` = 2 columns). `Browser` keeps only `graphOffset`; `graphStart = clampOffset(...)` is recomputed on every render, so resizing the terminal does not leave the window outside the graph (same idea as `scrollIntoView`). `GraphRowView` is a `React.memo`: `Browser` keeps the props of the rows that did not change stable (`NO_REFS`, `asHead`/`notHead` and the memoized `columnWindow`), so a `j` key redraws only the two rows whose selection changed (from ~21 to ~9 ms per key with 20 lanes and 800 commits; `tests/ui/rowMemo.test.tsx` guards that), and neighbouring cells of the same color become a single `<Text>`. A new prop for the row must be stable. `GraphRowView` receives `columnWindow` and slices the cells **after** `toAscii` (each column is 2 cells: glyph and separator), so it works for ASCII and for the connector line; the padding becomes the width of the window. `select()` calls `followColumn` with the column of the selected commit's node: the node never leaves the view while navigating, but the user can scroll by hand to another side and only loses that by moving the selection. The header shows `graph a-b/total (h/l)` only when there is a cut. `panGraph` uses a functional update so that keys pressed before a render all count. The pipe output is not affected, and the cut lanes do not show (the connections of a hidden lane disappear with it), which is the cost of prioritizing the text.

### Shortcuts, help and `--help`

`ui/keymap.ts` has the **single** key table (`SHORTCUTS`: context, how the key is written, the characters the code handles, description and, optionally, the short footer text). Three things come from it: the list **footer** (`footerHint`: only the entries with `footer`, to fit in ~100 columns), the **help screen** (`HelpView`, opened by `?`, with all the sections, scrolling and `?`/`Esc`/`q` to close) and **`--help`** (`args.ts` builds `HELP` from `OPTION_DOCS` and `shortcutLines`). With `--ascii` the arrows become words (`asciiKeys`). The parser options also live in an exported constant, `OPTIONS`.

So that the table does not go stale there are tests in `tests/ui/keymap.test.ts`: one scans `src/ui/*.tsx` for `input === '<c>'` and requires that **every handled key is listed** in the table (and that no entry names a key nobody handles); another requires that `--help` mentions every key of `OPTIONS`. When you create a key, the test fails until the table is updated. Limit: the test only sees comparisons with a one-character `input === 'x'`, not the special keys (arrows, Enter, Tab), which are left to review.

### Interaction (TTY)

**One dialog at a time.** What is open over the list is a single state, `modal` (`Modal`, a discriminated union in `Browser.tsx`: `checkout`, `merge`, `conflict`, `stopped`, `replay`, `reset`, `drop`, `ref`, `picker`, `search`). The mouse is ignored if there is a `modal`; `useInput`, the footer and the details panel are a `switch` over `modal?.kind` (the compiler flags a forgotten case, and two dialogs do not stack). The commit view (`viewing`) and the help (`helping`) replace the whole screen and stay apart. When creating a dialog: a case in `Modal`, and a `case` in each of the three `switch`es.

- `j`/`k`/arrows move the selection; `PgUp`/`PgDn` move a page; `g`/`G` (or `Home`/`End`) go to the start/end; `Enter`/`d` opens the commit view; `c` checks out; `m` merges into the current branch; `q` quits.
- `/` opens the branch picker (local and remote) with multiple selection: typing filters the list, `↑`/`↓` move, `Space` marks/unmarks (on "all", it clears the marks), `Enter` applies, `Esc` cancels. The filter is a list `revs: string[]` (empty = all, through `--exclude=refs/stash --all`); applying reloads with `git log <revs...>`, that is, the union of the commits reachable from each branch. The marks belong to the picker state (`selected`), survive typing, and the picker opens with the current filter already marked. `chosenRevs` (pure, in `picker.ts`) decides what `Enter` applies: the marked ones in list order or, with none, the highlighted one.
- The visible window is computed in rows, not in commits, because a commit with a connector line takes 2 rows (`viewport.ts`). The offset is recomputed on every render, so resizing the terminal does not hide the cursor.
- On-demand loading: the CLI starts with 500 commits; when the list is full and the selection gets within 20 commits of the end, it reloads with double the limit. Only real commits count against the limit (not the stash and uncommitted nodes). The prefix of the chosen order (see "Commit order") does not change with `--max-count`, so the layout of the commits already shown stays the same.
- `Browser` receives `load(revs, limit)` as a parameter, which isolates git from the UI and allows testing with fake data. The refs are re-read on every `load` (they are cheap), because a checkout moves HEAD.
- **Checkout (`c`):** `checkoutTargets` chooses the destination of the selected commit: the local branches whose tip it is (sorted) or, if there is none, a detached HEAD (`git switch --detach <hash>`); remote-only tips fall back to a detached HEAD. It always asks for confirmation (`CheckoutPrompt`; with several branches it is a list). If HEAD is already at the destination, it only warns in the footer. It never uses `--force`: git refuses when local changes would be overwritten, and the message becomes the one-line error in the footer.
- **Local branch behind the remote:** if the commit is the tip of `origin/x` and the local branch `x` (`localBranchTips` in `refs.ts`) is at another commit, `checkoutTargets` returns `[pull x, branches really at the commit, x without advancing, detached HEAD]` and the prompt is a list with the first option selected. The local branch name is what is left after the remote, trying each `/` (it handles `origin/feature/x`); the prefix has to be a real remote (`git remote`, in `RefInfo.remotes`), otherwise `origin/feature/x` would be matched with an unrelated local branch `x`. `checkout` of a `pull` target does `git switch x` and then `git merge --ff-only <remote>/x`: local, no network, and it reaches exactly the selected commit (the remote ref the graph shows), where a `git pull` would go to the current tip of the remote and read `pull.rebase`/`pull.ff`. Whoever wants new commits from the remote uses the fetch (`f`). If the advance fails, it throws `PartialCheckoutError` (the switch already happened): `Browser` reloads so HEAD reflects it and keeps the message, filtered by `summarizeGitError` (drops the fetch summary and the `hint:` lines). The name `pull` stayed only in the target type (`kind: 'pull'`).
- After a successful checkout, `Browser` calls `reload` (with `follow`) so the HEAD marker follows. `Browser` receives `checkout(target)` as a parameter, like `load`.

### Search

`s` opens the search field; `n`/`N` walk the results; `/` remains the branch filter (decision: keep the existing key map and add `s`, instead of following tig's `/` and moving the filter to another key). The search matches **in memory** (`findMatches`: a case-insensitive substring on hash, subject, body, author and e-mail); it does not call git to match. To reach history that has not been loaded yet (the issue's "version 2"), instead of running a separate `git log --grep`/`--author`, the search **pulls more history until it finds a match**: that keeps a single matching rule (the same on the loaded and the new commits), a single source of truth for the list and the on-demand loading that already exists.

`seeking` (`{after}`) turns this mode on: the field's `Enter` with no loaded result (`after = origin - 1`) and `n` past the last loaded result (`after = cursor.selected`), both only when `more` (there is a ceiling to grow to and the list is full). An effect evaluates on every load: if there is a result with index `> after`, it selects it and ends; otherwise, if it can still grow, it doubles the limit and reloads (same rule as `LOAD_AHEAD`, `maxCommits` included); otherwise the history ended: it goes back to the first result (with a notice) or gives up (`no commit found ... in the whole history`). A load error ends the mode, and `Esc` cancels it keeping the search. `N` only walks among the loaded ones: finding the *last* result would require loading everything.

State in `Browser`: `query` (the active search, which feeds `matches` through `useMemo` and therefore survives reloads and branch filter changes) and the `search` modal (the open field, with `origin`, the cursor position when it opened, and `previous`, the previous search). On every key the search is redone and the cursor goes to the first result from `origin` (`firstFrom`, wrapping to the start), so deleting letters moves the cursor back. `Esc` in the field restores `previous` and the cursor; `Enter` closes the field keeping the search (with no results, it warns and drops it). Outside the field, `Esc` clears the search and `n`/`N` use `nextMatch` (wrapping). With the field open `useInput` consumes every key, so `q`, `j` etc. go into the text; the mouse is ignored too. The result shows in the header (`search "x" 3/12`) and in the rows: subject in yellow/bold and `*` in place of the marker (Ink's `--no-color` turns every style off, so color alone would not be enough).

### Operations in progress

`loadRefs` keeps `head.operation` (an `Operation`: `merge`, `cherry-pick`, `revert` or `rebase`) and `head.merging` (true only for merge, which has its older dialog, with abort/leave). For the others, `Browser` opens the `stopped` modal (`{op, files, index}`) and renders `OperationPrompt` in place of the panel; the options come from `operationOptions(op)` (`skip` only exists when `canSkip`: merge has no steps). `runOperation` calls `OperationActions` (`abort`, `proceed`, `skip`, injected like `load`) and **always reloads**, on failure too, because the state may have changed (a later step stopped on new conflicts); the error is set after the `reload`, which would clear it. `proceed` is `git <op> --continue` with `GIT_EDITOR=true` and `GIT_SEQUENCE_EDITOR=true` (`GitOptions.env`): without that git would open an editor inside the TUI and hang; the message used is git's own. While the dialog is open, the list keys and the mouse are inert.

### Cherry-pick, revert and reset (`C`, `v`, `X`)

`Browser.history: HistoryActions` (injected, `gitHistoryActions`). **Cherry-pick and revert** ask for confirmation (`ConfirmPrompt`, the `replay` modal) and run `git cherry-pick <hash>` / `git revert --no-edit <hash>`, with `-m 1` on a merge commit (the prompt says so). If git fails, `step()` looks at `operationInProgress`: with a stopped operation it throws `OperationStoppedError(operation, conflicted files)` and `Browser` reloads and opens the **same `OperationPrompt`** as for operations already in progress (an empty result stops this way too, with an empty file list); without a stopped operation the error is a refusal (local changes in the way) and nothing changed, so it only shows in the footer. They are blocked with another operation in progress (the message says to press `m`), on a stash, on the changes node and, for `C`, on HEAD itself.

**Reset** has its own component, `ResetPrompt`, a step machine that handles its own keys like `RefManager`: `mode` (soft/mixed/hard) → `confirm` (y/n; soft and mixed) or `force` (`--hard`: type the branch name, or `discard` with a detached HEAD). `resetPreview` runs on open and **only informs** (if it fails, the choice is still possible): `ahead` = `target..HEAD`; `orphaned` = commits of HEAD that neither the target nor **any other** branch, remote or tag reaches (`rev-list --count HEAD --not <target> --exclude=<current branch> --branches --remotes --tags`: git expands the refs itself, so a repository with tens of thousands of tags does not hit the OS limit on arguments), that is, the ones only the reflog would keep; `changed` = modified or conflicted tracked files, from `git status`, that `--hard` would throw away (untracked ones are not touched). The target is always the selected commit, and HEAD is refused. After success, `reload` with `follow`.

### Branches and tags (`b`, `t`, `T`, `R`, `D`)

Since `Browser` already concentrates a lot of state, this flow lives in `RefManager`, which takes the place of the details panel and has its own `useInput`; while it is open (the `ref` modal), `Browser`'s `useInput` and mouse are inert (that is why `q`, `j` etc. go into the name text). `Browser` only decides **whether to open** (never on a stash or on the changes node; it needs `refEdit`; `R`/`D` need targets, and the message explains when the only target is the current branch) and **reloads** (`reload` with `follow`) when `onDone` brings the message. The steps are `choose` (which ref, if there is more than one) → `name` (text field) → `message` (annotated tag only) / `confirm` / `force`. The action runs through `RefActions` (`git/refsEdit.ts`, injected like `load`): a failure becomes an error line **in the same step**, without closing.

The name is validated in two stages: `git check-ref-format --branch` (or `refs/tags/<name>`), plus a refusal of `HEAD` and of names that start with `-`, and then existence (`show-ref`), so that creating never overwrites. Creating uses `git branch <name> <hash>` and `git tag [-a -m] <name> <hash>`, so it does not switch branches. Renaming a tag does not exist in git: a lightweight tag becomes a new ref to the same commit; an annotated one gets a **new tag object** with the same message and the same tagger (name, e-mail and date), because the object records its own name and a second ref to the old object makes `git describe` warn "externally known as". A signed tag is refused (the signature covers the name). The old one is deleted afterwards; if that fails, the new one is undone. The remote is not touched. Deleting a branch uses `git branch -d`; if it refuses with "not fully merged", `deleteBranch` throws `UnmergedBranchError`, and `RefManager` counts the commits only that branch has (`uniqueCommits`: `rev-list --count <branch> --not --exclude=<branch> --branches --remotes --tags`) and requires **typing the name** to force it with `-D` (if the count itself fails, it says so instead of claiming zero). Remote branches are not among the targets.

### Stash operations (`a`, `p`, `x`)

They apply on a stash row (on another row, they only warn). `Browser.stash(op, hash)` (injected like `load`; the CLI passes `runStash`) receives the **hash of the stash commit**, not `stash@{n}`: the number shifts when another stash is created or dropped (even from another terminal), and acting by number could drop the wrong stash. `runStash` re-reads `git stash list`, finds the current name by the hash and fails with "that stash no longer exists" if it is gone. `apply` and `pop` run directly, because they keep or return the changes; only `drop` asks for confirmation (`ConfirmPrompt`), since it is irreversible. Failures: if git leaves files in conflict (`conflictedFiles`, the same helper as merge), it becomes `StashConflictError`: the markers stay in the working tree, the stash **is kept** (`pop` does not drop when there is a conflict), `Browser` reloads and lists the files. Unlike merge there is no "abort" (`apply` does not leave a state git knows how to go back from), so the flow only informs. If local changes are in the way (`would be overwritten`, an existing untracked file), git refuses without changing anything and the message says to commit or stash first. After any success, `reload` with `follow`: a removed stash makes the cursor go to the base commit.

### Upstream and fetch (`f`)

`loadRefs` reads, for the current branch (never with a detached HEAD), `rev-parse --abbrev-ref @{upstream}` and `rev-list --left-right --count HEAD...@{upstream}` (`parseAheadBehind`), and sets `head.upstream = {name, ahead, behind}`. Without an upstream, or with the upstream deleted on the remote (the `rev-list` fails), it stays `undefined` and the header shows nothing; `headLabel` shows only the sides that differ from zero (`↑2 ↓3`, `^2 v3` in ASCII). The counts come from the **local** remote refs, with no network: what updates them is the fetch. The refs are re-read on every load, so checkout, merge and `r` already refresh them.

`f` runs `fetchAll` (`git fetch --all --prune` with `{network: true}`: no prompts, no controlling terminal, 2 min limit), injected as `Browser.fetch`. While it runs, `fetching` shows `fetching remotes…` in the header and a second `f` only warns; the list stays navigable. If it works, it does `reload(..., {follow: true, notice})`; if it fails, it shows the reason on one line (`summarizeGitError`, which drops the fetch summary and the hints) and **does not reload**. Authentication errors get the explanation that credentials must be available without a prompt. `--prune` deletes the remote refs that vanished on the origin, which is why it also moves the graph.

### Uncommitted changes

`streamCommits({uncommitted: true})` adds the changes node (`workingNode`): `git rev-parse HEAD` and `loadWorkingTree` (`git status --porcelain=v2`, counted by `parseStatus`: the index (X) counts in `staged`, the tree (Y) in `modified`, `?` in `untracked`, `u` in `conflicted`). With no changes, or with HEAD not in the list, nothing is inserted. The node is a synthetic `Commit` (`hash: 'uncommitted'`, `uncommitted: WorkingTree`, HEAD as its only parent) inserted **right above HEAD**, not at the top, for the same reason as the stash: at the top, with HEAD outside the newest commit, it would open a long lane down to it. If HEAD has stashes, the node goes above them (it is yielded just before them). The drawing reuses the stash's hollow node (`glyphs.ts`), `GraphRowView` swaps the hash for `working` and omits author and date, and `CommitDetail` shows a panel of its own. In `Browser`, `notACommit()` blocks `Enter`/`d`, the double click, `y`, `c` and `m` with a notice, because the `uncommitted` hash does not exist in git.

**`--no-optional-locks`.** A normal `git status` can rewrite the index (it refreshes the stat cache). With `--watch`, that would trigger a reload, which would run `status` again, and so on. There is a test checking that the index's `mtime` does not change. The cost is that status runs on every load (including the on-demand load and `r`); in huge repositories, `--no-uncommitted` avoids scanning the untracked files.

### Reload (`r` and `--watch`)

A reload is `loadCommits` + `loadRefs` in parallel, and inside `loadRefs` the questions to git are too (`Promise.all`): the cost is almost all process startup (from ~65 ms to ~11 ms in this repository). The `stash list` and HEAD, which both need, are read once by the caller and handed over (`LogOptions.known`, `Prefetched`).

`r` calls `reload(revs, limit, false, {follow: true, notice})`. With `follow`, after the load the cursor goes to `followCommit(rowsBefore, selected, rowsAfter)`: the same hash; otherwise the nearest ancestor still in the list (walking the parents); otherwise the same position. The "before" rows come from a ref (`latest`) updated on every render, because the promise resolves later and the closure's state would already be stale. The rest of the flow is the usual `reload`, so a newer request discards the previous one (`request`) and a failure becomes the footer error without replacing the list. Checkout (the partial one too), merge and abort also use `follow`, because the changes node and the commits brought in by the advance shift the rows; only the merge that creates a new commit goes to the first row. Work in flight is counted (`pending`: every reload and every git action increments it and decrements it once), so a reload finishing during a checkout cannot make the list look idle.

`--watch` turns on `watchRepository` (`git/watch.ts`): a non-recursive `fs.watch` on the git directory (and on the common one, in a linked worktree), filtering `HEAD`, `index`, `packed-refs` and the operation markers (`MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, `rebase-apply`; a `--quit` only removes the marker), plus a recursive `fs.watch` on `refs/`. A git command touches several files, so the events are debounced by 300 ms. `Browser` receives the source as `watch?: ChangeSource`, like `load` and `mouse`, and each event does the same reload as `r`. **Limit:** editing files in the working tree does not touch `.git`, so the count of the changes node only changes on the next `git add` or with `r`. **Careful:** what the TUI runs to reload itself must not change what is watched, or `--watch` goes into a loop. That is why the `git status` of the uncommitted changes uses `--no-optional-locks`, which stops git from rewriting the index.

### Copying the hash (`y`)

`Browser` receives `copy?: (text) => Promise<CopyMethod>` as a parameter (the CLI passes `copyText`). `copyText` (in `clipboard.ts`, with `platform`, `env`, `write` and `run` injectable for tests) first tries a native program, because the exit code says whether it worked; only then does it fall back to **OSC 52** (`ESC ] 52 ; c ; <base64> BEL`), written straight to stdout. Over SSH (`SSH_CONNECTION`/`SSH_TTY`) it skips the native programs, which would copy to the clipboard of the remote machine, and uses only OSC 52. The result reports the method: with `native` the footer confirms with the short hash; with `osc52`, which gets no reply and so cannot be confirmed, it shows the whole hash; if everything fails (or there is no `copy`), it shows the hash. There is no new dependency, and tmux only passes OSC 52 through with `set-clipboard on`.

### Mouse

A click selects the commit of the row, two clicks on the same commit within 400 ms (`DOUBLE_CLICK_MS` in `useDoubleClick.ts`; the terminal does not report the click count, so the hook keeps the last click in a ref) open the commit view, and the wheel moves the selection by 3 commits. Ink 8 has no mouse API: it reads stdin with `readable` + `read()` and drops the reports as unknown sequences, and a second `data` listener would fight it over the stream. That is why `enableTerminalMouse` (`terminalMouse.ts`) turns on modes 1000 (buttons and wheel) and 1006 (SGR encoding, with no 223-column limit) and **wraps `stdin.read`**: each chunk goes through `splitMouse`, the reports go to the listeners and the rest (keyboard) goes on to Ink; a chunk of reports only is skipped, so Ink does not receive empty input. A report cut in two between chunks (common when scrolling fast over ssh) is held back and joined with the next chunk, so its halves never reach the keyboard handling as typed text; only a started `ESC [ <` is held, so a bare Esc is never delayed. `dispose()` restores `read` and turns the modes off; the CLI calls it in a `finally` and there is an `exit` handler as a safety net, since the terminal mode outlives the process.

`Browser` receives `mouse?: MouseSource` as a parameter, like `load`, and subscribes once (the handler reads the latest state through a ref). The click becomes an index with `itemAt(heights, offset, row - LIST_TOP, listHeight)`: the connector line counts as part of the commit above, and clicking the header, the details or past the last commit does nothing. With a dialog open the mouse is ignored. With the commit view open `Browser` hands the same `MouseSource` to `CommitView`, which does its own row → region mapping (the message starts at row 5 and the file list right after it; `AREA_TOP` and the heights of `bodyHeight`/`filesHeight` must follow the screen layout): a click focuses the message or selects the file, a double click opens the file's diff, and the wheel scrolls the region under the pointer. With the `DiffView` open the mouse is ignored. Only the left button and the wheel are handled; releases, drags and the other buttons are dropped. With the mouse on, the terminal does not select text by dragging (use Shift, or `Option` on macOS, depending on the terminal); `--no-mouse` turns it all off.

### Commit view (files and diff)

The `CommitDetail` panel stays at 5 fixed lines. What the commit changed does not fit in it, so `Enter`/`d` swaps the whole screen for `CommitView` (`Browser` keeps only `viewing`; while it is open, `Browser`'s `useInput` ignores the keys and the view handles its own; it is keyed by the commit hash, so a reload that moves it to another commit starts from scratch). The view has a header, the full message (wrapped by `wrapText`, with scrolling) and the file list; `Tab` switches the focus between them. `Enter` opens the `DiffView` of the selected file (or of the commit, if the focus is on the message), `d` always the whole commit's; `Esc`/`q` goes back one level. While the `DiffView` is open, `CommitView`'s `useInput` is inactive (`isActive`).

The data come from `ChangesActions` (`files(commit)` and `diff(commit, file?)`), injected into `Browser` like `load` and `merge`. `loadChanges` runs `git diff-tree -r -M --raw --numstat -z <hash>^1 <hash>` (root commit: `--root <hash>`): comparing with the **first parent** makes a merge show what it brought into the branch and a stash show what it saved. With `-z` the names need no escaping, and `parseChanges` joins the `--raw` entries (status and paths) with the `--numstat` ones (binary comes as `-`, becomes `null`). `loadDiff` uses `diff-tree -p` with both paths of a renamed file (otherwise git shows a removal plus an addition) and cuts at `DIFF_MAX_LINES` (5000) so a huge commit does not freeze the screen; git still reads everything, the cut is only in the display. `gitChanges` keeps the 50 least recently used results (an LRU cache, `lruCache`: a hit renews the entry) by hash (commits do not change) and drops what failed. **Side by side.** A text file opens in two columns (before | after) with the whole file: `loadFullDiff` asks for the same `diff-tree -p` with `--unified=1000000`, which returns the whole file as a single hunk, and `alignDiff` (pure) turns that into aligned rows: context on both sides, and in each block of changes the n-th removed line sits next to the n-th added one (the shorter side stays blank). Each side carries its own line number; separate hunks (which does not happen with full context) get a `gap` row. Without color, the `-`/`+` marker in front of the number tells the lines apart. Scrolling is one for both sides, it opens on the first change and `n`/`N` jump between blocks (`changeStarts`). `u` switches to unified (`diff` with hunks); binary and the whole-commit diff are unified only. The side-by-side cut is `FULL_DIFF_MAX_LINES` (20000), because the whole file is shown. The columns have the same width and the text is cut by characters (UTF-16), so wide characters (CJK, emoji) can misalign the divider; there is no horizontal scrolling. A file that was only renamed, with no content change, has no hunk and shows a notice.

`classifyDiff` decides the color of each line by looking at the state (header up to the first `@@`), so a removed line `-- x` is not mistaken for the `---` header.

### Commit order

`loadCommits` accepts `order` (`COMMIT_ORDERS` in `log.ts`): `date` (default, `git log --date-order`), `author-date` and `topo` (`--topo-order`). All of them guarantee that no parent appears before its children, which the layout depends on. The choice changes the graph width a lot, because it decides how long each lane stays open: with `--topo-order` each line of history comes out whole before the next, so a merge opens a lane that waits for a distant commit; with `--date-order` the branch's commits stay near the merge that brought them in and the lanes are short. In a real history with ~90 commits and PRs from one feature branch, the width went from 14 columns (`topo`) to 2 (`date`), which is also what VS Code's Git Graph does by default. `--max-count` does not change the prefix of the list in the three orders (git sorts everything before cutting), which the on-demand loading requires; there is a test for that.

### Merge and current branch

The header shows `current: <branch>` (`headLabel`, in `format.ts`), coming from `RefInfo.head`, which `loadRefs` re-reads on every load; `head.merging` comes from `mergeInProgress` (existence of `.git/MERGE_HEAD`). `m` computes the sources with `mergeTargets`: the local and remote branches whose tip is the commit (the current one is left out), or the commit itself. Refusals without a prompt: a stash, a detached HEAD, and the HEAD commit. The confirmation (`MergePrompt`) runs `merge()`: `git merge --no-edit <ref>` (fast-forward when possible, otherwise a merge commit; the result `up-to-date | fast-forward | merged` becomes the footer notice). After success `Browser` reloads and **selects the first row** (the new commit), because the cursor index would change. Refusals from git (local changes, nonexistent ref) are a one-line error and change nothing.

**Conflicts.** If `git merge` fails and `MERGE_HEAD` exists, `merge()` throws `MergeConflictError` with the files (`git diff --name-only --diff-filter=U`) and leaves the merge in progress. `Browser` reloads (so the header warns) and opens `ConflictPrompt`: `a` aborts (`git merge --abort`), `d`/`Esc` leaves it in progress. Since the state lives in the repository and not in the TUI, `m` with `head.merging` reopens the same dialog, even if the merge started before the TUI was opened. `Browser` receives `merge: MergeActions` as a parameter, like `load` and `checkout`.

### Stashes

Each stash entry is a commit with 2 or 3 parents: the base commit and internal commits (the index and, with `-u`, untracked files). That is why `--all` excludes `refs/stash`. With `streamCommits({stashes: true})`, `stashNodes` (in `log.ts`) reads the entries (`loadStashes`) and yields each one as **one node** (`Commit.stash = true`) with **only the base commit as its parent**, right **above the base commit** and not at its date: that way it does not open a long lane from the top to the base, and the rows already shown do not shift when more history is loaded. Several stashes on the same base are stacked, from newest to oldest. A stash whose base is not in the list (`-n`, branch filter) is omitted. Failures reading the stash become "no stashes" so the graph does not go down. `loadRefs` labels each stash commit with `{kind: 'stash', name: 'stash@{n}'}`; a stash is not a branch, so it does not enter `branchNames` or `localBranchTips`. The drawing uses a hollow node (`○`, `o` in ASCII) and the label in magenta. In `Browser`, `c` on a stash row only shows a notice: a stash commit is not a row of history. `--no-stash` turns all of this off.

### Revisions, paths and -C

`parseCliArgs` splits argv at the first `--` (`util.parseArgs` does not say where it was): before it, the positionals are `revs`; after, `paths`. `-C <path>` (`directory`) becomes the `cwd` of every call to git; `cli.tsx` resolves it and refuses what is not a directory (code 2). The revisions are validated before anything else by `verifyRevisions` (`rev-parse --verify --quiet`, accepting `a..b`, `a...b`, `^a` and the `rev^!`, `rev^@` and `rev^-<n>` shorthands through `revisionNames`), so the error says which name is wrong and suggests `--`. Without `revs`, the log uses `--all` (without the stash); with `revs`, it uses `git log <revs> -- <paths>`. In the TUI the initial `revs` are the branch filter (`Browser.initialRevs`); in the pipe they apply directly. With `paths` the log carries `--parents`: without it `%P` shows the original parents, which the history pruning removed, and the layout would leave lanes waiting for commits that never arrive.

### Log filters

`LogFilters` (in `log.ts`) gathers `author`, `since`, `until`, `firstParent`, `hideRemotes` and `hideTags`; `LogOptions` inherits them and `CliOptions.filters` carries them from the CLI to `loadCommits`. Hiding remotes or tags swaps `--all` for `--branches` (+ `--tags`/`--remotes` for what stays) and `HEAD`, since `--all` cannot exclude a kind of ref; it only applies when `all` is used, that is, without explicit revisions. The trap is `%P`: `--first-parent` still prints all the parents of a merge and `--author`/`--since`/`--until` do not rewrite the parents (only path limiting does), so the parents would point at commits that are not in the list and the layout would leave lanes open waiting for them. `relink` fixes it: with `--first-parent` only the first parent stays, and with an author or date filter the parents missing from the list are dropped. The cost is that the filtered graph shows only the direct links between the commits that remained, without linking a commit to its nearest ancestor that also passed the filter. `describeFilters` produces the header labels (`Browser.filters`).

### Dates

`--date short|iso|relative` (`DateStyle`, in `ui/date.ts`) reaches the components through `Display.date` (optional, `short` when missing) and `formatPlain` through `date`. Everything goes through `formatDate(iso, style, {now, detail})`; `detail` is true in the single-commit panels (`CommitDetail`, `CommitView`), which have room for the time: `short` shows only the day in the list and day and time in the details, as before. The date is the author's, in the timezone it was recorded in (git's ISO text), without converting to the local timezone. The relative one uses `Intl.RelativeTimeFormat('en', {numeric: 'auto'})` (no dependency) with the largest unit that fits; hours and days are truncated and months and years rounded, like `git log --date=relative` (90 days are "3 months", not "2"). The clock is a parameter in the tests, but the TUI does not redraw just because time passed: the relative date updates on any render (key, `r`).

### Config file

`config.ts` reads `$XDG_CONFIG_HOME/gitgraph/config.json` (only if it is an absolute path, as the spec says; otherwise `~/.config`). JSON, no dependency. `parseConfig` validates with a key → rule table (`SCHEMA`) and **rejects unknown keys**, because a typo would be ignored silently; every message carries the file path and the key. A missing file is not an error (`ENOENT` → `{}`); other read failures are `ConfigError`.

`parseCliArgs(argv, env, config)` receives the file as a **function**, which only runs if the command line is not `--help`/`--version`, so a broken file does not stop you from reading the help. The precedence is defaults < file < flags. So that a flag can undo the file, each boolean has both forms (`toggle()` joins the pair; the negative wins if both come). `NO_COLOR` sits between the default and the file (the no-color.org spec lets the program's own configuration override it). `colors.lanes` reaches the components through `Display.lanes` and `laneColor(color, palette)`; the colors are validated (`isColor`: Ink names or `#rrggbb`). Configurable shortcuts were left out: they depend on a single key table, which `Browser` did not have yet.

### Options and errors

- **Arguments:** `parseCliArgs` uses `util.parseArgs` (no dependency). `-n/--max-count` is a hard ceiling: in the TUI it becomes the initial limit and the maximum of the on-demand loading (`Browser.maxCommits`); without it the TUI starts at 500 and grows, and the pipe prints everything.
- **Color:** `--no-color` or `NO_COLOR` turn off only the colors (`tint()`), but Ink/chalk reads `--no-color` from `argv` and turns off every style, inverse included. That is why the selected row also carries the `>` marker.
- **Connector line:** `--compact` turns `spaced` off (`Display.spaced`). The default (on) makes the graph more readable, but fewer commits fit per screen and the pipe output has more lines.
- **ASCII:** `--ascii` swaps the drawing characters (`toAscii` in `glyphs.ts`), the separator and the symbols of the texts. The `…` of truncation comes from Ink. The symbols of the texts (`separator`, `ellipsis`, `arrow`, `arrows`, `rule`) come from `ui/display.ts`; `tests/ui/ascii.test.ts` fails if a component has one of these characters on a line that does not choose by `display.ascii`.
- **Git errors:** `exec.ts` runs git with `LC_ALL=C` (the code recognizes messages like "does not have any commits" in any language) and translates "not a git repository" and `ENOENT` (git missing). `cli.tsx` exits with 2 on a usage error and 1 on the others; a repository with no commits is not an error.
- **Language:** the interface, the messages and the documentation are in English. The code recognizes git's output (always English because of `LC_ALL=C`), never its own messages.
