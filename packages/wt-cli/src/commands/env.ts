import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import { copyEnvFiles } from '../env.js'

export async function env() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)

  if (!meta?.envFiles.length) {
    p.log.warn('No env files configured. Run `wt setup` first.')
    return
  }

  const dirs = listWorktreeDirs(config.projectWtDir)
  if (dirs.length === 0) {
    p.log.warn(`No worktrees for ${config.project}`)
    return
  }

  p.log.info(`Source: ${config.parentRepo}\nFiles: ${meta.envFiles.join(', ')}`)

  let totalCopied = 0
  for (const name of dirs) {
    const wtPath = path.join(config.projectWtDir, name)
    const copied = copyEnvFiles(config.parentRepo, wtPath, meta.envFiles)
    if (copied.length > 0) {
      p.log.success(`${name}: copied ${copied.join(', ')}`)
      totalCopied += copied.length
    }
  }

  if (totalCopied === 0) {
    p.log.info('All worktrees already have env files.')
  } else {
    p.log.success(`Synced ${totalCopied} file(s) across ${dirs.length} worktree(s).`)
  }
}
