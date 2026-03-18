import { execa } from 'execa'

export async function getProjectRoot(): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'])
  return stdout.trim()
}

export async function fetch(cwd: string): Promise<void> {
  await execa('git', ['fetch', '--quiet'], { cwd })
}

export async function worktreePrune(cwd: string): Promise<void> {
  await execa('git', ['worktree', 'prune'], { cwd })
}

export async function worktreeAdd(cwd: string, wtPath: string, branch: string, startPoint?: string): Promise<void> {
  const exists = await refExists(cwd, branch)
  if (exists) {
    await execa('git', ['worktree', 'add', wtPath, branch], { cwd })
  } else {
    const args = ['worktree', 'add', wtPath, '-b', branch]
    if (startPoint) args.push(startPoint)
    await execa('git', args, { cwd })
  }
}

export async function worktreeRemove(wtPath: string, cwd?: string): Promise<void> {
  // Get branch name before removing
  const branch = await branchCurrent(wtPath)
  await execa('git', ['worktree', 'remove', wtPath, '--force'])
  // Delete the local branch from the main repo
  if (branch && cwd) {
    try {
      await execa('git', ['branch', '-D', branch], { cwd })
    } catch {
      // branch might already be gone or is checked out elsewhere
    }
  }
}

export async function worktreeList(cwd: string): Promise<string[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd })
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.replace('worktree ', ''))
}

export async function branchCurrent(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['branch', '--show-current'], { cwd })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function statusPorcelain(cwd: string): Promise<number> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd })
  if (!stdout.trim()) return 0
  return stdout.trim().split('\n').length
}

export async function revListCount(cwd: string, range: string): Promise<number> {
  try {
    const { stdout } = await execa('git', ['rev-list', range, '--count'], { cwd })
    return parseInt(stdout.trim(), 10)
  } catch {
    return 999
  }
}

export async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '@{u}'], { cwd })
    return true
  } catch {
    return false
  }
}

export async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', ref], { cwd })
    return true
  } catch {
    return false
  }
}

export async function mergeBase(cwd: string, ref1: string, ref2: string): Promise<string> {
  const { stdout } = await execa('git', ['merge-base', ref1, ref2], { cwd })
  return stdout.trim()
}

export async function commitTree(cwd: string, tree: string, parent: string, message: string): Promise<string> {
  const { stdout } = await execa('git', ['commit-tree', tree, '-p', parent, '-m', message], { cwd })
  return stdout.trim()
}

export async function cherry(cwd: string, upstream: string, head: string, base: string): Promise<string> {
  const { stdout } = await execa('git', ['cherry', upstream, head, base], { cwd })
  return stdout.trim()
}

export async function lastCommit(cwd: string): Promise<{ date: string; message: string }> {
  const { stdout } = await execa('git', ['log', '-1', '--format=%cr\t%s'], { cwd })
  const [date = '', message = ''] = stdout.trim().split('\t')
  return { date, message }
}

export async function revParseTree(cwd: string, ref: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', `${ref}^{tree}`], { cwd })
  return stdout.trim()
}

export async function isTracked(cwd: string, file: string): Promise<boolean> {
  try {
    await execa('git', ['ls-files', '--error-unmatch', file], { cwd })
    return true
  } catch {
    return false
  }
}
