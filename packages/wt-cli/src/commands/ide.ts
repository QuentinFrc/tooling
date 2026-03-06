import path from 'node:path'
import { execa } from 'execa'
import * as p from '@clack/prompts'
import { resolveConfig } from '../config.js'
import { listWorktreeDirs } from '../pick.js'

export async function ide(name?: string) {
  const config = await resolveConfig()
  const ideCmd = process.env.WT_IDE ?? 'cursor'

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
      message: 'Open in IDE',
      options: dirs.map((d) => ({ value: d, label: d })),
    })

    if (p.isCancel(selected)) {
      p.log.info('Cancelled.')
      return
    }

    wtPath = path.join(config.projectWtDir, selected)
  }

  await execa(ideCmd, [wtPath])
}
