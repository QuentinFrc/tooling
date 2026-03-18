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
  const cwd = process.cwd()

  // Check if we're inside a project worktree dir on WT_ROOT (prioritize this)
  if (cwd.startsWith(wtRoot)) {
    const relative = path.relative(wtRoot, cwd)
    const project = relative.split(path.sep)[0]
    const projectWtDir = path.join(wtRoot, project)
    const meta = readMeta(projectWtDir)

    if (meta) {
      return { wtRoot, project, projectWtDir, parentRepo: meta.parentRepo }
    }
  }

  // Try resolving from a git repo (main repo only, not worktrees)
  try {
    const gitRoot = await getProjectRoot()
    // Verify we're not inside a worktree by checking .git structure
    const gitPath = path.join(gitRoot, '.git')
    const stat = fs.statSync(gitPath)

    // If .git is a directory, we're in the main repo
    if (stat.isDirectory()) {
      const project = path.basename(gitRoot)
      const projectWtDir = path.join(wtRoot, project)
      return { wtRoot, project, projectWtDir, parentRepo: gitRoot }
    }
  } catch {
    // Not a main repo or .git check failed
  }

  throw new Error('Not in a git repository or worktree directory')
}
