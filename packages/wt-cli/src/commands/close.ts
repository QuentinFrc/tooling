import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta, removeWorktreeFromMeta } from '../config.js'
import * as git from '../git.js'

type Strategy = 'squash' | 'merge' | 'rebase'

export interface CloseOpts {
  squash?: boolean
  merge?: boolean
  rebase?: boolean
}

export async function close(opts: CloseOpts) {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt close must be run from inside a worktree')
    process.exit(1)
  }
  if (cwd === config.parentRepo) {
    p.log.error('Refusing to close the main repo')
    process.exit(1)
  }

  const strategy: Strategy = opts.merge ? 'merge' : opts.rebase ? 'rebase' : 'squash'

  let prState = ''
  let prNumber = 0
  try {
    const { stdout } = await execa('gh', ['pr', 'view', '--json', 'number,state'], { cwd })
    const j = JSON.parse(stdout) as { number: number; state: string }
    prState = j.state
    prNumber = j.number
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string }
    if (e.code === 'ENOENT') {
      p.log.error('`gh` binary not found. Install GitHub CLI.')
      process.exit(1)
    }
    p.log.error(`No PR found for this branch: ${e.stderr?.trim() ?? (err as Error).message}`)
    process.exit(1)
  }

  if (prState === 'OPEN') {
    const flag = strategy === 'merge' ? '--merge' : strategy === 'rebase' ? '--rebase' : '--squash'
    const s = p.spinner()
    s.start(`Merging PR #${prNumber} (${strategy})`)
    try {
      await execa('gh', ['pr', 'merge', flag, '--delete-branch=false'], { cwd })
      s.stop(`Merged PR #${prNumber}`)
    } catch (err) {
      s.stop('Merge failed')
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
      p.log.error(e.stderr?.trim() ?? e.stdout?.trim() ?? (err as Error).message)
      process.exit(1)
    }
  } else if (prState === 'MERGED') {
    p.log.info(`PR #${prNumber} already merged`)
  } else {
    p.log.error(`PR #${prNumber} is ${prState} — cannot close`)
    process.exit(1)
  }

  const wtName = path.relative(config.projectWtDir, cwd).split(path.sep)[0]
  const wtPath = path.join(config.projectWtDir, wtName)

  const tmpFile = process.env.__WT_CD_TMP
  if (tmpFile) fs.writeFileSync(tmpFile, config.parentRepo)

  const s2 = p.spinner()
  s2.start(`Removing worktree ${wtName}`)
  await git.worktreeRemove(wtPath, config.parentRepo)
  removeWorktreeFromMeta(config.projectWtDir, wtName)
  s2.stop(`Removed worktree ${wtName}`)

  try {
    fs.rmdirSync(config.projectWtDir)
  } catch {
    // not empty, fine
  }

  p.log.success(`Closed. ${tmpFile ? 'Returning to main repo.' : `cd ${config.parentRepo}`}`)
}
