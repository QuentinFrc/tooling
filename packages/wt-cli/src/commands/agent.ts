import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { copyEnvFiles, copyDirs } from '../env.js'
import { detectPrepareCmd, runPrepare } from './prepare.js'
import { claudeHeadless, resolveAgentConfig } from '../claude.js'
import { promptViaEditor } from '../editor.js'

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
  const slugRaw = await claudeHeadless(slugInstruction(userPrompt), {
    model: ag.slugModel,
    cwd: config.parentRepo,
  })
  slugSpinner.stop('Branch name picked')

  const parsed = parseSlug(slugRaw)
  if (!parsed) {
    p.log.error(`Could not parse slug response from Claude:\n${slugRaw}`)
    process.exit(1)
  }
  const { kind, slug } = parsed
  const prefix = kind === 'audit' ? 'audit' : kind === 'fix' ? 'fix' : 'feat'
  const branch = `${prefix}/${slug}`
  const dir = branch.replaceAll('/', '-')
  const wtPath = path.join(config.projectWtDir, dir)

  if (fs.existsSync(wtPath)) {
    p.log.error(`Worktree ${dir} already exists at ${wtPath}`)
    process.exit(1)
  }

  p.log.info(`Branch: ${branch}`)

  fs.mkdirSync(config.projectWtDir, { recursive: true })
  const baseBranch = meta.defaultBranch ?? 'develop'

  const wtSpinner = p.spinner()
  wtSpinner.start(`Creating worktree at ${wtPath}`)
  await git.worktreeAdd(config.parentRepo, wtPath, branch, baseBranch)
  wtSpinner.stop('Worktree created')

  addWorktreeToMeta(config.projectWtDir, dir)

  if (meta.envFiles?.length) {
    const copied = copyEnvFiles(config.parentRepo, wtPath, meta.envFiles)
    if (copied.length) p.log.success(`Copied env: ${copied.join(', ')}`)
  }
  if (meta.ideDirs?.length) {
    const copied = copyDirs(config.parentRepo, wtPath, meta.ideDirs)
    if (copied.length) p.log.success(`Copied IDE: ${copied.join(', ')}`)
  }

  const prepareCmd = meta.prepareCmd ?? detectPrepareCmd(config.parentRepo)
  if (prepareCmd) {
    const depSpinner = p.spinner()
    depSpinner.start(`Running ${prepareCmd}`)
    await runPrepare(wtPath, prepareCmd)
    depSpinner.stop('Dependencies installed')
  }

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

function slugInstruction(userPrompt: string): string {
  return `From the user prompt below, output a single JSON object with two fields:
- "kind": one of "feature", "fix", "audit"
- "slug": kebab-case branch suffix (max 5 words, [a-z0-9-] only)

Output ONLY the JSON object, no prose, no markdown fences.

PROMPT:
${userPrompt}`
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

function parseSlug(raw: string): { kind: 'feature' | 'fix' | 'audit'; slug: string } | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/m, '')
    .replace(/```$/m, '')
    .trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0]) as { kind?: unknown; slug?: unknown }
    const kind = obj.kind
    const slug = obj.slug
    if (kind !== 'feature' && kind !== 'fix' && kind !== 'audit') return null
    if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) return null
    return { kind, slug }
  } catch {
    return null
  }
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
