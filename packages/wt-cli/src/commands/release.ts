import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta } from '../config.js'
import * as git from '../git.js'
import { claudeHeadless, resolveAgentConfig } from '../claude.js'

const PLAN_FILES = ['PLAN.md', 'AUDIT.md']
const DIFF_TRUNCATE = 16000

export async function release() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt release must be run from inside a worktree')
    process.exit(1)
  }

  const ag = resolveAgentConfig(meta)
  const target = meta.defaultBranch ?? 'develop'
  const branch = await git.branchCurrent(cwd)
  if (!branch) {
    p.log.error('Could not detect current branch')
    process.exit(1)
  }

  for (const f of PLAN_FILES) {
    const fp = path.join(cwd, f)
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp)
      p.log.info(`Removed ${f}`)
    }
  }

  const dirty = await git.statusPorcelain(cwd)
  if (dirty > 0) {
    const msgSpinner = p.spinner()
    msgSpinner.start(`Generating commit message (${ag.prModel})`)
    const diffStat = (await execa('git', ['diff', '--stat', 'HEAD'], { cwd })).stdout
    const diff = (await execa('git', ['diff', 'HEAD'], { cwd })).stdout.slice(0, DIFF_TRUNCATE)
    const msg = await claudeHeadless(
      `Write a single git commit message: imperative, max 72 chars, no period, no quotes, no prose. Output ONLY the message text.\n\nDIFF STAT:\n${diffStat}\n\nDIFF (truncated):\n${diff}`,
      { model: ag.prModel, cwd },
    )
    msgSpinner.stop('Commit message ready')
    const cleaned = msg.split('\n')[0].trim().replace(/^["']|["']$/g, '')
    p.log.info(`Commit: ${cleaned}`)
    await execa('git', ['add', '-A'], { cwd })
    await execa('git', ['commit', '-m', cleaned], { cwd })
  }

  await git.fetch(cwd)
  const behind = await git.revListCount(cwd, `HEAD..origin/${target}`)
  let didRebase = false
  if (behind > ag.rebaseThreshold) {
    p.log.warn(`Branch is behind origin/${target} by ${behind} commits — rebasing`)
    try {
      await execa('git', ['rebase', `origin/${target}`], { cwd, stdio: 'inherit' })
      didRebase = true
    } catch {
      p.log.error('Rebase had conflicts — resolve manually then re-run')
      process.exit(1)
    }
  }

  const hadUpstream = await git.hasUpstream(cwd)
  if (hadUpstream) {
    const args = ['push']
    if (didRebase) args.push('--force-with-lease')
    await execa('git', args, { cwd, stdio: 'inherit' })
  } else {
    await execa('git', ['push', '-u', 'origin', branch], { cwd, stdio: 'inherit' })
  }

  const prSpinner = p.spinner()
  prSpinner.start(`Generating PR description (${ag.prModel})`)
  const prDiffStat = (await execa('git', ['diff', '--stat', `origin/${target}...HEAD`], { cwd })).stdout
  const prLog = (await execa('git', ['log', '--oneline', `origin/${target}..HEAD`], { cwd })).stdout
  const prText = await claudeHeadless(
    `Write a pull-request title and body for these changes.

Format your output EXACTLY like this (no surrounding prose, no fences):

TITLE: <single line, imperative, max 70 chars>
BODY:
## Summary
- bullet 1
- bullet 2

## Test plan
- [ ] item 1
- [ ] item 2

DIFF STAT:
${prDiffStat}

COMMITS:
${prLog}`,
    { model: ag.prModel, cwd },
  )
  prSpinner.stop('PR description ready')

  const { title, body } = parsePr(prText)

  const createSpinner = p.spinner()
  createSpinner.start('Creating PR via gh')
  let prUrl: string
  try {
    const { stdout } = await execa(
      'gh',
      ['pr', 'create', '--base', target, '--head', branch, '--title', title, '--body', body],
      { cwd },
    )
    prUrl = stdout.trim().split('\n').pop() ?? ''
  } catch (err) {
    createSpinner.stop('gh pr create failed')
    const e = err as NodeJS.ErrnoException & { stderr?: string }
    if (e.code === 'ENOENT') {
      p.log.error('`gh` binary not found. Install GitHub CLI.')
      process.exit(1)
    }
    if (e.stderr?.includes('already exists')) {
      const { stdout } = await execa('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { cwd })
      prUrl = stdout.trim()
      p.log.info(`Reusing existing PR: ${prUrl}`)
    } else {
      throw err
    }
  }
  if (prUrl) createSpinner.stop(`PR: ${prUrl}`)

  const reviewSpinner = p.spinner()
  reviewSpinner.start(`Reviewing PR (${ag.reviewModel})`)
  const fullDiff = (await execa('git', ['diff', `origin/${target}...HEAD`], { cwd })).stdout.slice(0, DIFF_TRUNCATE * 2)
  const review = await claudeHeadless(
    `Review this pull request. Output ONLY the review markdown, no preamble.

Cover: strengths, concerns (with file:line references when possible), and concrete suggestions. Be terse and specific.

DIFF STAT:
${prDiffStat}

DIFF (truncated):
${fullDiff}`,
    { model: ag.reviewModel, cwd },
  )
  reviewSpinner.stop('Review ready')

  if (prUrl) {
    await execa('gh', ['pr', 'comment', prUrl, '--body', `## Self-review (Claude)\n\n${review}`], { cwd })
    p.log.success(`Review posted on ${prUrl}`)
  } else {
    p.log.warn('No PR URL — printing review:')
    p.log.message(review)
  }
}

function parsePr(raw: string): { title: string; body: string } {
  const stripped = raw.replace(/^```\w*\s*/, '').replace(/```\s*$/, '').trim()
  const lines = stripped.split('\n')
  const titleIdx = lines.findIndex((l) => /^TITLE:/i.test(l))
  const bodyIdx = lines.findIndex((l) => /^BODY:/i.test(l))
  const title = titleIdx >= 0 ? lines[titleIdx].replace(/^TITLE:\s*/i, '').trim() : 'Update'
  const body = bodyIdx >= 0 ? lines.slice(bodyIdx + 1).join('\n').trim() : stripped
  return { title: title.slice(0, 70), body }
}
