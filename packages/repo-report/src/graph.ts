import type { GraphNode, PackageInfo, PackageStats, RepoGraph } from './types.js'

export function buildGraph(
  root: string,
  packageManager: string,
  packages: PackageInfo[],
  statsMap: Map<string, PackageStats>,
): RepoGraph {
  const names = new Set(packages.map((p) => p.name))
  const nodes = new Map<string, GraphNode>()

  for (const pkg of packages) {
    const allDeps = { ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.dependencies }
    const depNames = Object.keys(allDeps)
    const internalDeps = unique(depNames.filter((d) => names.has(d) && d !== pkg.name))
    const externalDeps = depNames.filter((d) => !names.has(d)).length
    nodes.set(pkg.name, {
      pkg,
      internalDeps,
      dependents: [],
      externalDeps,
      depth: 0,
      stats: statsMap.get(pkg.name) ?? emptyStats(),
    })
  }

  for (const [name, node] of nodes) {
    for (const dep of node.internalDeps) {
      nodes.get(dep)?.dependents.push(name)
    }
  }
  for (const node of nodes.values()) node.dependents.sort()

  computeDepths(nodes)
  const cycles = findCycles(nodes)
  const order = packages.map((p) => p.name)
  const orphans = order.filter((name) => {
    const node = nodes.get(name)!
    return node.pkg.type === 'package' && node.dependents.length === 0
  })

  return { root, packageManager, nodes, order, cycles, orphans }
}

export function serializeGraph(graph: RepoGraph) {
  return {
    root: graph.root,
    packageManager: graph.packageManager,
    cycles: graph.cycles,
    orphans: graph.orphans,
    packages: graph.order.map((name) => {
      const node = graph.nodes.get(name)!
      return {
        name,
        type: node.pkg.type,
        version: node.pkg.version,
        path: node.pkg.relDir,
        internalDeps: node.internalDeps,
        dependents: node.dependents,
        externalDeps: node.externalDeps,
        depth: node.depth,
        stats: node.stats,
      }
    }),
  }
}

/** Longest internal dependency chain rooted at each node (cycle-safe). */
function computeDepths(nodes: Map<string, GraphNode>): void {
  const memo = new Map<string, number>()
  const visiting = new Set<string>()

  function depth(name: string): number {
    const cached = memo.get(name)
    if (cached !== undefined) return cached
    if (visiting.has(name)) return 0 // break cycles
    visiting.add(name)
    let max = 0
    for (const dep of nodes.get(name)?.internalDeps ?? []) {
      if (nodes.has(dep)) max = Math.max(max, 1 + depth(dep))
    }
    visiting.delete(name)
    memo.set(name, max)
    return max
  }

  for (const [name, node] of nodes) node.depth = depth(name)
}

/** Tarjan's SCC algorithm; a cycle is any component with >1 node or a self-dependency. */
function findCycles(nodes: Map<string, GraphNode>): string[][] {
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccs: string[][] = []

  function strongConnect(v: string): void {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    for (const w of nodes.get(v)?.internalDeps ?? []) {
      if (!nodes.has(w)) continue
      if (!idx.has(w)) {
        strongConnect(w)
        low.set(v, Math.min(low.get(v)!, low.get(w)!))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!))
      }
    }

    if (low.get(v) === idx.get(v)) {
      const component: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        component.push(w)
      } while (w !== v)
      sccs.push(component)
    }
  }

  for (const v of nodes.keys()) {
    if (!idx.has(v)) strongConnect(v)
  }

  const cycles: string[][] = []
  for (const component of sccs) {
    if (component.length > 1) {
      cycles.push(component.sort())
    } else {
      const [only] = component
      if (nodes.get(only)!.internalDeps.includes(only)) cycles.push(component)
    }
  }
  return cycles
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function emptyStats(): PackageStats {
  return { loc: 0, files: 0, filesByExt: {}, lastCommit: '—', lastCommitTs: 0, commitCount: 0 }
}
