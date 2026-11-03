# gitgraph

A CLI that shows the branch and commit graph of a git repository in the terminal.
In a terminal the interface is interactive; with the output redirected, it prints plain text.

```
●      be7c08a (HEAD -> main) octopus  Ana, 2026-10-28
├─┬─╮
│ │ ●  baf5f20 (b2) b2  Ana, 2026-10-28
│ ● │  5f7e4d6 (b1) b1  Ana, 2026-10-28
│ │╱
● │    05c7c80 main 2  Ana, 2026-10-28
│╱
●      d6cda52 (tag: v1) merge hotfix  Ana, 2026-10-28
```

## Requirements

- Node.js 22 or newer (required by Ink).
- `git` 2.31 or newer in the `PATH` (checkout uses `git switch`, from 2.23, and `--watch` uses `rev-parse --path-format`, from 2.31).

## Installation

```sh
npm install -g git-graph-tui   # installs the `gitgraph` command
gitgraph --version
```

Or without installing: `npx git-graph-tui` (it runs the same command).

The package is called `git-graph-tui` because the name `gitgraph` already belongs to another package on npm; the command is still `gitgraph`.

### From source

```sh
npm install
npm run build
npm link      # optional: makes the `gitgraph` command available
```

Without `npm link`, use `node dist/cli.js` inside the repository you want to look at, or `npm run dev` while developing. How to publish a version: `docs/ia/conventions/release.md`.

## Usage

```sh
gitgraph [options] [<revision>...] [-- <path>...]
```

| Option | Effect |
| --- | --- |
| `--author <pattern>` | Only commits whose author matches the pattern (regular expression, as in `git log --author`). |
| `--since <date>`, `--until <date>` | Only commits after / up to the date (`"2 weeks ago"`, `2026-01-31`; git ignores dates in the future). |
| `--first-parent` | Follow only the first parent of each merge: shows the history of the main branch without the commits that came in through merges. |
| `--no-remotes`, `--no-tags` | Hide the remote branches / the tags from the "all refs" listing (they do not apply with explicit revisions). |
| `-C <path>` | Open the repository in another directory, without a `cd` (like `git -C`). |
| `-n`, `--max-count <n>` | Show at most `n` commits. Without it, the interface loads 500 and fetches more as you go down, and the pipe output prints everything. |
| `--no-color` | Turn the colors off (the `NO_COLOR` variable works too). |
| `--ascii` | Use only ASCII characters in the graph and in the interface symbols. |
| `--compact` | One line per commit, without the connector line (`│`) between them. By default, consecutive commits are joined by a stroke, which takes more lines. |
| `--date <format>` | Date format: `short` (default: `2026-03-04` in the list and `2026-03-04 10:00` in the details), `iso` (date and time everywhere) or `relative` (`3 days ago`, `yesterday`; in the details, with the exact time in parentheses). It also applies to the pipe. The date is the author's, in the timezone it was recorded in. |
| `--order <order>` | Commit order: `date` (default, by commit date), `author-date` (by author date) or `topo` (keeps each line of history together). Ordering by date interleaves the branches and makes the graph much narrower; `topo` can be better in histories with a few long simultaneous branches. |
| `--no-stash` | Do not show the stashes in the graph. |
| `--watch` | Reload the graph by itself when the repository changes outside the interface (a commit, a checkout or a fetch in another terminal). It watches `HEAD`, the index, `packed-refs`, the markers of an operation in progress and `refs/`, with a 300 ms wait. Editing files alone does not trigger it. Without the option, use `r`. |
| `--no-uncommitted` | Do not show the uncommitted changes node (`--uncommitted` shows it, and is the default). |
| `--no-mouse` | Turn mouse support off (see below). |
| `-h`, `--help` | Show the help. |
| `-v`, `--version` | Show the version. |

**Revisions and paths.** With no arguments, it shows all local and remote branches and the tags. With revisions (`gitgraph main feature-x`, `gitgraph v1.0..main`, a hash), it shows only what they reach; in the interface they become the initial branch filter (`/` changes it). After `--`, it limits the history to the commits that touched the paths (`gitgraph -- src/`), with the graph relinked between the remaining commits. The filters above combine with each other, work in the interface and in the pipe, and show in magenta in the header (`author Ana, no tags`). With `--author`/`--since`/`--until` the remaining commits are left without a link to the hidden ones: the graph shows only the links between them. A nonexistent revision is an error (`unknown revision: x`); `--` separates revisions from paths when a name is ambiguous. Revisions work in the pipe output too.

If the repository has uncommitted changes, a hollow node (`○`, `o` with `--ascii`) labeled `working` appears right above the HEAD commit (and above its stashes) with the count of files: `Uncommitted changes (2 staged, 1 modified, 3 untracked)`. A file with changes in the index and outside it counts in both categories, and conflicts show separately. The node only exists if there are changes and HEAD is in the list (a branch filter or `-n` can hide it); `r` updates it, and it is not a commit: `Enter`, `y`, `c` and `m` only warn. The details panel says which HEAD it sits on. Each **stash** appears as a hollow node (`○`, `o` with `--ascii`) with the label `(stash@{0})`, right above the commit it was made on; the internal commits git creates for the stash (index and untracked files) stay hidden. A stash only appears if its base commit is in the list (for example `-n` can cut it, and so can a branch filter that does not include the base commit). Use `--no-stash` to hide them.

### Scope

`gitgraph` is a history viewer with a few actions (checkout, merge, stash, branches and tags, fetch, cherry-pick, revert and reset), not a full git client. **It does not start a rebase**, on purpose: a rebase rewrites several commits and stops on conflicts in series, which asks for a longer flow than one question. If a rebase (or cherry-pick, revert or merge) is **stopped or in progress** in the repository, for example started in another terminal, the header shows `(rebase in progress)` and `m` opens a dialog to **abort** (`a`), **continue** (`c`, after resolving the conflicts in the terminal), **skip the step** (`s`) or **leave it** (`d`/`Esc`). The commit message is always the one git proposes: the TUI does not open an editor.

### Config file

Defaults can go in `$XDG_CONFIG_HOME/gitgraph/config.json` (or `~/.config/gitgraph/config.json`). Every key is optional:

```json
{
  "order": "date",
  "date": "relative",
  "compact": false,
  "ascii": false,
  "color": true,
  "stash": true,
  "mouse": true,
  "watch": false,
  "maxCount": 500,
  "colors": {"lanes": ["cyan", "magenta", "#ff8800", "greenBright"]}
}
```

The precedence is **the program's defaults < the file < command line options**. So that a command line option can undo the file, every on/off option has both forms: `--compact`/`--no-compact`, `--ascii`/`--no-ascii`, `--color`/`--no-color`, `--stash`/`--no-stash`, `--mouse`/`--no-mouse` and `--watch`/`--no-watch` (if both come, the negative wins). The `NO_COLOR` variable sits between the default and the file: the file (`"color": true`) and `--color` override it. `colors.lanes` replaces the colors of the graph lanes, used in order and repeated (names like `red` and `cyanBright`, or `#rrggbb`). An invalid file is an error with the file name and the key (an unknown key too, so a typo does not pass silently); `--help` and `--version` work anyway. **Keyboard shortcuts are not configurable yet**: that comes after the key table is a single one (see the help screen).

### Keys (interactive mode)

The footer shows only the main ones; **`?` opens the full list** inside the interface and `gitgraph --help` prints it along with the options. All three come from the same table (`src/ui/keymap.ts`), so they do not drift apart.

| Key | Action |
| --- | --- |
| `j` / `↓`, `k` / `↑` | Move the selection |
| `PgDn`, `PgUp` | Move one page |
| `Enter` / `d` | Open the full-screen **commit view**: the whole message, changed files (status `A`/`M`/`D`/`R`, `+`/`-` lines, `bin` for binaries) and the diff. `Tab` switches between the message and the files; `j`/`k`/`PgUp`/`PgDn`/`g`/`G` move or scroll. In it, `Enter` opens the selected file **side by side**: the previous version on the left, the new one on the right, the whole file aligned, with removed (`-`, red) and added (`+`, green) lines highlighted; it opens on the first change, and `n`/`N` jump to the next/previous one. `u` switches to the unified diff (`@@` hunks); binary files open straight in unified. `d` shows the unified diff of the whole commit. `Esc`/`q` goes back (from the diff to the view, from the view to the list). On a merge or stash the diff is against the first parent. Commit diffs with more than 5000 lines (20000 side by side) are cut, with a notice. Long lines are truncated, with no horizontal scrolling. |
| `c` | Check out the selected commit, with confirmation (`Enter`/`y` confirms, `Esc`/`n` cancels). Switches to the local branch that points at the commit (a list, if there are several) or leaves HEAD detached on it. On a stash, it only warns that checkout is not possible. If the commit is the tip of a remote branch (`origin/x`) and the local branch `x` is at another commit, the list also offers **`x` and advance** to `origin/x`. |
| `h` / `←`, `l` / `→` | **Scroll the graph** sideways (2 columns at a time) when it is wider than the terminal. The graph area is limited so the commit text (hash, subject, author) stays visible; the header shows `graph 5-30/50 (h/l)` with the columns in view. Moving the selection to a commit outside the window brings it back to its node. On narrow graphs, it does nothing. |
| `g` / `Home`, `G` / `End` | Go to the start, to the end |
| `m` | With a stopped operation (cherry-pick, revert, rebase): opens the dialog to abort, continue, skip or leave it. Otherwise, merge into the current branch, with confirmation (`Enter`/`y` confirms, `Esc`/`n` cancels): of the branch that points at the selected commit (a list, if there are several, remote ones included) or of the commit itself. On a conflict, you choose between aborting and leaving it in progress. |
| `C` / `v` | **Cherry-pick** / **revert** the selected commit on the current branch, with confirmation (`Enter`/`y`). It creates a new commit (the message is the original one for cherry-pick and git's for revert: the TUI does not open an editor). On a merge commit it uses the 1st parent (`-m 1`). If it stops on **conflicts** (or on an empty result), the dialog of the operation in progress opens by itself: abort, continue, skip or leave. Local changes in the way make git refuse without changing anything. |
| `X` | **Reset** the current branch to the selected commit: `--soft` (keeps the index and the files), `--mixed` (keeps the files, unstages the changes) or `--hard`. The title shows the effect first: how many commits leave the branch and how many of them stay only in the reflog (no other ref reaches them). `--hard` also shows how many modified files will be discarded and only runs if you **type the branch name** (`discard`, with a detached HEAD). |
| `b` / `t` / `T` | Create a **branch** / a **tag** / an **annotated tag** (it also asks for the message) at the selected commit, without switching branches. Type the name and `Enter`; the name is validated with `git check-ref-format` (no spaces, `..`, `~`, `^`, `:`) and refused if it already exists. `Esc` cancels. |
| `R` | **Rename** a local branch (the current one included) or a tag of the selected commit; with several refs on the commit, it asks which. A renamed annotated tag gets a new tag object with the same message and tagger; signed tags are refused. Remote branches are not edited. |
| `D` | **Delete** a local branch or a tag of the commit, with confirmation. The current branch does not show up (git refuses). A branch that is **not merged** is refused by `git branch -d`: the screen says how many commits only it has and only deletes it (`-D`) if you type its name. |
| `a` / `p` / `x` | On a **stash**: `a` applies (`git stash apply`, the stash stays stored), `p` pops (applies and removes) and `x` drops (`git stash drop`, with confirmation: `Enter`/`y` confirms, `Esc`/`n` cancels; git does not give a dropped stash back). The stash is found by the hash of its commit, not by the number `stash@{n}`, which changes when another stash is created or removed, even in another terminal; if it is already gone, nothing is touched. If local changes are in the way, git refuses and nothing changes. With **conflicts**, the markers stay in the files, the stash is kept and the footer lists the files for you to resolve in the terminal. After each operation the graph is reloaded (the changes show up in the `working` node). |
| `f` | Fetch the remotes (`git fetch --all --prune`) in the background, without freezing the interface: the header shows `fetching remotes…` and, when it finishes, the graph is reloaded keeping the selection. No terminal prompts: the credentials must be available (ssh-agent, credential helper), otherwise the footer shows the error and how to fix it; 2-minute limit. |
| `y` | Copy the full hash of the selected commit to the clipboard. It uses `pbcopy` (macOS), `wl-copy`/`xclip`/`xsel` (Linux, depending on `WAYLAND_DISPLAY`/`DISPLAY`) or `clip` (Windows) and confirms in the footer. Over SSH, or if no program exists, it uses the terminal's **OSC 52** sequence; since it gets no reply, the footer shows the whole hash so you can take it by hand if nothing pastes. Inside tmux you need `set -g set-clipboard on`. |
| `r` | Reload the graph (log, refs and stashes) keeping the selected commit by its hash; if it is gone (reset, deleted branch), go to the nearest ancestor still in the list. The footer says `updated`. |
| `s` | Search commits by message (subject and body), author, e-mail or hash, case-insensitively: type and the selection jumps to the first result from where you were; `Enter` confirms, `Esc` cancels and goes back. |
| `n` / `N` | Next / previous search result (`n` loads more history if needed; at the end of the history they wrap to the other side). `Esc` clears the search. |
| `/` | Filter by one or more branches: type to search, `↑`/`↓` move, `Space` marks/unmarks, `Enter` applies, `Esc` cancels |
| `?` | Open the **help screen** with every key (scroll with `j`/`k`/`PgUp`/`PgDn`; `?`, `Esc` or `q` close it). The same list is printed by `gitgraph --help`. |
| `q` | Quit |

**Mouse.** Click a commit to select it, **double click** to open the commit view (like `Enter`) and use the wheel to move the selection (3 commits per step). In the **commit view**, click a file to select it (or the message, to focus it), double click to open its diff and use the wheel to scroll the message or move the file selection. With a dialog or the diff open, the mouse is ignored. With the mouse on, the terminal does not select text by dragging; hold `Shift` (`Option` in iTerm2 and in the macOS Terminal) or use `--no-mouse`.

**Search (`s`).** The header shows `search "text" 3/12` (the cursor position among the results and the total; `-` when the cursor is not on a result) and the matching commits get their subject in yellow and bold, with `*` in place of the `>` marker (so it also works with `--no-color`). The search matches in memory, but it **reaches history that is not loaded yet**: if `Enter` finds nothing among the loaded commits, or `n` goes past the last loaded result, the list is loaded in steps (the limit doubles each time) until a match shows up or the history ends; the footer shows `looking for "x" in the history…` and `Esc` cancels. When the history ends, the search goes back to the first result or says there is none. With `-n`, the ceiling holds (nothing is loaded past it). A `+` after the total says there is more history to load. `N` (previous) only moves among the results already loaded. Changing the branch filter (`/`) keeps the search and applies it to the new list. The search is on `s` because `/` is already the branch filter.

The panel below the list shows the details of the selected commit.

In the filter (`/`), mark as many branches as you like with `Space`: the graph shows the commits reachable from any of them (the union, like `git log a b`). `Enter` applies the marked ones; with none marked, it applies the highlighted branch. The marks stay while you type to filter the list, and reopening the picker shows the current filter marked. To go back to all branches, press `Space` on "(all branches)" and `Enter`.

When the local branch is behind the remote, the `c` list brings three options: `x and advance to origin/x` (already selected), `x (no advance)` and a detached HEAD at the commit. Advancing is `git merge --ff-only origin/x`: it only moves by fast-forward (never a merge or a rebase), reaches exactly the commit you chose and **does not use the network** (to bring new commits from the remote, press `f`). If the branches diverged, or local changes would be overwritten, git refuses; since the branch switch already happened, the message says "checked out x, but could not advance to origin/x: ...".

The header shows the **current branch** (`current: main`; with a detached HEAD, `current: detached HEAD at abc1234`) and warns when a merge is in progress. It follows checkouts and merges. Next to the name, `↑2 ↓3` says how many commits the branch has more and fewer than the remote it tracks (`^2 v3` with `--ascii`); nothing shows without an upstream, with both sides equal or with the upstream deleted on the remote. The counts use the remote refs already downloaded, so `f` (fetch) updates them.

**Merge (`m`).** It is the normal `git merge --no-edit`: it fast-forwards when it can and otherwise makes a merge commit with git's automatic message (the TUI does not open an editor). The source is the branch whose tip is the selected commit (local and remote, except the current one); with none, the commit itself. It does not merge on a stash, with a detached HEAD, or the commit the current branch is already on. If git refuses (for example, local changes would be overwritten), nothing changes and the message shows in the footer. If there are **conflicts**, the merge stays in progress, the header says so and a dialog lists the files and offers: `a` abort (`git merge --abort`, which restores everything) or `d`/`Esc` leave it in progress for you to resolve in the terminal. Even after leaving it in progress, `m` reopens the dialog to abort. If a merge commit needs a GPG signature with a passphrase, the passphrase prompt can mess up the screen.

Checkout never uses `--force`: if there are local changes that would be overwritten (or the branch is in use in another worktree), git refuses, nothing changes and the message shows in the footer.

### Pipe output

Outside a terminal, the graph comes out as plain text, with no color and no wrapping, like `git log`:

```sh
gitgraph | less
gitgraph -n 20 > graph.txt
```

### Notes

- `--no-color` also turns off bold and dim (Ink treats the flag that way). The selected line stays marked with `>`.
- `--ascii` does not strip accents from the texts; the truncation of long lines uses `…`, which comes from Ink.
- Exit codes: `0` success, `1` error (outside a repository, `git` missing...), `2` usage error.

## Development

```sh
npm run dev        # runs the CLI with tsx
npm test           # tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # produces dist/
```

The architecture and the conventions are in [`docs/ia/`](docs/ia/ARCHITECTURE.md).

## License

[MIT](LICENSE)
