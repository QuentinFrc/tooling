import path from 'node:path'

export const DEFAULT_VOLUME = '/Volumes/Dev/claude-data'

export function localClaudeDir(cwd: string): string {
  return path.join(cwd, '.claude')
}
