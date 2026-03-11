import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta, writeMeta } from '../config.js'

const LOCK_FILES: Record<string, string> = {
  'bun.lockb': 'bun install',
  'bun.lock': 'bun install',
  'pnpm-lock.yaml': 'pnpm install',
  'yarn.lock': 'yarn install',
  'package-lock.json': 'npm install',
}

export function detectPrepareCmd(repoPath: string): string | null {
  for (const [lockFile, cmd] of Object.entries(LOCK_FILES)) {
    if (fs.existsSync(path.join(repoPath, lockFile))) {
      return cmd
    }
  }
  return null
}

export async function runPrepare(wtPath: string, cmd: string): Promise<void> {
  const [bin, ...args] = cmd.split(' ')
  await execa(bin, args, { cwd: wtPath, stdio: 'inherit' })
}

export async function prepare(targetPath?: string) {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)

  const dir = targetPath ? path.resolve(targetPath) : config.parentRepo
  const cmd = meta?.prepareCmd ?? detectPrepareCmd(dir)

  if (!cmd) {
    p.log.warn('No lock file found — could not detect package manager')
    return
  }

  if (meta && !meta.prepareCmd) {
    meta.prepareCmd = cmd
    writeMeta(config.projectWtDir, meta)
    p.log.info(`Saved prepare command: ${cmd}`)
  }

  const s = p.spinner()
  s.start(`Running ${cmd}`)
  await runPrepare(dir, cmd)
  s.stop('Dependencies installed')
}
