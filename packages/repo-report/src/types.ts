export type PackageType = 'app' | 'package'

export interface PackageInfo {
  name: string // package.json "name"
  dir: string // absolute directory
  relDir: string // directory relative to repo root
  type: PackageType
  version: string
  private: boolean
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies: Record<string, string>
}

export interface PackageStats {
  loc: number
  files: number
  filesByExt: Record<string, number>
  lastCommit: string // human-readable relative date, or "—"
  lastCommitTs: number // unix seconds, 0 if unknown
  commitCount: number
}

export interface GraphNode {
  pkg: PackageInfo
  internalDeps: string[] // workspace package names this package depends on
  dependents: string[] // workspace package names that depend on this package
  externalDeps: number // count of non-workspace (npm) dependencies
  depth: number // longest internal dependency chain below this package
  stats: PackageStats
}

export interface RepoGraph {
  root: string
  packageManager: string
  nodes: Map<string, GraphNode>
  order: string[] // stable display order (apps first, then packages, alphabetical)
  cycles: string[][] // circular dependency groups
  orphans: string[] // packages (libs) with no dependents
}
