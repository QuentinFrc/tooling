import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta, writeMeta, addWorktreeToMeta } from '../config.js'
import * as git from '../git.js'
import { applyMetaToWorktree } from '../setup-worktree.js'

export async function add(nameArg?: string) {
  const config = await resolveConfig()

  let meta = readMeta(config.projectWtDir)
  if (!meta) {
    fs.mkdirSync(config.projectWtDir, { recursive: true })
    writeMeta(config.projectWtDir, {
      parentRepo: config.parentRepo,
      defaultBranch: 'develop',
      copy: [],
      worktrees: [],
    })
    meta = readMeta(config.projectWtDir)!
  }

  let rawName: string
  if (nameArg && nameArg.trim()) {
    rawName = nameArg
  } else {
    const answer = await p.text({
      message: 'Branch name',
      placeholder: 'feat/my-thing',
      validate: (v) => (v.trim() ? undefined : 'Name is required'),
    })
    if (p.isCancel(answer)) {
      p.log.info('Cancelled.')
      process.exit(1)
    }
    rawName = answer
  }

  // Branch keeps slashes (e.g. feat/foo); dir flattens them. Whitespace → dash.
  const branch = rawName.trim().replace(/\s+/g, '-')
  const dir = branch.replaceAll('/', '-')

  const wtPath = path.join(config.projectWtDir, dir)
  if (fs.existsSync(wtPath)) {
    p.log.error(`Worktree ${dir} already exists at ${wtPath}`)
    process.exit(1)
  }

  const baseBranch = meta.defaultBranch ?? 'develop'

  const wtSpinner = p.spinner()
  wtSpinner.start('Fetching origin')
  try {
    await git.fetch(config.parentRepo)
  } catch {
    wtSpinner.message('Fetch failed (offline?) — using local refs')
  }
  wtSpinner.message(`Creating worktree at ${wtPath}`)
  const result = await git.worktreeAdd(config.parentRepo, wtPath, branch, baseBranch)
  const doneMsg: Record<git.WorktreeAddResult, string> = {
    created: `Created ${branch} from ${baseBranch}`,
    existing: `Checked out existing branch ${branch}`,
    'existing-updated': `Checked out ${branch} (fast-forwarded to origin/${branch})`,
    remote: `Checked out ${branch} from origin/${branch}`,
  }
  wtSpinner.stop(doneMsg[result])

  addWorktreeToMeta(config.projectWtDir, dir)
  await applyMetaToWorktree(meta, config.parentRepo, wtPath)

  const tmpFile = process.env.__WT_CD_TMP
  if (tmpFile) fs.writeFileSync(tmpFile, wtPath)
  p.log.success(`Worktree ready: ${wtPath}`)
}
