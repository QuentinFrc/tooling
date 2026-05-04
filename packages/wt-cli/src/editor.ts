import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'

const TEMPLATE = `

# Lines starting with # will be ignored.
# Describe the feature, fix, or audit you want the agent to plan.
# Save and exit to confirm. Empty content aborts.
`

export async function promptViaEditor(): Promise<string> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
  const tmp = path.join(os.tmpdir(), `wt-agent-${Date.now()}.md`)
  fs.writeFileSync(tmp, TEMPLATE)

  const [bin, ...args] = editor.split(' ')
  try {
    await execa(bin, [...args, tmp], { stdio: 'inherit' })
  } catch (err) {
    fs.unlinkSync(tmp)
    throw err
  }

  const raw = fs.readFileSync(tmp, 'utf-8')
  fs.unlinkSync(tmp)
  return raw
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim()
}
