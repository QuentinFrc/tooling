import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, addWorktreeToMeta, removeWorktreeFromMeta } from '../config.js'
import * as git from '../git.js'
import { detectPrepareCmd, runPrepare } from '../prepare.js'
import { listOpenPrs, createPrWorktree, type OpenPr } from './sync-pr.js'
import type { Config, WtMeta } from '../types.js'

export async function scan() {
  p.intro('wt scan')
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.outro('Run `wt setup` first.')
    return
  }

  const allPaths = await git.worktreeList(config.parentRepo)
  const otherPaths = allPaths.filter((wp) => wp !== config.parentRepo)
  const tracked = new Set(meta.worktrees)

  const orphans: string[] = []
  const external: string[] = []
  for (const wp of otherPaths) {
    if (wp.startsWith(config.projectWtDir + path.sep)) {
      const name = path.relative(config.projectWtDir, wp).split(path.sep)[0]
      if (!tracked.has(name)) orphans.push(name)
    } else {
      external.push(wp)
    }
  }

  const stale: string[] = []
  for (const name of meta.worktrees) {
    const wp = path.join(config.projectWtDir, name)
    if (!allPaths.includes(wp)) stale.push(name)
  }

  if (orphans.length === 0 && stale.length === 0 && external.length === 0) {
    p.log.info('Local worktrees are in sync.')
  }

  if (orphans.length > 0) {
    const sel = await p.multiselect({
      message: `Adopt orphan worktree(s) (in git, not in meta)`,
      options: orphans.map((n) => ({ value: n, label: n })),
      initialValues: orphans,
      required: false,
    })
    if (!p.isCancel(sel)) {
      for (const n of sel as string[]) addWorktreeToMeta(config.projectWtDir, n)
      if ((sel as string[]).length > 0) p.log.success(`Adopted ${(sel as string[]).length} worktree(s)`)
    }
  }

  if (stale.length > 0) {
    const sel = await p.multiselect({
      message: `Drop stale meta entries (in meta, no git worktree)`,
      options: stale.map((n) => ({ value: n, label: n })),
      initialValues: stale,
      required: false,
    })
    if (!p.isCancel(sel)) {
      for (const n of sel as string[]) removeWorktreeFromMeta(config.projectWtDir, n)
      if ((sel as string[]).length > 0) p.log.success(`Dropped ${(sel as string[]).length} entries`)
    }
  }

  if (external.length > 0) {
    p.log.warn(`${external.length} worktree(s) live outside ${config.projectWtDir}`)
    const sel = await p.multiselect({
      message: 'Move external worktree(s) under WT_ROOT? (none selected by default)',
      options: external.map((wp) => ({ value: wp, label: wp })),
      initialValues: [],
      required: false,
    })
    if (!p.isCancel(sel)) {
      for (const wp of sel as string[]) {
        const branch = await git.branchCurrent(wp)
        const dir = (branch ?? path.basename(wp)).replaceAll('/', '-')
        const dest = path.join(config.projectWtDir, dir)
        if (fs.existsSync(dest)) {
          p.log.error(`${dest} already exists — skipped ${wp}`)
          continue
        }
        try {
          const crossDevice = await git.worktreeMove(config.parentRepo, wp, dest)
          addWorktreeToMeta(config.projectWtDir, dir)
          p.log.success(`Moved ${wp} → ${dest}`)
          if (crossDevice) {
            const prepareCmd = meta.prepareCmd ?? detectPrepareCmd(config.parentRepo)
            if (prepareCmd) {
              const s = p.spinner()
              s.start(`Running ${prepareCmd}`)
              await runPrepare(dest, prepareCmd)
              s.stop('Dependencies installed')
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          p.log.error(`Could not move ${wp}: ${msg}`)
        }
      }
    }
  }

  await offerPrWorktrees(config, meta)

  p.outro('Scan complete.')
}

/** Opt-in: create worktrees for open PRs that have none. Silently skipped without gh / GitHub remote. */
async function offerPrWorktrees(config: Config, meta: WtMeta) {
  const s = p.spinner()
  s.start('Checking open PRs')
  let prs: OpenPr[]
  try {
    prs = await listOpenPrs(config.parentRepo)
  } catch {
    s.stop('Open PRs unavailable (no gh or no GitHub remote) — skipped')
    return
  }
  const checkedOut = await git.worktreeBranchMap(config.parentRepo)
  const missing = prs.filter((pr) => !pr.isCrossRepository && !checkedOut[pr.headRefName])
  s.stop(missing.length ? `${missing.length} open PR(s) without a worktree` : 'Every open PR has a worktree')
  if (missing.length === 0) return

  const sel = await p.multiselect({
    message: 'Create worktree(s) for open PRs? (none selected by default)',
    options: missing.map((pr) => ({ value: pr.number, label: `#${pr.number} ${pr.headRefName}`, hint: pr.title })),
    initialValues: [],
    required: false,
  })
  if (p.isCancel(sel) || (sel as number[]).length === 0) return

  const fetchSpinner = p.spinner()
  fetchSpinner.start('Fetching origin')
  await git.fetch(config.parentRepo)
  fetchSpinner.stop('Fetched')

  for (const pr of missing.filter((pr) => (sel as number[]).includes(pr.number))) {
    const label = `#${pr.number} ${pr.headRefName}`
    try {
      await createPrWorktree(config, meta, pr, label)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      p.log.error(`${label}: ${msg}`)
    }
  }
}
