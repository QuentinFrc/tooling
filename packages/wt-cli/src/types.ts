export type Tier = 'merged' | 'idle' | 'stale'
export type SkipReason = 'dirty' | 'unpushed'

export interface WorktreeInfo {
  path: string
  name: string
  branch: string
}

export interface ClassifiedWorktree extends WorktreeInfo {
  tier: Tier | null
  skipReason?: SkipReason
  dirtyCount?: number
  pushed: boolean
  detail: string
}

export interface ClassifyResult {
  merged: ClassifiedWorktree[]
  idle: ClassifiedWorktree[]
  stale: ClassifiedWorktree[]
  kept: ClassifiedWorktree[]
}

export interface Config {
  wtRoot: string
  project: string
  projectWtDir: string
  parentRepo: string
}

export interface WtMeta {
  parentRepo: string
  defaultBranch: string
  envFiles: string[]
  ideDirs: string[]
  prepareCmd?: string
  worktrees: string[]
}
