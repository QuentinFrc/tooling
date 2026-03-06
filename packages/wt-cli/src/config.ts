import fs from 'node:fs'
import path from 'node:path'
import type { Config, WtMeta } from './types.js'
import { getProjectRoot } from './git.js'

const META_FILE = '.wt.json'

export function readMeta(projectWtDir: string): WtMeta | null {
  const metaPath = path.join(projectWtDir, META_FILE)
  if (!fs.existsSync(metaPath)) return null
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
}

export function writeMeta(projectWtDir: string, meta: WtMeta): void {
  fs.mkdirSync(projectWtDir, { recursive: true })
  fs.writeFileSync(path.join(projectWtDir, META_FILE), JSON.stringify(meta, null, 2) + '\n')
}

export function addWorktreeToMeta(projectWtDir: string, name: string): void {
  const meta = readMeta(projectWtDir)
  if (!meta) return
  if (!meta.worktrees.includes(name)) {
    meta.worktrees.push(name)
    writeMeta(projectWtDir, meta)
  }
}

export function removeWorktreeFromMeta(projectWtDir: string, name: string): void {
  const meta = readMeta(projectWtDir)
  if (!meta) return
  meta.worktrees = meta.worktrees.filter((w) => w !== name)
  writeMeta(projectWtDir, meta)
}

export async function resolveConfig(): Promise<Config> {
  const wtRoot = process.env.WT_ROOT ?? '/Volumes/Dev/worktrees'

  // Try resolving from a git repo first
  try {
    const parentRepo = await getProjectRoot()
    const project = path.basename(parentRepo)
    const projectWtDir = path.join(wtRoot, project)
    return { wtRoot, project, projectWtDir, parentRepo }
  } catch {
    // Not in a git repo — try to resolve from a worktree project dir
  }

  // Check if we're inside a project worktree dir on WT_ROOT
  const cwd = process.cwd()
  if (cwd.startsWith(wtRoot)) {
    const relative = path.relative(wtRoot, cwd)
    const project = relative.split(path.sep)[0]
    const projectWtDir = path.join(wtRoot, project)
    const meta = readMeta(projectWtDir)

    if (meta) {
      return { wtRoot, project, projectWtDir, parentRepo: meta.parentRepo }
    }
  }

  throw new Error('Not in a git repository or worktree directory')
}
