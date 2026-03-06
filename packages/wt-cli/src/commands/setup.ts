import fs from 'node:fs'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta } from '../config.js'
import * as git from '../git.js'

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

  writeMeta(config.projectWtDir, {
    parentRepo: config.parentRepo,
    defaultBranch,
    envFiles,
    worktrees: existing?.worktrees ?? [],
  })

  p.log.success(`Linked to ${config.parentRepo} (branch: ${defaultBranch})`)
}
