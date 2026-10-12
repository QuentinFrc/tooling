import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta } from '../config.js'
import * as git from '../git.js'
import { claudeInteractive, resolveAgentConfig } from '../claude.js'

export async function rebase() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt rebase must be run from inside a worktree')
    process.exit(1)
  }

  const ag = resolveAgentConfig(meta)
  const target = meta.defaultBranch ?? 'develop'

  if (await git.rebaseInProgress(cwd)) {
    const choice = await p.select({
      message: 'A rebase is already in progress.',
      options: [
        { value: 'continue', label: 'Continue (conflicts resolved)' },
        { value: 'claude', label: 'Let Claude resolve the conflicts' },
        { value: 'abort', label: 'Abort the rebase' },
        { value: 'leave', label: 'Leave it as is' },
      ],
    })
    if (p.isCancel(choice) || choice === 'leave') {
      p.log.info('Left the rebase in progress.')
      return
    }
    if (choice === 'abort') {
      await execa('git', ['rebase', '--abort'], { cwd })
      p.log.success('Rebase aborted.')
      return
    }
    if (choice === 'claude') {
      const done = await resolveWithClaude(cwd, target, ag.planModel)
      reportOutcome(cwd, target, done)
      return
    }
    try {
      await execa('git', ['rebase', '--continue'], { cwd, stdio: 'inherit' })
    } catch {
      p.log.error('Rebase still has conflicts — resolve them then re-run.')
      process.exit(1)
    }
    p.log.success('Rebase continued.')
    return
  }

  const s = p.spinner()
  s.start(`Fetching origin/${target}`)
  await git.fetch(cwd)
  const behind = await git.revListCount(cwd, `HEAD..origin/${target}`)
  s.stop(behind === 0 ? `Up to date with origin/${target}` : `Behind origin/${target} by ${behind} commit(s)`)

  if (behind === 0) {
    p.log.info('Nothing to rebase.')
    return
  }

  try {
    await execa('git', ['rebase', `origin/${target}`], { cwd, stdio: 'inherit' })
  } catch {
    const done = await resolveWithClaude(cwd, target, ag.planModel)
    reportOutcome(cwd, target, done)
    return
  }

  p.log.success(`Rebased onto origin/${target}.`)
  if (await git.hasUpstream(cwd)) {
    p.log.info('Run `wt release` to force-push the rebased branch.')
  }
}

async function reportOutcome(cwd: string, target: string, done: boolean): Promise<void> {
  if (!done) {
    p.log.warn('Rebase still in progress — re-run `wt rebase` to continue or abort.')
    return
  }
  p.log.success(`Rebased onto origin/${target}.`)
  if (await git.hasUpstream(cwd)) {
    p.log.info('Run `wt release` to force-push the rebased branch.')
  }
}

/**
 * Hand an interrupted rebase to an interactive Claude session to resolve conflicts.
 * Returns true once the rebase has completed, false if it is still in progress.
 */
export async function resolveWithClaude(cwd: string, target: string, model: string): Promise<boolean> {
  const conflicted = (await execa('git', ['diff', '--name-only', '--diff-filter=U'], { cwd })).stdout.trim()
  p.log.warn(`Rebase onto origin/${target} hit conflicts — handing off to Claude.`)

  const prompt = `A \`git rebase\` onto origin/${target} stopped on conflicts in this worktree. Resolve them so this branch's intended changes land cleanly on top of origin/${target}.

Conflicted files:
${conflicted || '(run `git status` to list them)'}

Steps:
1. For each conflicted file, edit it to remove the conflict markers and reconcile both sides — keep this branch's intent while respecting the incoming changes from origin/${target}.
2. Stage each resolved file with \`git add <file>\`.
3. Run \`git rebase --continue\`. It may stop again on a later commit — repeat steps 1–3 until the rebase completes.
4. If a commit's changes are already present upstream (empty after resolution), use \`git rebase --skip\`.

Do not start a new rebase, do not run \`git rebase --abort\`, and do not force-push. When the rebase is complete, tell me what you changed.`

  await claudeInteractive(prompt, { cwd, model })

  return !(await git.rebaseInProgress(cwd))
}
