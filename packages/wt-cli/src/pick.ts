import fs from 'node:fs'
import path from 'node:path'
import { readMeta, writeMeta } from './config.js'

export function scanWorktreeDirs(projectWtDir: string): string[] {
  if (!fs.existsSync(projectWtDir)) return []
  return fs
    .readdirSync(projectWtDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(projectWtDir, e.name, '.git')))
    .map((e) => e.name)
}

export function listWorktreeDirs(projectWtDir: string): string[] {
  const meta = readMeta(projectWtDir)
  if (meta?.worktrees.length) return meta.worktrees

  // Fallback: scan + persist to cache
  const scanned = scanWorktreeDirs(projectWtDir)
  if (scanned.length > 0 && meta) {
    writeMeta(projectWtDir, { ...meta, worktrees: scanned })
  }
  return scanned
}
