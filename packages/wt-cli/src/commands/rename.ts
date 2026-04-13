import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta } from '../config.js'
import { listWorktreeDirs } from '../pick.js'
import * as git from '../git.js'
import { execa } from 'execa'

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

export async function rename(name?: string) {
  const config = await resolveConfig()

  let wtName: string

  if (name) {
    wtName = name.replaceAll('/', '-')
  } else {
    const dirs = listWorktreeDirs(config.projectWtDir)
    if (dirs.length === 0) {
      p.log.warn(`No worktrees for ${config.project}`)
      return
    }

    const selected = await p.select({
      message: 'Select worktree to rename',
      options: dirs.map((d) => ({ value: d, label: d })),
    })

    if (p.isCancel(selected)) {
      p.log.info('Cancelled.')
      return
    }

    wtName = selected
  }

  const oldEntry = path.join(config.projectWtDir, wtName)
  const connected = isSymlink(oldEntry)

  // Resolve the real worktree path (follows symlink if connected)
  const realWtPath = connected ? fs.realpathSync(oldEntry) : oldEntry

  const oldBranch = await git.branchCurrent(realWtPath)
  if (!oldBranch) {
    p.log.error(`Could not determine branch for ${wtName}`)
    return
  }

  const newBranch = await p.text({
    message: 'New branch name',
    defaultValue: oldBranch,
    placeholder: oldBranch,
  })

  if (p.isCancel(newBranch) || !newBranch) {
    p.log.info('Cancelled.')
    return
  }

  if (newBranch === oldBranch) {
    p.log.info('Branch name unchanged.')
    return
  }

  const newDir = newBranch.replaceAll('/', '-')
  const newEntry = path.join(config.projectWtDir, newDir)

  const s = p.spinner()
  s.start(`Renaming ${wtName} → ${newDir}`)

  // Rename the git branch
  await execa('git', ['branch', '-m', oldBranch, newBranch], { cwd: realWtPath })

  if (connected) {
    // Connected worktree: replace the symlink, keep real directory in place
    fs.unlinkSync(oldEntry)
    fs.symlinkSync(realWtPath, newEntry)
  } else {
    // Regular worktree: move directory via git
    await execa('git', ['worktree', 'move', oldEntry, newEntry], { cwd: config.parentRepo })
  }

  // Update metadata
  const meta = readMeta(config.projectWtDir)
  if (meta) {
    meta.worktrees = meta.worktrees.map((w) => (w === wtName ? newDir : w))
    writeMeta(config.projectWtDir, meta)
  }

  s.stop(`Renamed ${wtName} → ${newDir}`)
}
