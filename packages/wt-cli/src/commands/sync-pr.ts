import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { applyMetaToWorktree } from '../setup-worktree.js'

export interface OpenPr {
  number: number
  title: string
  headRefName: string
  isCrossRepository: boolean
}

type Outcome = 'created' | 'updated' | 'up-to-date' | 'skipped' | 'failed'
type Config = Awaited<ReturnType<typeof resolveConfig>>
type Meta = NonNullable<ReturnType<typeof readMeta>>

export async function listOpenPrs(cwd: string, mine = false): Promise<OpenPr[]> {
  const args = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,isCrossRepository']
  if (mine) args.push('--author', '@me')
  const { stdout } = await execa('gh', args, { cwd })
  return JSON.parse(stdout)
}

/**
 * Create a worktree for a PR branch under the project dir, then apply copy
 * hooks and install deps. Assumes origin was fetched. Returns the dir name,
 * or null when the target path is already taken by something else.
 */
export async function createPrWorktree(config: Config, meta: Meta, pr: OpenPr, label: string): Promise<string | null> {
  const dir = pr.headRefName.replaceAll('/', '-')
  const wtPath = path.join(config.projectWtDir, dir)
  if (fs.existsSync(wtPath)) {
    p.log.warn(`${label}: ${wtPath} exists but is not a worktree of this branch — skipped`)
    return null
  }

  fs.mkdirSync(config.projectWtDir, { recursive: true })
  const result = await git.worktreeAdd(config.parentRepo, wtPath, pr.headRefName)
  addWorktreeToMeta(config.projectWtDir, dir)
  p.log.success(
    `${label}: created ${dir}` + (result === 'existing' ? ' (local branch diverged from origin — kept as is)' : ''),
  )
  await applyMetaToWorktree(meta, config.parentRepo, wtPath)
  return dir
}

export async function syncPr(options: { mine?: boolean }) {
  p.intro('wt sync-pr')
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.outro('Run `wt setup` first.')
    return
  }

  const s = p.spinner()
  s.start('Fetching open PRs')
  const prs = await listOpenPrs(config.parentRepo, options.mine)
  s.message('Fetching origin')
  await git.fetch(config.parentRepo)
  s.stop(`${prs.length} open PR(s)`)

  if (prs.length === 0) {
    p.outro('Nothing to sync.')
    return
  }

  const checkedOut = await git.worktreeBranchMap(config.parentRepo)
  const counts: Record<Outcome, number> = { created: 0, updated: 0, 'up-to-date': 0, skipped: 0, failed: 0 }

  for (const pr of prs) {
    const label = `#${pr.number} ${pr.headRefName}`
    let outcome: Outcome
    try {
      outcome = await syncOne(config, meta, pr, checkedOut[pr.headRefName], label)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      p.log.error(`${label}: ${msg}`)
      outcome = 'failed'
    }
    counts[outcome]++
  }

  const summary = (Object.entries(counts) as [Outcome, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ')
  p.outro(summary)
}

async function syncOne(
  config: Config,
  meta: Meta,
  pr: OpenPr,
  existingPath: string | undefined,
  label: string,
): Promise<Outcome> {
  if (pr.isCrossRepository) {
    p.log.warn(`${label}: fork PR — skipped`)
    return 'skipped'
  }

  const remoteRef = `origin/${pr.headRefName}`

  if (existingPath) {
    if (existingPath === config.parentRepo) {
      p.log.warn(`${label}: checked out in the main repo — skipped`)
      return 'skipped'
    }
    if (existingPath.startsWith(config.projectWtDir + path.sep)) {
      addWorktreeToMeta(config.projectWtDir, path.relative(config.projectWtDir, existingPath).split(path.sep)[0])
    }
    return updateExisting(existingPath, remoteRef, label)
  }

  return (await createPrWorktree(config, meta, pr, label)) ? 'created' : 'skipped'
}

async function updateExisting(wtPath: string, remoteRef: string, label: string): Promise<Outcome> {
  const name = path.basename(wtPath)
  if (!(await git.refExists(wtPath, remoteRef))) {
    p.log.warn(`${label}: ${remoteRef} not found — skipped`)
    return 'skipped'
  }

  const behind = await git.revListCount(wtPath, `HEAD..${remoteRef}`)
  if (behind === 0) {
    p.log.info(`${label}: ${name} up to date`)
    return 'up-to-date'
  }
  if (!(await git.isAncestor(wtPath, 'HEAD', remoteRef))) {
    p.log.warn(`${label}: ${name} diverged from ${remoteRef} — skipped`)
    return 'skipped'
  }
  if ((await git.statusPorcelain(wtPath)) > 0) {
    p.log.warn(`${label}: ${name} has uncommitted changes — skipped (${behind} commit(s) behind)`)
    return 'skipped'
  }

  await git.mergeFfOnly(wtPath, remoteRef)
  p.log.success(`${label}: ${name} fast-forwarded (+${behind})`)
  return 'updated'
}
