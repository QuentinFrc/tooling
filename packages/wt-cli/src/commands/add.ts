import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { resolveAgentConfig } from '../claude.js'
import { promptViaEditor } from '../editor.js'
import { generateSlug } from '../slug.js'
import { applyMetaToWorktree } from '../setup-worktree.js'

export async function add(promptArg?: string) {
  const config = await resolveConfig()

  let meta = readMeta(config.projectWtDir)
  if (!meta) {
    fs.mkdirSync(config.projectWtDir, { recursive: true })
    writeMeta(config.projectWtDir, {
      parentRepo: config.parentRepo,
      defaultBranch: 'develop',
      envFiles: [],
      ideDirs: [],
      worktrees: [],
    })
    meta = readMeta(config.projectWtDir)!
  }

  let userPrompt: string
  if (promptArg && promptArg.trim()) {
    userPrompt = promptArg.trim()
  } else {
    const fromEditor = await promptViaEditor()
    if (!fromEditor) {
      p.log.warn('Empty prompt — aborting.')
      process.exit(1)
    }
    userPrompt = fromEditor
  }

  const ag = resolveAgentConfig(meta)
  const slugSpinner = p.spinner()
  slugSpinner.start(`Picking branch name (${ag.slugModel})`)
  const { branch, dir } = await generateSlug(userPrompt, ag.slugModel, config.parentRepo)
  slugSpinner.stop(`Branch: ${branch}`)

  const wtPath = path.join(config.projectWtDir, dir)
  if (fs.existsSync(wtPath)) {
    p.log.error(`Worktree ${dir} already exists at ${wtPath}`)
    process.exit(1)
  }

  const baseBranch = meta.defaultBranch ?? 'develop'

  const wtSpinner = p.spinner()
  wtSpinner.start(`Creating worktree at ${wtPath}`)
  await git.worktreeAdd(config.parentRepo, wtPath, branch, baseBranch)
  wtSpinner.stop('Worktree created')

  addWorktreeToMeta(config.projectWtDir, dir)
  await applyMetaToWorktree(meta, config.parentRepo, wtPath)

  const tmpFile = process.env.__WT_CD_TMP
  if (tmpFile) fs.writeFileSync(tmpFile, wtPath)
  p.log.success(`Worktree ready: ${wtPath}`)
}
