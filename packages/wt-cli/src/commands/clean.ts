import fs from 'node:fs'
import * as p from '@clack/prompts'
import { resolveConfig, removeWorktreeFromMeta } from '../config.js'
import { classifyWorktrees } from '../classify.js'
import * as git from '../git.js'
import type { ClassifiedWorktree } from '../types.js'

function tierLabel(wt: ClassifiedWorktree): string {
  switch (wt.tier) {
    case 'merged': return 'merged'
    case 'idle': return 'empty'
    case 'stale': return 'stale'
    default: return 'kept'
  }
}

function tierHint(wt: ClassifiedWorktree): string {
  return `[${tierLabel(wt)}] ${wt.detail}`
}

export async function clean() {
  p.intro('wt clean')
  const config = await resolveConfig()

  if (!fs.existsSync(config.projectWtDir)) {
    p.outro('No worktrees to clean.')
    return
  }

  const s = p.spinner()
  s.start('Fetching and pruning')
  await git.fetch(process.cwd())
  await git.worktreePrune(process.cwd())
  s.stop('Fetched and pruned')

  const result = await classifyWorktrees(config)

  // Show kept (not selectable)
  if (result.kept.length > 0) {
    p.log.error(
      `Kept (${result.kept.length}):\n` +
      result.kept.map((w) => `  ${w.name} (${w.branch}) — ${w.detail}`).join('\n')
    )
  }

  // Build selectable options: merged first (pre-checked), then idle, then stale
  const cleanable: ClassifiedWorktree[] = [
    ...result.merged,
    ...result.idle,
    ...result.stale,
  ]

  if (cleanable.length === 0) {
    p.outro('Nothing to clean.')
    return
  }

  const selected = await p.multiselect({
    message: 'Select worktrees to remove (space to toggle, enter to confirm)',
    options: cleanable.map((wt) => ({
      value: wt.name,
      label: `${wt.name} (${wt.branch})`,
      hint: tierHint(wt),
    })),
    initialValues: result.merged.map((wt) => wt.name),
  })

  if (p.isCancel(selected) || selected.length === 0) {
    p.outro('Cancelled.')
    return
  }

  const toRemove = cleanable.filter((wt) => selected.includes(wt.name))

  const s2 = p.spinner()
  s2.start(`Removing ${toRemove.length} worktree(s)`)
  for (const wt of toRemove) {
    await git.worktreeRemove(wt.path, config.parentRepo)
    removeWorktreeFromMeta(config.projectWtDir, wt.name)
  }
  s2.stop(`Removed ${toRemove.length} worktree(s)`)

  // Clean up empty project dir
  try {
    fs.rmdirSync(config.projectWtDir)
  } catch {
    // not empty, that's fine
  }

  p.outro(`Done! ${toRemove.length} worktree(s) removed.`)
}
