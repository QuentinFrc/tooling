# Shell Integration

## The problem

A Node.js process cannot change the working directory of its parent shell. This means `wt cd` and `wt root` can't actually navigate anywhere if called directly as a CLI.

## The solution

Two pieces work together:

### 1. The CLI (`wt-cli cd` / `wt-cli root`)

These commands write the target path to stdout and exit. No newline, no decoration — just the raw path.

- `wt-cli cd my-branch` → prints `/Volumes/Dev/worktrees/project/my-branch`
- `wt-cli cd` (no arg) → shows an interactive picker, then prints the selected path
- `wt-cli root` → prints the main worktree path

### 2. The shell wrapper (`shell/wt.sh`)

A thin zsh function that intercepts `cd` and `root` commands:

```bash
wt() {
  if [[ "$1" == "cd" || "$1" == "root" ]]; then
    local target
    target=$(command wt-cli "$@" 2>/dev/null)
    if [[ -n "$target" && -d "$target" ]]; then
      cd "$target"
    else
      command wt-cli "$@"
    fi
  else
    command wt-cli "$@"
  fi
}
```

For `cd`/`root`, it captures the CLI output and performs the actual `cd`. For all other commands, it passes through directly to `wt-cli`.

## Setup

Add to your `~/.zshrc`:

```bash
source /path/to/tooling/packages/wt-cli/shell/wt.sh
```

This creates the `wt` shell function which shadows any `wt` alias or binary.
