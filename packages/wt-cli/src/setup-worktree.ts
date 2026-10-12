import * as p from '@clack/prompts'
import { copyIntoWorktree, resolveCopyPatterns } from './copy.js'
import { detectPrepareCmd, runPrepare } from './prepare.js'
import type { WtMeta } from './types.js'

export async function applyMetaToWorktree(meta: WtMeta, parentRepo: string, wtPath: string): Promise<void> {
  const patterns = resolveCopyPatterns(meta)
  if (patterns.length) {
    const copied = await copyIntoWorktree(parentRepo, wtPath, patterns, false)
    if (copied.length) p.log.success(`Copied: ${copied.join(', ')}`)
  }
  const prepareCmd = meta.prepareCmd ?? detectPrepareCmd(parentRepo)
  if (prepareCmd) {
    const s = p.spinner()
    s.start(`Running ${prepareCmd}`)
    await runPrepare(wtPath, prepareCmd)
    s.stop('Dependencies installed')
  }
}
