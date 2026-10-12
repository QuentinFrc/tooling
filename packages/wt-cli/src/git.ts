import fs from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'

export type RepoInfo =
  | { kind: 'main'; root: string; parentRepo: string }
  | { kind: 'worktree'; root: string; parentRepo: string }

export async function getRepoInfo(cwd?: string): Promise<RepoInfo | null> {
  try {
    const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd })
    const root = stdout.trim()
    const gitPath = path.join(root, '.git')
    const stat = fs.statSync(gitPath)

    if (stat.isDirectory()) {
      return { kind: 'main', root, parentRepo: root }
    }

    if (stat.isFile()) {
      const content = fs.readFileSync(gitPath, 'utf-8').trim()
      const match = content.match(/^gitdir:\s+(.+)$/)
      if (!match) return null
      const gitdir = match[1]
      const worktreesIdx = gitdir.indexOf('/.git/worktrees/')
      if (worktreesIdx === -1) return null
      const parentRepo = gitdir.substring(0, worktreesIdx)
      return { kind: 'worktree', root, parentRepo }
    }
  } catch {
    // not a git repo
  }
  return null
}

export async function fetch(cwd: string): Promise<void> {
  await execa('git', ['fetch', '--quiet'], { cwd })
}

/** Detect an interrupted rebase (conflict resolution pending) in this worktree. */
export async function rebaseInProgress(cwd: string): Promise<boolean> {
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    const { stdout } = await execa('git', ['rev-parse', '--git-path', dir], { cwd })
    if (fs.existsSync(path.resolve(cwd, stdout.trim()))) return true
  }
  return false
}

export async function worktreePrune(cwd: string): Promise<void> {
  await execa('git', ['worktree', 'prune'], { cwd })
}

export type WorktreeAddResult = 'created' | 'existing' | 'existing-updated' | 'remote'

/**
 * Check out `branch` into a new worktree, reusing the freshest version of it:
 * an existing local branch is fast-forwarded to origin when possible (kept
 * as-is when diverged or ahead), a remote-only branch is checked out with
 * tracking, and otherwise a new branch is created from `startPoint`.
 * Callers should fetch first for the origin refs to be current.
 */
export async function worktreeAdd(
  cwd: string,
  wtPath: string,
  branch: string,
  startPoint?: string,
): Promise<WorktreeAddResult> {
  const localRef = `refs/heads/${branch}`
  const remoteRef = `refs/remotes/origin/${branch}`

  if (await refExists(cwd, localRef)) {
    let updated = false
    if ((await refExists(cwd, remoteRef)) && (await isAncestor(cwd, localRef, remoteRef))) {
      await execa('git', ['branch', '-f', branch, remoteRef], { cwd })
      updated = true
    }
    await execa('git', ['worktree', 'add', wtPath, branch], { cwd })
    return updated ? 'existing-updated' : 'existing'
  }

  if (await refExists(cwd, remoteRef)) {
    await execa('git', ['worktree', 'add', wtPath, '--track', '-b', branch, `origin/${branch}`], { cwd })
    return 'remote'
  }

  const args = ['worktree', 'add', wtPath, '-b', branch]
  if (startPoint) args.push(startPoint)
  await execa('git', args, { cwd })
  return 'created'
}

export async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await execa('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd })
    return true
  } catch {
    return false
  }
}

export async function worktreeRemove(wtPath: string, cwd?: string): Promise<void> {
  // Get branch name before removing
  const branch = await branchCurrent(wtPath)
  try {
    await execa('git', ['worktree', 'remove', wtPath, '--force'])
  } catch {
    // Worktree may already be pruned but directory still exists — remove manually
    const { rm } = await import('node:fs/promises')
    await rm(wtPath, { recursive: true, force: true })
  }
  // Delete the local branch from the main repo
  if (branch && cwd) {
    try {
      await execa('git', ['branch', '-D', branch], { cwd })
    } catch {
      // branch might already be gone or is checked out elsewhere
    }
  }
}

/** Remove every node_modules directory in the tree (never descends into .git). */
function removeNodeModulesDirs(root: string): void {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.git') continue
    const p = path.join(root, entry.name)
    if (entry.name === 'node_modules') fs.rmSync(p, { recursive: true, force: true })
    else removeNodeModulesDirs(p)
  }
}

/** Returns true when the move crossed devices (dependencies were dropped and need reinstalling). */
export async function worktreeMove(cwd: string, from: string, to: string): Promise<boolean> {
  try {
    await execa('git', ['worktree', 'move', from, to], { cwd })
    return false
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // `git worktree move` relies on rename(2), which fails with EXDEV when
    // WT_ROOT lives on another volume. Copy + delete, then let git repair the
    // gitdir pointer (.git/worktrees/<id>/gitdir) to the new location.
    // node_modules is dropped first: copying it cross-device is slow and
    // breaks pnpm's hardlinks to the store — the caller reinstalls instead.
    if (!/cross-device/i.test(msg)) throw err
    removeNodeModulesDirs(from)
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true })
    fs.rmSync(from, { recursive: true, force: true })
    await execa('git', ['worktree', 'repair', to], { cwd })
    return true
  }
}

export async function worktreeList(cwd: string): Promise<string[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd })
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.replace('worktree ', ''))
}

export async function branchCurrent(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['branch', '--show-current'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function statusPorcelain(cwd: string): Promise<number> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd })
  if (!stdout.trim()) return 0
  return stdout.trim().split('\n').length
}

export async function revListCount(cwd: string, range: string): Promise<number> {
  try {
    const { stdout } = await execa('git', ['rev-list', range, '--count'], { cwd })
    return parseInt(stdout.trim(), 10)
  } catch {
    return 999
  }
}

export async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '@{u}'], { cwd })
    return true
  } catch {
    return false
  }
}

export async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', ref], { cwd })
    return true
  } catch {
    return false
  }
}

export async function mergeBase(cwd: string, ref1: string, ref2: string): Promise<string> {
  const { stdout } = await execa('git', ['merge-base', ref1, ref2], { cwd })
  return stdout.trim()
}

export async function commitTree(cwd: string, tree: string, parent: string, message: string): Promise<string> {
  const { stdout } = await execa('git', ['commit-tree', tree, '-p', parent, '-m', message], { cwd })
  return stdout.trim()
}

export async function cherry(cwd: string, upstream: string, head: string, base: string): Promise<string> {
  const { stdout } = await execa('git', ['cherry', upstream, head, base], { cwd })
  return stdout.trim()
}

export async function lastCommit(cwd: string): Promise<{ date: string; message: string }> {
  const { stdout } = await execa('git', ['log', '-1', '--format=%cr\t%s'], { cwd })
  const [date = '', message = ''] = stdout.trim().split('\t')
  return { date, message }
}

export async function revParseTree(cwd: string, ref: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', `${ref}^{tree}`], { cwd })
  return stdout.trim()
}

/** Paths git does not track: untracked files + ignored files, with fully-ignored directories collapsed to `dir/`. */
export async function lsOthers(cwd: string): Promise<string[]> {
  const [untracked, ignored] = await Promise.all([
    execa('git', ['ls-files', '--others', '--exclude-standard'], { cwd }),
    execa('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'], { cwd }),
  ])
  const all = [...untracked.stdout.split('\n'), ...ignored.stdout.split('\n')]
  return [...new Set(all.filter(Boolean))]
}

export async function isTracked(cwd: string, file: string): Promise<boolean> {
  try {
    await execa('git', ['ls-files', '--error-unmatch', file], { cwd })
    return true
  } catch {
    return false
  }
}

export interface BranchInfo {
  name: string
  upstreamGone: boolean
  lastCommit: string
}

export async function branchListAll(cwd: string): Promise<BranchInfo[]> {
  const { stdout } = await execa(
    'git',
    [
      'for-each-ref',
      '--format=%(refname:short)\t%(upstream:track)\t%(committerdate:relative)',
      'refs/heads/',
    ],
    { cwd },
  )
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', track = '', lastCommit = ''] = line.split('\t')
      return { name, upstreamGone: track === '[gone]', lastCommit }
    })
}

export async function branchListMerged(cwd: string, ref: string): Promise<string[]> {
  try {
    const { stdout } = await execa(
      'git',
      ['branch', '--format=%(refname:short)', '--merged', ref],
      { cwd },
    )
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function worktreeBranchMap(cwd: string): Promise<Record<string, string>> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd })
  const map: Record<string, string> = {}
  let curPath = ''
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) curPath = line.slice('worktree '.length)
    else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length)
      const name = ref.replace(/^refs\/heads\//, '')
      map[name] = curPath
    }
  }
  return map
}

export async function branchDelete(cwd: string, name: string, force = false): Promise<void> {
  await execa('git', ['branch', force ? '-D' : '-d', name], { cwd })
}
