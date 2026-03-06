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
| `wt add <branch>` | Create a new worktree with a new branch |
| `wt rm [name]` | Remove a worktree (interactive if no name) |
| `wt ls`        | List worktrees with metadata               |
| `wt cd [name]` | Navigate to a worktree                     |
| `wt root`      | Go back to the main repo                   |
| `wt ide [name]`| Open a worktree in IDE                     |
| `wt tab [name]`| Open a worktree in a new Ghostty tab       |
| `wt clean`     | Interactively remove merged/idle/stale worktrees |
| `wt nuke`      | Remove ALL worktrees across all projects   |

## Configuration

| Variable  | Default                  | Description              |
| --------- | ------------------------ | ------------------------ |
| `WT_ROOT` | `/Volumes/Dev/worktrees` | Root directory for worktrees |
| `WT_IDE`  | `cursor`                 | Command to open IDE      |

## Documentation

See the [`docs/`](./docs/) folder:

- [Architecture](./docs/architecture.md) — project structure and module responsibilities
- [Classification](./docs/classification.md) — how worktrees are analyzed and tiered
- [Shell integration](./docs/shell-integration.md) — the `wt.sh` wrapper and why it exists
