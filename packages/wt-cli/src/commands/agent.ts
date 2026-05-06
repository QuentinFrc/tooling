import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { claudeHeadless, resolveAgentConfig } from '../claude.js'
import { promptViaEditor } from '../editor.js'
import { generateSlug } from '../slug.js'
import { applyMetaToWorktree } from '../setup-worktree.js'

const PLAN_FILES = ['PLAN.md', 'AUDIT.md']

export async function agent(promptArg?: string) {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
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
  const { kind, branch, dir } = await generateSlug(userPrompt, ag.slugModel, config.parentRepo)
  slugSpinner.stop(`Branch: ${branch}`)

  const wtPath = path.join(config.projectWtDir, dir)
  if (fs.existsSync(wtPath)) {
    p.log.error(`Worktree ${dir} already exists at ${wtPath}`)
    process.exit(1)
  }

  fs.mkdirSync(config.projectWtDir, { recursive: true })
  const baseBranch = meta.defaultBranch ?? 'develop'

  const wtSpinner = p.spinner()
  wtSpinner.start(`Creating worktree at ${wtPath}`)
  await git.worktreeAdd(config.parentRepo, wtPath, branch, baseBranch)
  wtSpinner.stop('Worktree created')

  addWorktreeToMeta(config.projectWtDir, dir)
  await applyMetaToWorktree(meta, config.parentRepo, wtPath)

  ensureLocalGitignore(wtPath, PLAN_FILES)

  const fileName = kind === 'audit' ? 'AUDIT.md' : 'PLAN.md'
  const planSpinner = p.spinner()
  planSpinner.start(`Generating ${fileName} (${ag.planModel})`)
  await claudeHeadless(planInstruction(kind, userPrompt, fileName), {
    model: ag.planModel,
    cwd: wtPath,
    permissionMode: 'acceptEdits',
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'Write'],
  })
  planSpinner.stop(`${fileName} ready`)

  if (!fs.existsSync(path.join(wtPath, fileName))) {
    p.log.warn(`Expected ${fileName} but it was not created. Inspect the worktree.`)
  }

  const tmpFile = process.env.__WT_CD_TMP
  if (tmpFile) {
    fs.writeFileSync(tmpFile, wtPath)
    p.log.success(`Worktree ready: ${wtPath}`)
  } else {
    p.log.success(`Worktree ready: ${wtPath}`)
    p.log.info(`Next: wt cd ${dir}  &&  wt go`)
  }
}

function planInstruction(kind: 'feature' | 'fix' | 'audit', userPrompt: string, fileName: string): string {
  if (kind === 'audit') {
    return `You are doing a CODE AUDIT. Explore the codebase to answer the user's request. Then write a thorough audit at "${fileName}" at the repo root using the Write tool.

The audit must be specific: cite files with line numbers. Do NOT change any other code.

USER REQUEST:
${userPrompt}`
  }
  return `You are PLANNING an implementation. Explore the codebase to understand the relevant files and patterns. Then write a step-by-step plan at "${fileName}" at the repo root using the Write tool.

The plan must be concrete: list files to create/modify, key functions, order of steps, and any open questions. Do NOT change any other code.

USER REQUEST:
${userPrompt}`
}

function ensureLocalGitignore(wtPath: string, files: string[]): void {
  const gitMarker = path.join(wtPath, '.git')
  let infoDir: string
  const stat = fs.statSync(gitMarker)
  if (stat.isFile()) {
    const content = fs.readFileSync(gitMarker, 'utf-8').trim()
    const m = content.match(/^gitdir:\s+(.+)$/)
    if (!m) return
    infoDir = path.join(m[1], 'info')
  } else {
    infoDir = path.join(gitMarker, 'info')
  }
  fs.mkdirSync(infoDir, { recursive: true })
  const excludePath = path.join(infoDir, 'exclude')
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf-8') : ''
  const lines = new Set(existing.split('\n').map((l) => l.trim()).filter(Boolean))
  let changed = false
  for (const f of files) {
    if (!lines.has(f)) {
      lines.add(f)
      changed = true
    }
  }
  if (changed) fs.writeFileSync(excludePath, [...lines].join('\n') + '\n')
}
