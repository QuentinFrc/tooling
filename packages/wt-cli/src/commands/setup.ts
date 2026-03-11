import fs from 'node:fs'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta } from '../config.js'
import * as git from '../git.js'
import { detectPrepareCmd } from './prepare.js'

export async function setup(options: { base?: string }) {
  const config = await resolveConfig()
  const existing = readMeta(config.projectWtDir)

  if (fs.existsSync(config.projectWtDir)) {
    p.log.info(`${config.projectWtDir} already exists`)
  } else {
    fs.mkdirSync(config.projectWtDir, { recursive: true })
    p.log.success(`Created ${config.projectWtDir}`)
  }

  // Default branch
  const defaultBranch = options.base ?? existing?.defaultBranch ?? 'develop'

  // Scan untracked .env* files
  const allEnvFiles = fs.readdirSync(config.parentRepo).filter(
    (f) => f.startsWith('.env') && fs.statSync(`${config.parentRepo}/${f}`).isFile()
  )

  const envFiles: string[] = []
  for (const file of allEnvFiles) {
    const tracked = await git.isTracked(config.parentRepo, file)
    if (!tracked) envFiles.push(file)
  }

  if (envFiles.length > 0) {
    p.log.info(`Untracked env files: ${envFiles.join(', ')}`)
  } else if (allEnvFiles.length > 0) {
    p.log.info('All env files are git-tracked, no copy needed')
  }

  // Scan untracked IDE directories
  const knownIdeDirs = ['.idea', '.vscode', '.cursor', '.zed', '.fleet']
  const ideDirs: string[] = []
  for (const dir of knownIdeDirs) {
    const dirPath = `${config.parentRepo}/${dir}`
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      const tracked = await git.isTracked(config.parentRepo, dir)
      if (!tracked) ideDirs.push(dir)
    }
  }

  if (ideDirs.length > 0) {
    p.log.info(`IDE directories: ${ideDirs.join(', ')}`)
  }

  // Detect package manager
  const prepareCmd = existing?.prepareCmd ?? detectPrepareCmd(config.parentRepo)
  if (prepareCmd) {
    p.log.info(`Prepare command: ${prepareCmd}`)
  }

  writeMeta(config.projectWtDir, {
    parentRepo: config.parentRepo,
    defaultBranch,
    envFiles,
    ideDirs,
    prepareCmd: prepareCmd ?? undefined,
    worktrees: existing?.worktrees ?? [],
  })

  p.log.success(`Linked to ${config.parentRepo} (branch: ${defaultBranch})`)
}
