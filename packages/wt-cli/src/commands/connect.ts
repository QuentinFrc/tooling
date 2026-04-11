import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { readMeta, writeMeta, addWorktreeToMeta } from '../config.js'
import { getWorktreeParentRepo } from '../git.js'
import { copyEnvFiles, copyDirs } from '../env.js'
import { detectPrepareCmd, runPrepare } from './prepare.js'
import * as git from '../git.js'

export async function connect() {
  const cwd = process.cwd()
  const wtRoot = process.env.WT_ROOT ?? '/Volumes/Dev/worktrees'

  // If already under WT_ROOT, no need to connect
  if (cwd.startsWith(wtRoot)) {
    p.log.info('Already inside a tracked worktree directory — nothing to connect')
    return
  }

  // Verify we're inside a git worktree (not a main repo)
  const gitPath = path.join(cwd, '.git')
  if (!fs.existsSync(gitPath)) {
    p.log.error('Not inside a git repository')
    return
  }

  const stat = fs.statSync(gitPath)
  if (stat.isDirectory()) {
    p.log.error('This is a main git repository, not a worktree. Run this from inside a worktree.')
    return
  }

  // Parse .git file to find parent repo
  const parentRepo = getWorktreeParentRepo(cwd)
  if (!parentRepo) {
    p.log.error('Could not determine parent repository from .git file')
    return
  }

  const project = path.basename(parentRepo)
  const projectWtDir = path.join(wtRoot, project)
  const name = path.basename(cwd)
  const symlinkPath = path.join(projectWtDir, name)

  // Check if symlink/directory already exists
  if (fs.existsSync(symlinkPath)) {
    p.log.error(`${symlinkPath} already exists — worktree "${name}" is already tracked`)
    return
  }

  // Ensure projectWtDir exists
  fs.mkdirSync(projectWtDir, { recursive: true })

  // Read or create meta
  let meta = readMeta(projectWtDir)
  if (!meta) {
    p.log.info('No metadata found — initializing project configuration')

    // Detect env files (untracked .env* files)
    const allEnvFiles = fs.readdirSync(parentRepo).filter(
      (f) => f.startsWith('.env') && fs.statSync(path.join(parentRepo, f)).isFile()
    )
    const envFiles: string[] = []
    for (const file of allEnvFiles) {
      const tracked = await git.isTracked(parentRepo, file)
      if (!tracked) envFiles.push(file)
    }

    // Detect IDE directories
    const knownIdeDirs = ['.idea', '.vscode', '.cursor', '.zed', '.fleet']
    const ideDirs: string[] = []
    for (const dir of knownIdeDirs) {
      const dirPath = path.join(parentRepo, dir)
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const tracked = await git.isTracked(parentRepo, dir)
        if (!tracked) ideDirs.push(dir)
      }
    }

    const prepareCmd = detectPrepareCmd(parentRepo)

    meta = {
      parentRepo,
      defaultBranch: 'develop',
      envFiles,
      ideDirs,
      prepareCmd: prepareCmd ?? undefined,
      worktrees: [],
    }
    writeMeta(projectWtDir, meta)
    p.log.success(`Initialized metadata for ${project}`)
  }

  // Create symlink: projectWtDir/name -> cwd
  fs.symlinkSync(cwd, symlinkPath)
  p.log.success(`Created symlink ${symlinkPath} → ${cwd}`)

  // Register in metadata
  addWorktreeToMeta(projectWtDir, name)

  // Sync env files
  const envFiles = meta.envFiles ?? []
  if (envFiles.length > 0) {
    const copied = copyEnvFiles(parentRepo, cwd, envFiles)
    if (copied.length > 0) {
      p.log.success(`Copied ${copied.join(', ')} to worktree`)
    }
  }

  // Sync IDE dirs
  const ideDirs = meta.ideDirs ?? []
  if (ideDirs.length > 0) {
    const copied = copyDirs(parentRepo, cwd, ideDirs)
    if (copied.length > 0) {
      p.log.success(`Copied ${copied.join(', ')} to worktree`)
    }
  }

  // Run prepare
  const prepareCmd = meta.prepareCmd ?? detectPrepareCmd(parentRepo)
  if (prepareCmd) {
    const s = p.spinner()
    s.start(`Running ${prepareCmd}`)
    await runPrepare(cwd, prepareCmd)
    s.stop('Dependencies installed')
  }

  p.log.success(`Worktree "${name}" connected to ${project}`)
}
