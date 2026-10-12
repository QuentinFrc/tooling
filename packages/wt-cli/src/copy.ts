import fs from 'node:fs'
import path from 'node:path'
import type { WtMeta } from './types.js'
import * as git from './git.js'

export const DEFAULT_COPY_PATTERNS = ['**/.env*']

/**
 * Copy patterns from meta. An explicit `copy` field wins (empty array =
 * disabled); legacy envFiles/ideDirs are honored when present; otherwise
 * default to env files anywhere, so copy hooks work without re-running setup.
 */
export function resolveCopyPatterns(meta: WtMeta): string[] {
  if (meta.copy) return meta.copy
  const legacy = [...(meta.envFiles ?? []), ...(meta.ideDirs ?? [])]
  return legacy.length > 0 ? legacy : DEFAULT_COPY_PATTERNS
}

/** Minimal glob → regex: `**` spans segments, `*`/`?` stay within one, dotfiles match. */
function globToRegExp(glob: string): RegExp {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*' // '**/' also matches zero directories
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        re += '[^/]*'
        i += 1
      }
    } else if (c === '?') {
      re += '[^/]'
      i += 1
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  return new RegExp(`^${re}$`)
}

/**
 * Expand copy patterns against everything git does NOT track in the main repo
 * (untracked + ignored — tracked files come with the checkout, copying them
 * would clobber worktree changes). Ignored directories arrive collapsed
 * (e.g. `.idea/`), so a directory pattern copies the whole directory.
 */
export async function expandCopyPatterns(parentRepo: string, patterns: string[]): Promise<string[]> {
  if (patterns.length === 0) return []
  const candidates = await git.lsOthers(parentRepo)
  const regexes = patterns.map(globToRegExp)
  const out: string[] = []
  for (const candidate of candidates) {
    const rel = candidate.endsWith('/') ? candidate.slice(0, -1) : candidate
    if (rel.split('/').includes('node_modules')) continue
    if (regexes.some((r) => r.test(rel))) out.push(rel)
  }
  return [...new Set(out)].sort()
}

/** Copy repo-relative paths from the main repo into a worktree. Returns what was copied. */
export function copyPaths(parentRepo: string, wtPath: string, rels: string[], overwrite: boolean): string[] {
  const copied: string[] = []
  for (const rel of rels) {
    const src = path.join(parentRepo, rel)
    const dest = path.join(wtPath, rel)
    if (!fs.existsSync(src)) continue
    if (!overwrite && fs.existsSync(dest)) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true, force: overwrite })
    } else {
      fs.copyFileSync(src, dest)
    }
    copied.push(rel)
  }
  return copied
}

/** Expand the meta's copy patterns and apply them to one worktree. */
export async function copyIntoWorktree(
  parentRepo: string,
  wtPath: string,
  patterns: string[],
  overwrite: boolean,
): Promise<string[]> {
  const rels = await expandCopyPatterns(parentRepo, patterns)
  return copyPaths(parentRepo, wtPath, rels, overwrite)
}
