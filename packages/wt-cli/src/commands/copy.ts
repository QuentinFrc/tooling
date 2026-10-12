import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import { resolveCopyPatterns, expandCopyPatterns, copyPaths } from '../copy.js'

interface CopyOptions {
  add?: string[]
  list?: boolean
}

export async function copy(name?: string, options: CopyOptions = {}) {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.warn('Run `wt setup` first.')
    return
  }

  if (options.add?.length) {
    meta.copy = [...new Set([...resolveCopyPatterns(meta), ...options.add])]
    delete meta.envFiles
    delete meta.ideDirs
    writeMeta(config.projectWtDir, meta)
    p.log.success(`Copy patterns: ${meta.copy.join(', ')}`)
    return
  }

  const patterns = resolveCopyPatterns(meta)
  const files = await expandCopyPatterns(config.parentRepo, patterns)

  if (options.list) {
    p.log.info(
      `Patterns: ${patterns.length ? patterns.join(', ') : '(none)'}\n` +
        `Matching: ${files.length ? files.join(', ') : '(nothing)'}`,
    )
    return
  }

  if (patterns.length === 0) {
    p.log.warn('No copy patterns configured. Add one with `wt copy --add <pattern>`.')
    return
  }
  if (files.length === 0) {
    p.log.warn(`No untracked files match: ${patterns.join(', ')}`)
    return
  }

  const targets = name ? [name.replaceAll('/', '-')] : listWorktreeDirs(config.projectWtDir)
  if (targets.length === 0) {
    p.log.warn(`No worktrees for ${config.project}`)
    return
  }

  let total = 0
  for (const dir of targets) {
    const wtPath = path.join(config.projectWtDir, dir)
    if (!fs.existsSync(wtPath)) {
      p.log.error(`Worktree not found: ${wtPath}`)
      continue
    }
    const copied = copyPaths(config.parentRepo, wtPath, files, true)
    if (copied.length) p.log.success(`${dir}: ${copied.join(', ')}`)
    total += copied.length
  }
  p.log.info(total === 0 ? 'Nothing copied.' : `Copied ${total} item(s) into ${targets.length} worktree(s).`)
}
