import path from 'node:path'
import os from 'node:os'

export const CLAUDE_DIR = path.join(os.homedir(), '.claude')
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')
export const DEFAULT_TARGET = '/Volumes/Dev/claude-data/projects'
