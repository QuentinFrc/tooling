# repo-report

Generate a Markdown + Mermaid report for a Turborepo-style monorepo (`apps/` & `packages/`).

The report covers the internal dependency graph plus per-package stats: dependency
counts, lines of code / file counts, graph metrics (depth, fan-in/out, cycles, orphans),
and git activity (last commit, commit count).

## Usage

```bash
repo-report                 # analyze the current repo, write ./repo-report.md
repo-report ../some/repo    # analyze another repo
repo-report -o docs/deps.md # custom output path
repo-report --stdout        # print to stdout instead of writing a file
repo-report --json          # also emit raw graph data as JSON
repo-report --no-git        # skip git activity stats
```

The repo root is detected by walking up to a `pnpm-workspace.yaml`, `turbo.json`, or a
`package.json` with `workspaces`. Workspace globs (`packages/*`, `apps/*`, `**`, …) are
expanded to find packages.

## What's in the report

- **Overview** — totals for apps, packages, LOC, files, edges, external deps, depth, cycles, orphans.
- **Dependency graph** — a Mermaid `graph LR` (renders on GitHub), apps in blue, packages in green.
- **Packages** — a table of every package with its stats.
- **Highlights** — circular dependencies, orphan packages, most depended-on, largest, and most active.

## Install

```bash
pnpm --filter repo-report build
pnpm --filter repo-report link:install
```
