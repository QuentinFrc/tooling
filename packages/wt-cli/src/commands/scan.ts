import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, addWorktreeToMeta, removeWorktreeFromMeta } from '../config.js'
import * as git from '../git.js'

export async function scan() {
  p.intro('wt scan')
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.outro('Run `wt setup` first.')
    return
  }

  const allPaths = await git.worktreeList(config.parentRepo)
  const otherPaths = allPaths.filter((wp) => wp !== config.parentRepo)
  const tracked = new Set(meta.worktrees)

  const orphans: string[] = []
  const external: string[] = []
  for (const wp of otherPaths) {
    if (wp.startsWith(config.projectWtDir + path.sep)) {
      const name = path.relative(config.projectWtDir, wp).split(path.sep)[0]
      if (!tracked.has(name)) orphans.push(name)
    } else {
      external.push(wp)
    }
  }

  const stale: string[] = []
  for (const name of meta.worktrees) {
    const wp = path.join(config.projectWtDir, name)
    if (!allPaths.includes(wp)) stale.push(name)
  }

  if (orphans.length === 0 && stale.length === 0 && external.length === 0) {
    p.outro('All worktrees are in sync.')
    return
  }

  if (orphans.length > 0) {
    const sel = await p.multiselect({
      message: `Adopt orphan worktree(s) (in git, not in meta)`,
      options: orphans.map((n) => ({ value: n, label: n })),
      initialValues: orphans,
      required: false,
    })
    if (!p.isCancel(sel)) {
      for (const n of sel as string[]) addWorktreeToMeta(config.projectWtDir, n)
      if ((sel as string[]).length > 0) p.log.success(`Adopted ${(sel as string[]).length} worktree(s)`)
    }
  }

  if (stale.length > 0) {
    const sel = await p.multiselect({
      message: `Drop stale meta entries (in meta, no git worktree)`,
      options: stale.map((n) => ({ value: n, label: n })),
      initialValues: stale,
      required: false,
    })
    if (!p.isCancel(sel)) {
      for (const n of sel as string[]) removeWorktreeFromMeta(config.projectWtDir, n)
      if ((sel as string[]).length > 0) p.log.success(`Dropped ${(sel as string[]).length} entries`)
    }
  }

  if (external.length > 0) {
    p.log.warn(
      `${external.length} worktree(s) live outside ${config.projectWtDir}:\n` +
        external.map((wp) => `  ${wp}`).join('\n') +
        `\n(not adopted — move under WT_ROOT and re-run scan)`,
    )
  }

  p.outro('Scan complete.')
}
