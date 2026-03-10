import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import { copyEnvFiles, copyDirs } from '../env.js'

export async function sync() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)

  const hasEnv = (meta?.envFiles.length ?? 0) > 0
  const hasIde = (meta?.ideDirs?.length ?? 0) > 0

  if (!hasEnv && !hasIde) {
    p.log.warn('No env files or IDE directories configured. Run `wt setup` first.')
    return
  }

  const dirs = listWorktreeDirs(config.projectWtDir)
  if (dirs.length === 0) {
    p.log.warn(`No worktrees for ${config.project}`)
    return
  }

  const items = [
    ...(meta?.envFiles ?? []),
    ...(meta?.ideDirs ?? []),
  ]
  p.log.info(`Source: ${config.parentRepo}\nFiles: ${items.join(', ')}`)

  let totalCopied = 0
  for (const name of dirs) {
    const wtPath = path.join(config.projectWtDir, name)

    if (hasEnv) {
      const copied = copyEnvFiles(config.parentRepo, wtPath, meta!.envFiles)
      if (copied.length > 0) {
        p.log.success(`${name}: copied ${copied.join(', ')}`)
        totalCopied += copied.length
      }
    }

    if (hasIde) {
      const copied = copyDirs(config.parentRepo, wtPath, meta!.ideDirs)
      if (copied.length > 0) {
        p.log.success(`${name}: copied ${copied.join(', ')}`)
        totalCopied += copied.length
      }
    }
  }

  if (totalCopied === 0) {
    p.log.info('All worktrees already up to date.')
  } else {
    p.log.success(`Synced ${totalCopied} item(s) across ${dirs.length} worktree(s).`)
  }
}
