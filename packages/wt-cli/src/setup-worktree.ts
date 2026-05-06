import * as p from '@clack/prompts'
import { copyEnvFiles, copyDirs } from './env.js'
import { detectPrepareCmd, runPrepare } from './commands/prepare.js'
import type { WtMeta } from './types.js'

export async function applyMetaToWorktree(meta: WtMeta, parentRepo: string, wtPath: string): Promise<void> {
  if (meta.envFiles?.length) {
    const copied = copyEnvFiles(parentRepo, wtPath, meta.envFiles)
    if (copied.length) p.log.success(`Copied env: ${copied.join(', ')}`)
  }
  if (meta.ideDirs?.length) {
    const copied = copyDirs(parentRepo, wtPath, meta.ideDirs)
    if (copied.length) p.log.success(`Copied IDE: ${copied.join(', ')}`)
  }
  const prepareCmd = meta.prepareCmd ?? detectPrepareCmd(parentRepo)
  if (prepareCmd) {
    const s = p.spinner()
    s.start(`Running ${prepareCmd}`)
    await runPrepare(wtPath, prepareCmd)
    s.stop('Dependencies installed')
  }
}
