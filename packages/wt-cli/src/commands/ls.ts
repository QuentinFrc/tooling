import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import { pool } from '../pool.js'
import * as git from '../git.js'

const CONCURRENCY = 6

async function isMerged(wtPath: string, ref: string): Promise<boolean> {
  if (!(await git.refExists(wtPath, ref))) return false
  const ahead = await git.revListCount(wtPath, `${ref}..HEAD`)
  if (ahead === 0) return true
  try {
    const ancestor = await git.mergeBase(wtPath, ref, 'HEAD')
    const tree = await git.revParseTree(wtPath, 'HEAD')
    const squash = await git.commitTree(wtPath, tree, ancestor, 'temp')
    const result = await git.cherry(wtPath, ref, squash, ancestor)
    return result.startsWith('-')
  } catch {
    return false
  }
}

async function diffLabel(wtPath: string, ref: string): Promise<string> {
  if (!(await git.refExists(wtPath, ref))) return 'n/a'
  if (await isMerged(wtPath, ref)) {
    const behind = await git.revListCount(wtPath, `HEAD..${ref}`)
    return `merged (-${behind})`
  }
  const [ahead, behind] = await Promise.all([
    git.revListCount(wtPath, `${ref}..HEAD`),
    git.revListCount(wtPath, `HEAD..${ref}`),
  ])
  return `+${ahead} -${behind}`
}

interface WtSummary {
  name: string
  dirty: string
  pushed: string
  diff: string
}

async function summarize(wtPath: string, name: string, defaultBranch: string): Promise<WtSummary> {
  const [changes, hasUp, diff] = await Promise.all([
    git.statusPorcelain(wtPath),
    git.hasUpstream(wtPath),
    diffLabel(wtPath, defaultBranch),
  ])

  let pushed = 'no remote'
  if (hasUp) {
    const ahead = await git.revListCount(wtPath, '@{u}..HEAD')
    pushed = ahead === 0 ? 'pushed' : `${ahead} to push`
  }

  return {
    name,
    dirty: changes > 0 ? `${changes} dirty` : 'clean',
    pushed,
    diff,
  }
}

export async function ls() {
  const config = await resolveConfig()

  if (!fs.existsSync(config.projectWtDir)) {
    p.log.warn(`No worktrees for ${config.project}`)
    return
  }

  const dirs = listWorktreeDirs(config.projectWtDir)
  if (dirs.length === 0) {
    p.log.warn(`No worktrees for ${config.project}`)
    return
  }

  const meta = readMeta(config.projectWtDir)
  const defaultBranch = meta?.defaultBranch ?? 'develop'

  const summaries = await pool(dirs, CONCURRENCY, (name) => {
    const wtPath = path.join(config.projectWtDir, name)
    return summarize(wtPath, name, defaultBranch)
  })

  const nameW = Math.max(...summaries.map((s) => s.name.length))
  const diffW = Math.max(...summaries.map((s) => s.diff.length))
  const dirtyW = Math.max(...summaries.map((s) => s.dirty.length))
  const lines = summaries.map(
    (s) => `${s.name.padEnd(nameW)}  ${s.diff.padEnd(diffW)}  ${s.dirty.padEnd(dirtyW)}  ${s.pushed}`,
  )
  p.log.message(lines.join('\n'))
}
