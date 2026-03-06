import { resolveConfig } from '../config.js'

export async function root() {
  try {
    const config = await resolveConfig()
    process.stdout.write(config.parentRepo)
  } catch {
    process.stderr.write('Not in a git repository or worktree directory\n')
    process.exit(1)
  }
}
