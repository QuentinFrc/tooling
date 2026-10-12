import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta } from '../config.js'
import * as git from '../git.js'
import { detectPrepareCmd } from '../prepare.js'
import { DEFAULT_COPY_PATTERNS, expandCopyPatterns } from '../copy.js'

const KNOWN_IDE_DIRS = ['.idea', '.vscode', '.cursor', '.zed', '.fleet']

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

  // Copy patterns: keep whatever is already configured (incl. legacy envFiles/ideDirs),
  // otherwise seed with env files anywhere plus untracked IDE dirs at the root.
  let copy = existing?.copy ?? [...(existing?.envFiles ?? []), ...(existing?.ideDirs ?? [])]
  if (copy.length === 0) {
    copy = [...DEFAULT_COPY_PATTERNS]
    for (const dir of KNOWN_IDE_DIRS) {
      const dirPath = path.join(config.parentRepo, dir)
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const tracked = await git.isTracked(config.parentRepo, dir)
        if (!tracked) copy.push(dir)
      }
    }
  }

  const matched = await expandCopyPatterns(config.parentRepo, copy)
  p.log.info(
    `Copy patterns: ${copy.join(', ')}\n` +
      `Currently matching: ${matched.length ? matched.join(', ') : '(nothing)'}`,
  )

  // Detect package manager
  const prepareCmd = existing?.prepareCmd ?? detectPrepareCmd(config.parentRepo)
  if (prepareCmd) {
    p.log.info(`Prepare command: ${prepareCmd}`)
  }

  writeMeta(config.projectWtDir, {
    parentRepo: config.parentRepo,
    defaultBranch,
    copy,
    prepareCmd: prepareCmd ?? undefined,
    worktrees: existing?.worktrees ?? [],
    agent: existing?.agent,
  })

  p.log.success(`Linked to ${config.parentRepo} (branch: ${defaultBranch})`)
}
