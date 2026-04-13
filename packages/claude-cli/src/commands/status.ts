import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { localClaudeDir } from '../paths.js'

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
  const cwd = process.cwd()
  const project = path.basename(cwd)
  const claudeDir = localClaudeDir(cwd)

  p.intro(`claude-storage status — ${project}`)

  if (!fs.existsSync(claudeDir)) {
    p.log.warn('No .claude directory in this project.')
    p.outro('Run Claude Code here first.')
    return
  }

  const stat = fs.lstatSync(claudeDir)

  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(claudeDir)
    const resolves = fs.existsSync(claudeDir)

    p.log.info('Type: symlink')
    p.log.info(`Points to: ${linkTarget}`)
    p.log.info(`Resolves: ${resolves ? 'yes' : 'NO (broken link!)'}`)

    if (resolves) {
      const spinner = p.spinner()
      spinner.start('Calculating size...')
      const size = dirSize(claudeDir)
      spinner.stop(`Size: ${formatBytes(size)}`)
    }
  } else if (stat.isDirectory()) {
    p.log.info('Type: local directory (not moved)')

    const spinner = p.spinner()
    spinner.start('Calculating size...')
    const size = dirSize(claudeDir)
    spinner.stop(`Size: ${formatBytes(size)}`)

    p.log.info('Run `claude-storage setup` to move to an external volume.')
  } else {
    p.log.error('.claude exists but is not a directory or symlink.')
  }

  p.outro('')
}
