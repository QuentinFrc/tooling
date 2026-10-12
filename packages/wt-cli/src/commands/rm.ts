import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import { removeWorktreeLocal } from '../remove.js'

export async function rm(name?: string) {
  const config = await resolveConfig()
  const cwd = process.cwd()

  // Worktree we're currently inside, if any.
  const insideName =
    cwd.startsWith(config.projectWtDir + path.sep)
      ? path.relative(config.projectWtDir, cwd).split(path.sep)[0]
      : undefined

  // An explicit name is a deliberate choice: remove without confirming, so
  // non-interactive callers (agents, scripts) can use `wt rm <name>` directly.
  let confirmNeeded = true
  let wtName: string
  if (name) {
    wtName = name.replaceAll('/', '-')
    confirmNeeded = false
  } else if (insideName) {
    wtName = insideName
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
    wtName = selected
  }

  if (!fs.existsSync(path.join(config.projectWtDir, wtName))) {
    p.log.error(`Worktree not found: ${path.join(config.projectWtDir, wtName)}`)
    process.exit(1)
  }

  if (confirmNeeded) {
    const confirmed = await p.confirm({ message: `Remove ${wtName}? (local only — PR untouched)` })
    if (p.isCancel(confirmed) || !confirmed) {
      p.log.info('Cancelled.')
      return
    }
  }

  const cdBack = wtName === insideName
  await removeWorktreeLocal(config, wtName, { cdBack })

  if (cdBack) {
    const tmpFile = process.env.__WT_CD_TMP
    p.log.success(tmpFile ? 'Returning to main repo.' : `cd ${config.parentRepo}`)
  }
}
