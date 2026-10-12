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
| `wt add [name]` | Create a worktree for the branch (prompts if omitted). Existing branches are reused: local ones fast-forwarded to origin, remote-only ones checked out with tracking; otherwise a new branch is created from the base |
| `wt rm [name]` | Remove a worktree locally — no merge (defaults to the current worktree, cds back). With an explicit name, removes without confirmation (agent/script friendly) |
| `wt ls`        | List worktrees (one line each: diff vs base, dirty, push state) |
| `wt cd [name]` | Navigate to a worktree                     |
| `wt root`      | Go back to the main repo                   |
| `wt copy [name]` | Copy configured files (env vars, etc.) from the main repo into worktrees (`--add <pattern>`, `--list`) |
| `wt scan`      | Reconcile git worktrees with `.wt.json` (adopt orphans, drop stale entries; opt-in: move external worktrees under `WT_ROOT`, create worktrees for open PRs that have none) |
| `wt sync-pr`   | Create a worktree for each open GitHub PR, fast-forward existing ones (`--mine` for your PRs only; skips forks, dirty or diverged worktrees) |
| `wt update`    | Self-update: pull the tooling repo (fast-forward only) and rebuild wt-cli |
| `wt prune`     | Interactively prune worktrees and/or local branches (`--no-worktrees`, `--no-branches`); `main`, `master`, `dev` and `develop` are never offered |
| `wt agent [prompt]` | Create worktree + plan from a prompt via Claude |
| `wt go`        | Launch interactive Claude using the local PLAN.md/AUDIT.md |
| `wt rebase`    | Rebase the current worktree onto the latest base branch |
| `wt release`   | Commit, push, rebase if behind, and open the PR |
| `wt review`    | Generate a Claude self-review and post it on the PR |
| `wt followup`  | Pull PR reviews + comments, launch interactive Claude to address them |
| `wt close`     | Merge the PR, remove the worktree, and cd back to main repo |

## Configuration

| Variable  | Default                  | Description              |
| --------- | ------------------------ | ------------------------ |
| `WT_ROOT` | `/Volumes/Dev/worktrees` | Root directory for worktrees |

### Copy hooks (`.wt.json` → `copy`)

`copy` is a list of glob patterns (relative to the main repo) copied into each worktree on creation (`wt add`, `wt agent`). `wt setup` seeds it with `**/.env*` plus any untracked IDE directory (`.idea`, `.vscode`, …). When nothing is configured (no `copy` field, empty legacy `envFiles`/`ideDirs`), `**/.env*` is the implicit default; set `"copy": []` to disable copying entirely.

- Only paths **git does not track** are considered (tracked files come with the checkout) — so `**/.env*` never copies a committed `.env.example`.
- `wt copy` re-applies the patterns to all worktrees (or one), overwriting stale copies.
- `wt copy --add "secrets/**"` appends a pattern; `wt copy --list` shows patterns and what they currently match.

### Agent settings (`.wt.json` → `agent`)

| Field             | Default              | Description                                       |
| ----------------- | -------------------- | ------------------------------------------------- |
| `rebaseThreshold` | `0`                  | Rebase if behind target by more than N commits    |
| `slugModel`       | `claude-sonnet-4-6`  | Model used to pick branch name + kind             |
| `planModel`       | `claude-opus-4-7`    | Model used to generate `PLAN.md`/`AUDIT.md`       |
| `prModel`         | `claude-sonnet-4-6`  | Model used to generate commit + PR description    |
| `reviewModel`     | `claude-opus-4-7`    | Model used to review the PR                       |

`wt agent` requires `claude` on `PATH`. `wt release` and `wt review` require both `claude` and `gh`. `wt sync-pr` requires `gh`.

### Agent flow

```
wt agent "<prompt>"        # creates worktree, generates PLAN.md/AUDIT.md, cds in
wt go                      # interactive Claude session implementing the plan
wt rebase                  # (optional) rebase onto the latest base branch
wt release                 # commit + push + rebase + open PR
wt review                  # post a Claude self-review comment on the PR
wt followup                # interactive Claude to address PR reviews/comments
wt release && wt review    # push the follow-up + new self-review
wt close                   # merge PR + remove worktree + cd back to main repo
wt rm                      # abandon the worktree locally instead (no merge)
```

`PLAN.md` / `AUDIT.md` are gitignored locally (per-worktree `.git/info/exclude`) and removed by `wt release`.

## Documentation

See the [`docs/`](./docs/) folder:

- [Architecture](./docs/architecture.md) — project structure and module responsibilities
- [Classification](./docs/classification.md) — how worktrees are analyzed and tiered
- [Shell integration](./docs/shell-integration.md) — the `wt.sh` wrapper and why it exists
