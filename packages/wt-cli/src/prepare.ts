import fs from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'

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
