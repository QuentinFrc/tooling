# tooling

Internal monorepo for CLI tools and shared packages.

## Stack

- **Runtime:** Node.js (ESM)
- **Language:** TypeScript
- **Monorepo:** pnpm workspaces + Turborepo
- **Build:** tsup

## Structure

```
packages/
  wt-cli/    # Git worktree manager
```

All packages (shared libraries and CLIs) live under `packages/`.

## Getting started

```bash
pnpm install
pnpm turbo build
```

## Adding a new package

```bash
mkdir -p packages/my-package/src
```

Create a `package.json`, extend `tsconfig.base.json`, and it'll be picked up automatically by pnpm workspaces and turbo.
