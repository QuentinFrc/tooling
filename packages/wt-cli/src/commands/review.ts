import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta } from '../config.js'
import * as git from '../git.js'
import { claudeHeadless, resolveAgentConfig } from '../claude.js'

const DIFF_TRUNCATE = 32000

export async function review() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt review must be run from inside a worktree')
    process.exit(1)
  }

  const ag = resolveAgentConfig(meta)
  const target = meta.defaultBranch ?? 'develop'

  let prUrl = ''
  try {
    const { stdout } = await execa('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], { cwd })
    prUrl = stdout.trim()
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string }
    if (e.code === 'ENOENT') {
      p.log.error('`gh` binary not found. Install GitHub CLI.')
    } else {
      p.log.error('No PR found for this branch — run `wt release` first.')
    }
    process.exit(1)
  }

  await git.fetch(cwd)

  const prDiffStat = (await execa('git', ['diff', '--stat', `origin/${target}...HEAD`], { cwd })).stdout
  const fullDiff = (await execa('git', ['diff', `origin/${target}...HEAD`], { cwd })).stdout.slice(0, DIFF_TRUNCATE)
  if (!fullDiff.trim()) {
    p.log.warn(`No changes vs origin/${target} — nothing to review.`)
    return
  }

  const reviewSpinner = p.spinner()
  reviewSpinner.start(`Reviewing PR (${ag.reviewModel})`)
  const reviewText = await claudeHeadless(
    `Review this pull request. Output ONLY the review markdown, no preamble.

Cover: strengths, concerns (with file:line references when possible), and concrete suggestions. Be terse and specific.

DIFF STAT:
${prDiffStat}

DIFF (truncated):
${fullDiff}`,
    { model: ag.reviewModel, cwd },
  )
  reviewSpinner.stop('Review ready')

  await execa('gh', ['pr', 'comment', prUrl, '--body', `## Self-review (Claude)\n\n${reviewText}`], { cwd })
  p.log.success(`Review posted on ${prUrl}`)
}
