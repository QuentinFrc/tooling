import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { PROJECTS_DIR, DEFAULT_TARGET } from '../paths.js'

export async function setup(options: { target?: string }) {
  p.intro('claude-storage setup')

  // 1. Resolve target path
  const target =
    options.target ??
    (await p.text({
      message: 'Target directory for projects data',
      defaultValue: DEFAULT_TARGET,
      placeholder: DEFAULT_TARGET,
    }))

  if (p.isCancel(target)) {
    p.cancel('Aborted.')
    return
  }

  // 2. Check ~/.claude/projects exists
  if (!fs.existsSync(PROJECTS_DIR)) {
    p.log.error(
      '~/.claude/projects not found. Run Claude Code first to create it.'
    )
    return
  }

  // 3. If already a symlink, show where it points and exit
  const stat = fs.lstatSync(PROJECTS_DIR)
  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(PROJECTS_DIR)
    p.log.info(`Already symlinked: ~/.claude/projects -> ${linkTarget}`)
    p.outro('Nothing to do.')
    return
  }

  // 4. Check target parent directory exists (volume must be mounted)
  const targetParent = path.dirname(target)
  if (!fs.existsSync(targetParent)) {
    p.log.error(
      `Target parent ${targetParent} not found. Is the volume mounted?`
    )
    return
  }

  // 5. If target already has data, warn and ask to confirm merge
  if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target)
    if (entries.length > 0) {
      p.log.warn(`${target} already exists with ${entries.length} entries.`)
      const confirm = await p.confirm({
        message: 'Merge current projects into existing target?',
      })
      if (p.isCancel(confirm) || !confirm) {
        p.cancel('Aborted.')
        return
      }
    }
  }

  // 6. Copy ~/.claude/projects to target
  const spinner = p.spinner()
  spinner.start('Copying ~/.claude/projects to external volume...')

  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(PROJECTS_DIR, target, { recursive: true })

  spinner.stop('Copied successfully.')

  // 7. Remove original and create symlink
  spinner.start('Replacing original with symlink...')

  fs.rmSync(PROJECTS_DIR, { recursive: true })
  fs.symlinkSync(target, PROJECTS_DIR)

  spinner.stop(`Symlinked: ~/.claude/projects -> ${target}`)

  // 8. Verify the symlink resolves correctly
  const resolved = fs.realpathSync(PROJECTS_DIR)
  if (resolved === target) {
    p.outro('Setup complete. Claude Code will now use the external volume.')
  } else {
    p.log.error(`Verification failed. Expected ${target}, got ${resolved}`)
  }
}
