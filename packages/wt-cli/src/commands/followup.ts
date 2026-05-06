import path from 'node:path'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import { resolveConfig, readMeta } from '../config.js'
import { claudeInteractive, resolveAgentConfig } from '../claude.js'

interface PrUser { login: string }
interface PrReview { author?: PrUser; body: string; state: string; submittedAt: string }
interface PrComment { author?: PrUser; body: string; createdAt: string }
interface PrInline { user: PrUser; body: string; path: string; line: number | null; original_line: number | null; created_at: string; in_reply_to_id?: number }
interface PrInfo { number: number; url: string; title: string; state: string; reviews: PrReview[]; comments: PrComment[] }

export async function followup() {
  const config = await resolveConfig()
  const meta = readMeta(config.projectWtDir)
  if (!meta) {
    p.log.error('Run `wt setup` first.')
    process.exit(1)
  }

  const cwd = process.cwd()
  if (!cwd.startsWith(config.projectWtDir + path.sep) && cwd !== config.projectWtDir) {
    p.log.error('wt followup must be run from inside a worktree')
    process.exit(1)
  }

  const ag = resolveAgentConfig(meta)

  const s = p.spinner()
  s.start('Fetching PR data')
  let pr: PrInfo
  let inline: PrInline[] = []
  let nameWithOwner = ''
  try {
    const { stdout } = await execa(
      'gh',
      ['pr', 'view', '--json', 'number,url,title,state,reviews,comments'],
      { cwd },
    )
    pr = JSON.parse(stdout) as PrInfo
    const repoRes = await execa('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd })
    nameWithOwner = repoRes.stdout.trim()
    const inlineRes = await execa(
      'gh',
      ['api', '--paginate', `repos/${nameWithOwner}/pulls/${pr.number}/comments`],
      { cwd },
    )
    inline = JSON.parse(inlineRes.stdout) as PrInline[]
  } catch (err) {
    s.stop('Could not fetch PR')
    const e = err as NodeJS.ErrnoException & { stderr?: string }
    if (e.code === 'ENOENT') {
      p.log.error('`gh` binary not found. Install GitHub CLI.')
    } else {
      p.log.error(e.stderr?.trim() ?? (err as Error).message)
    }
    process.exit(1)
  }
  s.stop(`PR #${pr.number} fetched (${pr.reviews.length} review(s), ${pr.comments.length} comment(s), ${inline.length} inline)`)

  const context = formatContext(pr, inline)
  const initial = `You are picking up a pull request to address review feedback.

PR: #${pr.number} — ${pr.title}
URL: ${pr.url}
State: ${pr.state}

${context}

Read everything above. Then:
1. Summarize what needs to be addressed (group related items).
2. Propose an ordered plan of action.
3. Wait for my confirmation before making changes — we will iterate together.`

  await claudeInteractive(initial, { cwd, model: ag.planModel })
}

function formatContext(pr: PrInfo, inline: PrInline[]): string {
  const blocks: string[] = []

  if (pr.reviews.length > 0) {
    blocks.push('## REVIEWS\n')
    for (const r of pr.reviews) {
      const who = r.author?.login ?? 'unknown'
      blocks.push(`### ${who} — ${r.state} (${r.submittedAt})\n${r.body || '(no body)'}\n`)
    }
  }

  if (pr.comments.length > 0) {
    blocks.push('## GENERAL COMMENTS\n')
    for (const c of pr.comments) {
      const who = c.author?.login ?? 'unknown'
      blocks.push(`### ${who} — ${c.createdAt}\n${c.body}\n`)
    }
  }

  if (inline.length > 0) {
    blocks.push('## INLINE COMMENTS (on diff)\n')
    const byPath: Record<string, PrInline[]> = {}
    for (const c of inline) {
      ;(byPath[c.path] ??= []).push(c)
    }
    for (const [file, comments] of Object.entries(byPath)) {
      blocks.push(`### ${file}\n`)
      for (const c of comments) {
        const ln = c.line ?? c.original_line ?? '?'
        const reply = c.in_reply_to_id ? ' (reply)' : ''
        blocks.push(`- L${ln} by ${c.user.login}${reply} — ${c.created_at}\n  ${c.body.replace(/\n/g, '\n  ')}\n`)
      }
    }
  }

  if (blocks.length === 0) return '(No reviews or comments yet.)'
  return blocks.join('\n')
}
