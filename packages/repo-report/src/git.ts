import { execa } from 'execa'

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root })
    return true
  } catch {
    return false
  }
}

export interface GitActivity {
  lastCommit: string // human-readable relative date, or "—"
  lastCommitTs: number // unix seconds, 0 if unknown
  commitCount: number
}

/** Last-commit date and total commit count scoped to a package directory. */
export async function gitActivity(root: string, relDir: string): Promise<GitActivity> {
  const target = relDir || '.'
  const [last, count] = await Promise.all([
    execa('git', ['log', '-1', '--format=%ct\t%cr', '--', target], { cwd: root })
      .then((r) => r.stdout.trim())
      .catch(() => ''),
    execa('git', ['rev-list', '--count', 'HEAD', '--', target], { cwd: root })
      .then((r) => parseInt(r.stdout.trim(), 10) || 0)
      .catch(() => 0),
  ])

  const [ts = '', rel = ''] = last.split('\t')
  return {
    lastCommit: rel || '—',
    lastCommitTs: parseInt(ts, 10) || 0,
    commitCount: count,
  }
}
