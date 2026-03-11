import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { copyEnvFiles, copyDirs } from '../env.js'
import { detectPrepareCmd, runPrepare } from './prepare.js'

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
      ideDirs: [],
      worktrees: [],
    })
  }

  const s = p.spinner()
  s.start(`Creating worktree ${dir}`)
  await git.worktreeAdd(process.cwd(), wtPath, branch)
  s.stop(`Worktree created at ${wtPath}`)

  addWorktreeToMeta(config.projectWtDir, dir)

  const meta2 = readMeta(config.projectWtDir)
  const envFiles = meta2?.envFiles ?? []
  if (envFiles.length > 0) {
    const copied = copyEnvFiles(config.parentRepo, wtPath, envFiles)
    if (copied.length > 0) {
      p.log.success(`Copied ${copied.join(', ')} to worktree`)
    }
  }

  const ideDirs = meta2?.ideDirs ?? []
  if (ideDirs.length > 0) {
    const copied = copyDirs(config.parentRepo, wtPath, ideDirs)
    if (copied.length > 0) {
      p.log.success(`Copied ${copied.join(', ')} to worktree`)
    }
  }

  const prepareCmd = meta2?.prepareCmd ?? detectPrepareCmd(config.parentRepo)
  if (prepareCmd) {
    const s2 = p.spinner()
    s2.start(`Running ${prepareCmd}`)
    await runPrepare(wtPath, prepareCmd)
    s2.stop('Dependencies installed')
  }
}
