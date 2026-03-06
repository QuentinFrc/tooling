import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { copyEnvFiles } from '../env.js'

export async function add(branch: string) {
  const config = await resolveConfig()
  const dir = branch.replaceAll('/', '-')
  const wtPath = path.join(config.projectWtDir, dir)

  fs.mkdirSync(config.projectWtDir, { recursive: true })
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    writeMeta(config.projectWtDir, {
      parentRepo: config.parentRepo,
      defaultBranch: 'develop',
      envFiles: [],
      worktrees: [],
    })
  }

  const s = p.spinner()
  s.start(`Creating worktree ${dir}`)
  await git.worktreeAdd(process.cwd(), wtPath, branch)
  s.stop(`Worktree created at ${wtPath}`)

  addWorktreeToMeta(config.projectWtDir, dir)

  const envFiles = readMeta(config.projectWtDir)?.envFiles ?? []
  if (envFiles.length > 0) {
    const copied = copyEnvFiles(config.parentRepo, wtPath, envFiles)
    if (copied.length > 0) {
      p.log.success(`Copied ${copied.join(', ')} to worktree`)
    }
  }
}
