import fs from 'node:fs'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, removeWorktreeFromMeta } from '../config.js'
import { classifyWorktrees } from '../classify.js'
import * as git from '../git.js'
import type { ClassifiedWorktree, Config } from '../types.js'

export interface PruneOpts {
  worktrees?: boolean
  branches?: boolean
}

export async function prune(opts: PruneOpts) {
  p.intro('wt prune')
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.outro('Run `wt setup` first.')
    return
  }
  const target = meta.defaultBranch ?? 'develop'

  const initial: string[] = []
  if (opts.worktrees !== false) initial.push('worktrees')
  if (opts.branches !== false) initial.push('branches')

  const scope = await p.multiselect({
    message: 'What to prune?',
    options: [
      { value: 'worktrees', label: 'Worktrees' },
      { value: 'branches', label: 'Branches' },
    ],
    initialValues: initial,
    required: true,
  })

  if (p.isCancel(scope)) {
    p.outro('Cancelled.')
    return
  }
  const selected = scope as string[]

  const s = p.spinner()
  s.start('Fetching origin')
  await git.fetch(config.parentRepo)
  s.stop('Fetched')

  if (selected.includes('worktrees')) {
    await pruneWorktrees(config, target)
  }
  if (selected.includes('branches')) {
    await pruneBranches(config.parentRepo, target)
  }

  p.outro('Done.')
}

function tierLabel(wt: ClassifiedWorktree): string {
  switch (wt.tier) {
    case 'merged': return 'merged'
    case 'idle': return 'empty'
    case 'stale': return 'stale'
    default: return 'kept'
  }
}

async function pruneWorktrees(config: Config, _target: string) {
  const s = p.spinner()
  s.start('Scanning worktrees')
  await git.worktreePrune(config.parentRepo)
  const result = await classifyWorktrees(config)
  s.stop('Worktrees scanned')

  if (result.kept.length > 0) {
    p.log.info(
      `Kept (${result.kept.length}):\n` +
        result.kept.map((w) => `  ${w.name} (${w.branch}) — ${w.detail}`).join('\n'),
    )
  }

  const cleanable: ClassifiedWorktree[] = [...result.merged, ...result.idle, ...result.stale]
  if (cleanable.length === 0) {
    p.log.info('No prunable worktrees.')
    return
  }

  const sel = await p.multiselect({
    message: `Worktrees to remove (${cleanable.length})`,
    options: cleanable.map((wt) => ({
      value: wt.name,
      label: `${wt.name} (${wt.branch})`,
      hint: `[${tierLabel(wt)}] ${wt.detail}`,
    })),
    initialValues: result.merged.map((wt) => wt.name),
    required: false,
  })

  if (p.isCancel(sel) || (sel as string[]).length === 0) {
    p.log.info('No worktrees removed.')
    return
  }

  const toRemove = cleanable.filter((wt) => (sel as string[]).includes(wt.name))
  const s2 = p.spinner()
  s2.start(`Removing ${toRemove.length} worktree(s)`)
  for (const wt of toRemove) {
    await git.worktreeRemove(wt.path, config.parentRepo)
    removeWorktreeFromMeta(config.projectWtDir, wt.name)
  }
  s2.stop(`Removed ${toRemove.length} worktree(s)`)

  try {
    fs.rmdirSync(config.projectWtDir)
  } catch {
    // not empty, fine
  }
}

async function pruneBranches(cwd: string, target: string) {
  const s = p.spinner()
  s.start('Scanning branches')
  const [all, mergedList, wtBranches, current] = await Promise.all([
    git.branchListAll(cwd),
    git.branchListMerged(cwd, `origin/${target}`),
    git.worktreeBranchMap(cwd),
    git.branchCurrent(cwd),
  ])
  const merged = new Set(mergedList)
  s.stop('Branches scanned')

  const candidates = all
    .filter((b) => b.name !== target)
    .filter((b) => b.name !== current)
    .filter((b) => !wtBranches[b.name])
    .map((b) => {
      const reasons: string[] = []
      if (merged.has(b.name)) reasons.push('merged')
      if (b.upstreamGone) reasons.push('gone')
      return { ...b, reasons }
    })
    .filter((b) => b.reasons.length > 0)

  if (candidates.length === 0) {
    p.log.info('No prunable branches.')
    return
  }

  const skipped = all
    .filter((b) => wtBranches[b.name])
    .map((b) => `  ${b.name} → ${wtBranches[b.name]}`)
  if (skipped.length > 0) {
    p.log.info(`Skipped (checked out by worktree, ${skipped.length}):\n` + skipped.join('\n'))
  }

  const sel = await p.multiselect({
    message: `Branches to delete (${candidates.length})`,
    options: candidates.map((b) => ({
      value: b.name,
      label: b.name,
      hint: `[${b.reasons.join(', ')}] ${b.lastCommit}`,
    })),
    initialValues: candidates.filter((b) => b.reasons.includes('merged')).map((b) => b.name),
    required: false,
  })

  if (p.isCancel(sel) || (sel as string[]).length === 0) {
    p.log.info('No branches deleted.')
    return
  }

  const names = sel as string[]
  const s2 = p.spinner()
  s2.start(`Deleting ${names.length} branch(es)`)
  let ok = 0
  for (const name of names) {
    try {
      await git.branchDelete(cwd, name, true)
      ok++
    } catch (err) {
      p.log.error(`Could not delete ${name}: ${(err as Error).message}`)
    }
  }
  s2.stop(`Deleted ${ok}/${names.length} branch(es)`)
}
