import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, removeWorktreeFromMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import * as git from '../git.js'

export async function rm(name?: string) {
  const config = await resolveConfig()

  let wtPath: string

  if (name) {
    const dir = name.replaceAll('/', '-')
    wtPath = path.join(config.projectWtDir, dir)
  } else {
    const dirs = listWorktreeDirs(config.projectWtDir)
    if (dirs.length === 0) {
      p.log.warn(`No worktrees for ${config.project}`)
      return
    }

    const selected = await p.select({
      message: 'Select worktree to remove',
      options: dirs.map((d) => ({ value: d, label: d })),
    })

    if (p.isCancel(selected)) {
      p.log.info('Cancelled.')
      return
    }

    wtPath = path.join(config.projectWtDir, selected)
  }

  const confirmed = await p.confirm({ message: `Remove ${path.basename(wtPath)}?` })
  if (p.isCancel(confirmed) || !confirmed) {
    p.log.info('Cancelled.')
    return
  }

  const s = p.spinner()
  s.start(`Removing ${path.basename(wtPath)}`)
  await git.worktreeRemove(wtPath, config.parentRepo)
  removeWorktreeFromMeta(config.projectWtDir, path.basename(wtPath))
  s.stop(`Removed ${path.basename(wtPath)}`)
}
