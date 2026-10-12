import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import { execa } from 'execa'

export async function update() {
  // dist/bin.js → package dir; realpath resolves the global npm symlink.
  const pkgDir = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))))
  const { stdout: repoRoot } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd: pkgDir })

  const { stdout: dirty } = await execa('git', ['status', '--porcelain'], { cwd: repoRoot })
  if (dirty.trim()) {
    p.log.warn(`Uncommitted changes in ${repoRoot} — updating anyway (fast-forward only).`)
  }

  const { stdout: before } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })

  const s = p.spinner()
  s.start(`Pulling ${repoRoot}`)
  // fetch + merge rather than pull: a `pull.rebase` config would refuse to run on a dirty tree.
  await execa('git', ['fetch', '--quiet'], { cwd: repoRoot })
  await execa('git', ['merge', '--ff-only', '--quiet', '@{u}'], { cwd: repoRoot })
  const { stdout: after } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
  s.stop(before === after ? 'Already up to date' : `Updated ${before.slice(0, 7)} → ${after.slice(0, 7)}`)

  s.start('Installing dependencies')
  await execa('pnpm', ['install', '--frozen-lockfile'], { cwd: repoRoot })
  s.message('Building wt-cli')
  await execa('pnpm', ['build'], { cwd: pkgDir })
  s.stop('wt-cli rebuilt')
}
