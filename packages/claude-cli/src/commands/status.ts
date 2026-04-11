import fs from 'node:fs'
import * as p from '@clack/prompts'
import { PROJECTS_DIR } from '../paths.js'

function dirSize(dirPath: string): number {
  let total = 0
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = `${dirPath}/${entry.name}`
    if (entry.isDirectory()) {
      total += dirSize(full)
    } else if (entry.isFile()) {
      total += fs.statSync(full).size
    }
  }
  return total
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export async function status() {
  p.intro('claude-storage status')

  if (!fs.existsSync(PROJECTS_DIR)) {
    p.log.warn('~/.claude/projects does not exist.')
    p.outro('Run Claude Code first to create it.')
    return
  }

  const stat = fs.lstatSync(PROJECTS_DIR)

  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(PROJECTS_DIR)
    const resolves = fs.existsSync(PROJECTS_DIR)

    p.log.info(`Type: symlink`)
    p.log.info(`Points to: ${linkTarget}`)
    p.log.info(`Resolves: ${resolves ? 'yes' : 'NO (broken link!)'}`)

    if (resolves) {
      const spinner = p.spinner()
      spinner.start('Calculating size...')
      const size = dirSize(PROJECTS_DIR)
      spinner.stop(`Size: ${formatBytes(size)}`)
    }
  } else if (stat.isDirectory()) {
    p.log.info('Type: local directory (not moved)')

    const spinner = p.spinner()
    spinner.start('Calculating size...')
    const size = dirSize(PROJECTS_DIR)
    spinner.stop(`Size: ${formatBytes(size)}`)

    p.log.info('Run `claude-storage setup` to move to an external volume.')
  } else {
    p.log.error('~/.claude/projects exists but is not a directory or symlink.')
  }

  p.outro('')
}
