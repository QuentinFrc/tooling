import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { resolveConfig, readMeta } from '../config.js'
import { claudeInteractive, resolveAgentConfig } from '../claude.js'

export async function go() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt go must be run from inside a worktree')
    process.exit(1)
  }

  const planFile = ['PLAN.md', 'AUDIT.md'].find((f) => fs.existsSync(path.join(cwd, f)))
  if (!planFile) {
    p.log.error('No PLAN.md or AUDIT.md in this worktree. Run `wt agent` first.')
    process.exit(1)
  }

  const ag = resolveAgentConfig(meta)
  const initial = `Read \`${planFile}\` at the project root — it is the source of truth for what needs to be done. Implement it step by step. The file is gitignored locally; do not commit it.`

  await claudeInteractive(initial, { cwd, model: ag.planModel })
}
