# Architecture

## Entry point

`src/bin.ts` is the single entry point, bundled by tsup into `dist/bin.js` with a shebang. It sets up all commands using Commander.

## Modules

```
src/
├── bin.ts          # CLI entry — commander setup, routes to commands
├── config.ts       # Resolves WT_ROOT, project name, project worktree dir
├── copy.ts         # Copy-hook engine: glob patterns → untracked paths → copy into worktrees
├── prepare.ts      # Package-manager detection + install, run on worktree creation
├── remove.ts       # Local worktree teardown shared by `rm` and `close`
├── git.ts          # Low-level git primitives via execa
├── classify.ts     # Worktree analysis and tier classification
├── types.ts        # Shared TypeScript types
└── commands/       # One file per command
```

### config.ts

Resolves three values:

- **`wtRoot`** — from `WT_ROOT` env var, defaults to `/Volumes/Dev/worktrees`
- **`project`** — `basename` of `git rev-parse --show-toplevel`
- **`projectWtDir`** — `{wtRoot}/{project}`

Throws if not inside a git repository.

### git.ts

Thin wrappers around git commands using `execa`. Every function takes an explicit `cwd` — no global state, no shell invocations. Key functions:

- `getProjectRoot()` — git toplevel
- `fetch()` / `worktreePrune()` — maintenance
- `worktreeAdd()` / `worktreeRemove()` — worktree CRUD
- `branchCurrent()` / `statusPorcelain()` — status info
- `revListCount()` / `hasUpstream()` — commit analysis
- `mergeBase()` / `commitTree()` / `cherry()` — squash merge detection
- `revParseTree()` — tree object resolution

### classify.ts

See [classification.md](./classification.md) for the full algorithm.

### commands/

Each command is a single exported `async function`. Commands that need interactive input use `@clack/prompts`. Commands that need a worktree picker (`rm`, `cd`) accept an optional `name` argument — if omitted, they show a Clack `select()` prompt.

### copy.ts

Implements the copy hooks: `.wt.json`'s `copy` field holds glob patterns, expanded against `git ls-files --others` output (untracked + ignored paths, fully-ignored directories collapsed) so tracked files are never copied. A small in-house glob matcher is used because Node's `fs.globSync` does not match dotfiles through `**`. Worktree creation (`add`, `agent`, via `setup-worktree.ts`) applies the patterns without overwriting; `wt copy` re-applies them with overwrite. Legacy `envFiles`/`ideDirs` config fields are still read as fallback patterns.

The PR lifecycle is split into single-purpose commands: `release` (commit/push/rebase/open PR) and `review` (post a Claude self-review) are separate so a follow-up can be released without re-reviewing, and vice versa. `close` (merge + teardown) and `rm` (local teardown only) share the worktree-removal logic in `remove.ts` — `rm` is `close` minus the merge.

## Build

tsup bundles everything into a single ESM file targeting Node 20. The shebang is injected via the `banner` option in `tsup.config.ts`.
