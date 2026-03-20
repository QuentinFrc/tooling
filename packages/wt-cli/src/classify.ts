import path from 'node:path'
import type { Config, ClassifiedWorktree, ClassifyResult } from './types.js'
import { readMeta } from './config.js'
import { listWorktreeDirs } from './pick.js'
import { pool } from './pool.js'
import * as git from './git.js'

const CONCURRENCY = 6

async function isMerged(wtPath: string, ref: string): Promise<boolean> {
  if (!(await git.refExists(wtPath, ref))) return false

  const ahead = await git.revListCount(wtPath, `${ref}..HEAD`)
  if (ahead === 0) return true

  try {
    const [ancestor, tree] = await Promise.all([
      git.mergeBase(wtPath, ref, 'HEAD'),
      git.revParseTree(wtPath, 'HEAD'),
    ])
    const squash = await git.commitTree(wtPath, tree, ancestor, 'temp')
    const result = await git.cherry(wtPath, ref, squash, ancestor)
    return result.startsWith('-')
  } catch {
    return false
  }
}

async function classifyOne(wtPath: string, name: string, ref: string, branchLabel: string): Promise<ClassifiedWorktree> {
  const base: ClassifiedWorktree = {
    path: wtPath,
    name,
    branch: '',
    tier: null,
    pushed: false,
    detail: '',
  }

  // Parallel: dirty + branch (independent)
  let dirtyCount: number
  let branch: string | null
  try {
    ;[dirtyCount, branch] = await Promise.all([
      git.statusPorcelain(wtPath),
      git.branchCurrent(wtPath),
    ])
  } catch {
    // Directory exists but is no longer a valid git worktree (e.g. pruned)
    return { ...base, branch: '(broken)', tier: 'stale', pushed: false, detail: 'broken worktree (not a git repo)' }
  }
  base.branch = branch ?? '(detached)'

  // 1. Dirty → kept
  if (dirtyCount > 0) {
    return { ...base, skipReason: 'dirty', dirtyCount, detail: `${dirtyCount} uncommitted changes` }
  }

  // 2. Merged check
  if (await isMerged(wtPath, ref)) {
    return { ...base, tier: 'merged', pushed: true, detail: `merged into ${branchLabel}` }
  }

  // 3. Idle check + pushed check in parallel
  const [ahead, hasUp] = await Promise.all([
    git.revListCount(wtPath, `${ref}..HEAD`),
    git.hasUpstream(wtPath),
  ])

  if (ahead === 0) {
    return { ...base, tier: 'idle', pushed: true, detail: 'no commits ahead' }
  }

  // 4. Pushed check
  if (hasUp) {
    const aheadUpstream = await git.revListCount(wtPath, '@{u}..HEAD')
    if (aheadUpstream === 0) {
      return { ...base, tier: 'stale', pushed: true, detail: `${ahead} commits, all pushed` }
    }
  }

  // 5. Unpushed → kept
  return { ...base, skipReason: 'unpushed', pushed: false, detail: `${ahead} unpushed commits` }
}

export async function classifyWorktrees(config: Config): Promise<ClassifyResult> {
  const meta = readMeta(config.projectWtDir)
  const defaultBranch = meta?.defaultBranch ?? 'develop'
  const ref = `origin/${defaultBranch}`

  const dirs = listWorktreeDirs(config.projectWtDir)

  const classified = await pool(dirs, CONCURRENCY, (name) => {
    const wtPath = path.join(config.projectWtDir, name)
    return classifyOne(wtPath, name, ref, defaultBranch)
  })

  const result: ClassifyResult = { merged: [], idle: [], stale: [], kept: [] }
  for (const wt of classified) {
    if (wt.tier === 'merged') result.merged.push(wt)
    else if (wt.tier === 'idle') result.idle.push(wt)
    else if (wt.tier === 'stale') result.stale.push(wt)
    else result.kept.push(wt)
  }

  return result
}
