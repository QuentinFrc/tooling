# wt-cli

Git worktree manager CLI. Replaces the `~/.zsh/git.zsh` shell script with a proper Node.js CLI using interactive prompts.

## Install

```bash
cd packages/wt-cli
pnpm run link:install
```

This builds the CLI, links the `wt-cli` binary globally, and prints the `source` line to add to your `.zshrc` for shell integration (`cd`/`root` commands).

## Usage

```
wt <command> [args]
```

| Command        | Description                                |
| -------------- | ------------------------------------------ |
| `wt setup`     | Create project folder on WT_ROOT           |
| `wt add [prompt]` | Create a new worktree (Claude picks the branch from your prompt; opens `$EDITOR` if no prompt) |
| `wt rm [name]` | Remove a worktree (interactive if no name) |
| `wt ls`        | List worktrees with metadata               |
| `wt cd [name]` | Navigate to a worktree                     |
| `wt root`      | Go back to the main repo                   |
| `wt ide [name]`| Open a worktree in IDE                     |
| `wt tab [name]`| Open a worktree in a new Ghostty tab       |
| `wt nuke`      | Remove ALL worktrees across all projects   |
| `wt scan`      | Reconcile git worktrees with `.wt.json` (adopt orphans, drop stale entries) |
| `wt prune`     | Interactively prune worktrees and/or local branches (`--no-worktrees`, `--no-branches`) |
| `wt agent [prompt]` | Create worktree + plan from a prompt via Claude |
| `wt go`        | Launch interactive Claude using the local PLAN.md/AUDIT.md |
| `wt release`   | Commit, push, rebase if behind, open PR, post Claude review |
| `wt followup`  | Pull PR reviews + comments, launch interactive Claude to address them |
| `wt close`     | Merge the PR, remove the worktree, and cd back to main repo |

## Configuration

| Variable  | Default                  | Description              |
| --------- | ------------------------ | ------------------------ |
| `WT_ROOT` | `/Volumes/Dev/worktrees` | Root directory for worktrees |
| `WT_IDE`  | `cursor`                 | Command to open IDE      |

### Agent settings (`.wt.json` → `agent`)

| Field             | Default              | Description                                       |
| ----------------- | -------------------- | ------------------------------------------------- |
| `rebaseThreshold` | `0`                  | Rebase if behind target by more than N commits    |
| `slugModel`       | `claude-sonnet-4-6`  | Model used to pick branch name + kind             |
| `planModel`       | `claude-opus-4-7`    | Model used to generate `PLAN.md`/`AUDIT.md`       |
| `prModel`         | `claude-sonnet-4-6`  | Model used to generate commit + PR description    |
| `reviewModel`     | `claude-opus-4-7`    | Model used to review the PR                       |

`wt add` and `wt agent` require `claude` on `PATH`. `wt release` requires both `claude` and `gh`.

### Agent flow

```
wt agent "<prompt>"        # creates worktree, generates PLAN.md/AUDIT.md, cds in
wt go                      # interactive Claude session implementing the plan
wt release                 # commit + push + rebase + PR + Claude self-review comment
wt followup                # interactive Claude to address PR reviews/comments
wt release                 # push the follow-up + new self-review
wt close                   # merge PR + remove worktree + cd back to main repo
```

`PLAN.md` / `AUDIT.md` are gitignored locally (per-worktree `.git/info/exclude`) and removed by `wt release`.

## Documentation

See the [`docs/`](./docs/) folder:

- [Architecture](./docs/architecture.md) — project structure and module responsibilities
- [Classification](./docs/classification.md) — how worktrees are analyzed and tiered
- [Shell integration](./docs/shell-integration.md) — the `wt.sh` wrapper and why it exists
