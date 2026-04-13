import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { DEFAULT_VOLUME, localClaudeDir } from '../paths.js'

export async function setup(options: { target?: string }) {
  const cwd = process.cwd()
  const project = path.basename(cwd)
  const sourceDir = localClaudeDir(cwd)

  p.intro(`claude-storage setup — ${project}`)

  // 1. Check .claude exists locally
  if (!fs.existsSync(sourceDir)) {
    p.log.error(`No .claude directory found in ${cwd}.\n  Run Claude Code in this directory first.`)
    return
  }

  // 2. Already a symlink
  const stat = fs.lstatSync(sourceDir)
  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(sourceDir)
    p.log.info(`Already symlinked: .claude -> ${linkTarget}`)
    p.outro('Nothing to do.')
    return
  }

  // 3. Resolve target
  const volume = options.target ?? DEFAULT_VOLUME
  const targetDir = path.join(volume, project, '.claude')

  if (!fs.existsSync(volume)) {
    p.log.error(`Volume ${volume} not found. Is it mounted?`)
    return
  }

  // 4. Target already has data
  if (fs.existsSync(targetDir)) {
    const entries = fs.readdirSync(targetDir)
    if (entries.length > 0) {
      p.log.warn(`${targetDir} already exists with ${entries.length} entries.`)
      const confirm = await p.confirm({
        message: 'Merge current data into existing target?',
      })
      if (p.isCancel(confirm) || !confirm) {
        p.cancel('Aborted.')
        return
      }
    }
  }

  // 5. Copy
  const spinner = p.spinner()
  spinner.start('Copying .claude to external volume...')

  fs.mkdirSync(targetDir, { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })

  spinner.stop('Copied successfully.')

  // 6. Replace with symlink
  spinner.start('Replacing with symlink...')

  fs.rmSync(sourceDir, { recursive: true })
  fs.symlinkSync(targetDir, sourceDir)

  spinner.stop(`Symlinked: .claude -> ${targetDir}`)

  // 7. Verify
  const resolved = fs.realpathSync(sourceDir)
  if (resolved === targetDir) {
    p.outro('Done.')
  } else {
    p.log.error(`Verification failed. Expected ${targetDir}, got ${resolved}`)
  }
}
