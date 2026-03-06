import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig } from '../config.js'
import { listWorktreeDirs } from '../pick.js'

export async function cd(name?: string) {
  const config = await resolveConfig()

  if (name) {
    const dir = name.replaceAll('/', '-')
    process.stdout.write(path.join(config.projectWtDir, dir))
    return
  }

  const dirs = listWorktreeDirs(config.projectWtDir)
  if (dirs.length === 0) {
    p.log.warn(`No worktrees for ${config.project}`)
    process.exit(1)
  }

  const selected = await p.select({
    message: 'Navigate to',
    options: dirs.map((d) => ({ value: d, label: d })),
  })

  if (p.isCancel(selected)) {
    process.exit(1)
  }

  const target = path.join(config.projectWtDir, selected)

  const tmpFile = process.env.__WT_CD_TMP
  if (tmpFile) {
    fs.writeFileSync(tmpFile, target)
  } else {
    process.stdout.write(target)
  }
}
