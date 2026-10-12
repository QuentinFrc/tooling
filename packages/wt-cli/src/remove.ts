import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import type { Config } from './types.js'
import { removeWorktreeFromMeta } from './config.js'
import * as git from './git.js'

/**
 * Local-only worktree teardown: drop the git worktree, prune it from `.wt.json`,
 * and remove the now-empty project dir. Optionally write the cd-back tmp file so
 * the shell wrapper returns to the main repo. Touches nothing on the remote.
 */
export async function removeWorktreeLocal(
  config: Config,
  wtName: string,
  opts: { cdBack?: boolean } = {},
): Promise<void> {
  if (opts.cdBack) {
    const tmpFile = process.env.__WT_CD_TMP
    if (tmpFile) fs.writeFileSync(tmpFile, config.parentRepo)
  }

  const wtPath = path.join(config.projectWtDir, wtName)
  const s = p.spinner()
  s.start(`Removing worktree ${wtName}`)
  await git.worktreeRemove(wtPath, config.parentRepo)
  removeWorktreeFromMeta(config.projectWtDir, wtName)
  s.stop(`Removed worktree ${wtName}`)

  try {
    fs.rmdirSync(config.projectWtDir)
  } catch {
    // not empty, fine
  }
}
