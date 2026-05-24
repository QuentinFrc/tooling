import fs from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import { pool } from './pool.js'
import type { PackageInfo } from './types.js'

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.vue', '.svelte', '.astro', '.css', '.scss', '.sass', '.less',
])

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', '.turbo', '.git', 'coverage', 'out',
])

export interface FileStats {
  loc: number
  files: number
  filesByExt: Record<string, number>
}

/** Count source files and lines for a package, preferring git (respects .gitignore) when available. */
export async function collectFileStats(
  root: string,
  pkg: PackageInfo,
  useGit: boolean,
): Promise<FileStats> {
  const files = useGit ? await gitFiles(root, pkg.relDir) : walk(pkg.dir)
  const sourceFiles = files.filter((f) => CODE_EXTS.has(path.extname(f)))

  const filesByExt: Record<string, number> = {}
  for (const f of sourceFiles) {
    const ext = path.extname(f)
    filesByExt[ext] = (filesByExt[ext] ?? 0) + 1
  }

  const counts = await pool(sourceFiles, 12, countLines)
  const loc = counts.reduce((sum, n) => sum + n, 0)
  return { loc, files: sourceFiles.length, filesByExt }
}

async function gitFiles(root: string, relDir: string): Promise<string[]> {
  try {
    const { stdout } = await execa('git', ['ls-files', '-z', '--', relDir || '.'], { cwd: root })
    return stdout.split('\0').filter(Boolean).map((f) => path.join(root, f))
  } catch {
    return []
  }
}

function walk(dir: string): string[] {
  const out: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      out.push(...walk(path.join(dir, entry.name)))
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name))
    }
  }
  return out
}

async function countLines(file: string): Promise<number> {
  try {
    const buf = await fs.promises.readFile(file)
    if (buf.length === 0) return 0
    let lines = 0
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) lines++
    }
    if (buf[buf.length - 1] !== 10) lines++ // count a trailing line without newline
    return lines
  } catch {
    return 0
  }
}
