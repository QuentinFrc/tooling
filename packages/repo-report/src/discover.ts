import fs from 'node:fs'
import path from 'node:path'
import type { PackageInfo, PackageType } from './types.js'

interface RawPackageJson {
  name?: string
  version?: string
  private?: boolean
  workspaces?: string[] | { packages?: string[] }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** Walk up from `start` until a workspace root is found, falling back to `start`. */
export function findRepoRoot(start: string): string {
  let dir = path.resolve(start)
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(dir, 'turbo.json')) ||
      packageJsonHasWorkspaces(path.join(dir, 'package.json'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(start)
    dir = parent
  }
}

export function loadPackages(root: string): { packages: PackageInfo[]; packageManager: string } {
  const { globs, packageManager } = readWorkspaceGlobs(root)
  const includes = globs.filter((g) => !g.startsWith('!'))
  const excludes = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1))

  const dirs = new Set<string>()
  for (const glob of includes) {
    for (const dir of expandGlob(root, glob)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) dirs.add(dir)
    }
  }
  const excluded = new Set<string>()
  for (const glob of excludes) {
    for (const dir of expandGlob(root, glob)) excluded.add(dir)
  }

  const packages: PackageInfo[] = []
  for (const dir of dirs) {
    if (excluded.has(dir)) continue
    const pkg = readPackageJson(dir)
    if (!pkg?.name) continue
    const relDir = path.relative(root, dir)
    packages.push({
      name: pkg.name,
      dir,
      relDir,
      type: classify(relDir),
      version: pkg.version ?? '0.0.0',
      private: Boolean(pkg.private),
      dependencies: pkg.dependencies ?? {},
      devDependencies: pkg.devDependencies ?? {},
      peerDependencies: pkg.peerDependencies ?? {},
    })
  }

  // Apps first, then packages, alphabetical within each group.
  packages.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'app' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return { packages, packageManager }
}

function readWorkspaceGlobs(root: string): { globs: string[]; packageManager: string } {
  const pnpmWs = path.join(root, 'pnpm-workspace.yaml')
  if (fs.existsSync(pnpmWs)) {
    return { globs: parsePnpmWorkspace(fs.readFileSync(pnpmWs, 'utf-8')), packageManager: 'pnpm' }
  }
  const pkg = readPackageJson(root)
  if (pkg?.workspaces) {
    const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages ?? [])
    return { globs, packageManager: detectPackageManager(root) }
  }
  return { globs: [], packageManager: detectPackageManager(root) }
}

function detectPackageManager(root: string): string {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun'
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm'
  return 'unknown'
}

/** Minimal parser for the `packages:` list in pnpm-workspace.yaml (no full YAML dependency). */
function parsePnpmWorkspace(content: string): string[] {
  const globs: string[] = []
  let inBlock = false
  for (const line of content.split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inBlock = true
      continue
    }
    if (!inBlock) continue
    const item = line.match(/^\s+-\s+(.+?)\s*$/)
    if (item) {
      globs.push(stripQuotes(item[1]))
    } else if (/^\S/.test(line)) {
      break // reached the next top-level key
    }
  }
  return globs
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function packageJsonHasWorkspaces(pkgPath: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as RawPackageJson
    return Boolean(pkg.workspaces)
  } catch {
    return false
  }
}

function readPackageJson(dir: string): RawPackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as RawPackageJson
  } catch {
    return null
  }
}

function classify(relDir: string): PackageType {
  return relDir.split('/')[0] === 'apps' ? 'app' : 'package'
}

/** Expand a workspace glob (supports `*` segments and `**`) into matching directories. */
function expandGlob(root: string, glob: string): string[] {
  const segments = glob.split('/').filter(Boolean)
  let dirs = [root]
  for (const segment of segments) {
    const next: string[] = []
    if (segment === '**') {
      for (const dir of dirs) next.push(dir, ...allSubdirs(dir))
    } else if (segment.includes('*')) {
      const re = globSegmentToRegExp(segment)
      for (const dir of dirs) {
        for (const name of readSubdirNames(dir)) {
          if (re.test(name)) next.push(path.join(dir, name))
        }
      }
    } else {
      for (const dir of dirs) {
        const candidate = path.join(dir, segment)
        if (isDirectory(candidate)) next.push(candidate)
      }
    }
    dirs = next
  }
  return dirs
}

function globSegmentToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.turbo', 'dist', 'build', '.next'])

function readSubdirNames(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORED_DIRS.has(e.name))
      .map((e) => e.name)
  } catch {
    return []
  }
}

function allSubdirs(dir: string): string[] {
  const out: string[] = []
  for (const name of readSubdirNames(dir)) {
    const child = path.join(dir, name)
    out.push(child, ...allSubdirs(child))
  }
  return out
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}
