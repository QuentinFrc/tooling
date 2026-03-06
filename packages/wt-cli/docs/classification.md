# Worktree Classification

`wt clean` classifies each worktree into tiers to decide what can be safely removed. The logic lives in `src/classify.ts`.

## Tiers

| Tier       | Criteria                                         | Risk     |
| ---------- | ------------------------------------------------ | -------- |
| **Merged** | Branch merged into `origin/main` or `origin/develop` (regular or squash) + clean working tree | None     |
| **Idle**   | 0 commits ahead of `origin/main` or `origin/develop` + clean working tree | None     |
| **Stale**  | All commits pushed to upstream, not merged + clean working tree | Low      |
| **Kept**   | Dirty working tree or unpushed commits           | Skipped  |

## Algorithm

For each directory in `{projectWtDir}/`:

1. **Dirty check** — `git status --porcelain` count > 0 → **kept** (reason: `dirty`)
2. **Merged check** — `isMerged(path, "origin/main")` or `isMerged(path, "origin/develop")` → **merged**
3. **Idle check** — `rev-list origin/main..HEAD --count` is 0 or same for develop → **idle**
4. **Pushed check** — has upstream tracking branch and `rev-list @{u}..HEAD --count` is 0 → **stale**
5. **Fallthrough** → **kept** (reason: `unpushed`)

## Squash merge detection

Regular merge detection (`rev-list ref..HEAD --count == 0`) misses squash merges. The `isMerged()` function handles this:

1. Find the merge base between the ref and HEAD
2. Create a temporary commit object with HEAD's tree and the merge base as parent
3. Use `git cherry` to check if this commit's changes are already in the ref
4. If `cherry` returns a line starting with `-`, the changes are present → squash-merged

This is the same algorithm used in the original zsh `_wt_is_merged` function.

## Clean prompt

After classification, `wt clean` presents a cumulative selection:

- If only merged worktrees exist → simple `confirm()` prompt
- If multiple tiers exist → `select()` with cumulative options:
  ```
  [1] Merged only (2)
  [2] + Idle (3 total)
  [3] + Stale (5 total)
  ```

Worktrees in the **kept** category are never proposed for removal.
