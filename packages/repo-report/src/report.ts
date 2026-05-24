import path from 'node:path'
import { renderMermaid } from './mermaid.js'
import type { GraphNode, RepoGraph } from './types.js'

interface RenderOptions {
  git: boolean
}

export function renderReport(graph: RepoGraph, opts: RenderOptions): string {
  const sections = [
    header(graph),
    overview(graph),
    dependencyGraph(graph),
    packageTable(graph, opts),
    highlights(graph, opts),
  ]
  return sections.filter(Boolean).join('\n\n') + '\n'
}

function header(graph: RepoGraph): string {
  const name = path.basename(graph.root)
  const date = new Date().toISOString().slice(0, 10)
  const count = graph.order.length
  return [
    `# Repo Report — ${name}`,
    '',
    `> Generated ${date} · ${graph.packageManager} workspace · ${count} package${count === 1 ? '' : 's'}`,
  ].join('\n')
}

function overview(graph: RepoGraph): string {
  const nodes = [...graph.nodes.values()]
  const apps = nodes.filter((n) => n.pkg.type === 'app').length
  const libs = nodes.filter((n) => n.pkg.type === 'package').length
  const totalLoc = sum(nodes.map((n) => n.stats.loc))
  const totalFiles = sum(nodes.map((n) => n.stats.files))
  const edges = sum(nodes.map((n) => n.internalDeps.length))
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth))
  const externalDeps = uniqueExternalDeps(graph)

  const rows: [string, string | number][] = [
    ['Apps', apps],
    ['Packages', libs],
    ['Lines of code', fmt(totalLoc)],
    ['Source files', fmt(totalFiles)],
    ['Internal dependency edges', edges],
    ['Unique external dependencies', externalDeps],
    ['Max dependency depth', maxDepth],
    ['Circular dependencies', graph.cycles.length],
    ['Orphan packages', graph.orphans.length],
  ]

  return ['## Overview', '', '| Metric | Value |', '| --- | --- |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

function dependencyGraph(graph: RepoGraph): string {
  if (graph.order.length === 0) return ''
  return ['## Dependency graph', '', '🔵 app  🟢 package', '', renderMermaid(graph)].join('\n')
}

function packageTable(graph: RepoGraph, opts: RenderOptions): string {
  const head = opts.git
    ? '| Package | Type | Path | Deps | Used by | Depth | LOC | Files | Last commit | Commits |'
    : '| Package | Type | Path | Deps | Used by | Depth | LOC | Files |'
  const divider = opts.git
    ? '| --- | --- | --- | --: | --: | --: | --: | --: | --- | --: |'
    : '| --- | --- | --- | --: | --: | --: | --: | --: |'

  const rows = graph.order.map((name) => {
    const n = graph.nodes.get(name)!
    const base = [
      `\`${name}\``,
      n.pkg.type,
      `\`${n.pkg.relDir}\``,
      n.internalDeps.length,
      n.dependents.length,
      n.depth,
      fmt(n.stats.loc),
      fmt(n.stats.files),
    ]
    if (opts.git) base.push(n.stats.lastCommit, fmt(n.stats.commitCount))
    return `| ${base.join(' | ')} |`
  })

  return ['## Packages', '', head, divider, ...rows].join('\n')
}

function highlights(graph: RepoGraph, opts: RenderOptions): string {
  const blocks: string[] = ['## Highlights']

  if (graph.cycles.length > 0) {
    const items = graph.cycles.map((c) => `- ⚠️ ${c.map((n) => `\`${n}\``).join(' → ')} → \`${c[0]}\``)
    blocks.push(['### Circular dependencies', '', ...items].join('\n'))
  }

  if (graph.orphans.length > 0) {
    const items = graph.orphans.map((n) => `- \`${n}\``)
    blocks.push(['### Orphan packages', '', '_Packages with no internal dependents:_', '', ...items].join('\n'))
  }

  blocks.push(topList('Most depended-on', graph, (n) => n.dependents.length, (n) => `${n.dependents.length} dependents`))
  blocks.push(topList('Largest packages', graph, (n) => n.stats.loc, (n) => `${fmt(n.stats.loc)} LOC`))

  if (opts.git) {
    blocks.push(topList('Most active', graph, (n) => n.stats.commitCount, (n) => `${fmt(n.stats.commitCount)} commits`))
  }

  return blocks.join('\n\n')
}

function topList(
  title: string,
  graph: RepoGraph,
  metric: (n: GraphNode) => number,
  label: (n: GraphNode) => string,
  limit = 5,
): string {
  const ranked = graph.order
    .map((name) => graph.nodes.get(name)!)
    .filter((n) => metric(n) > 0)
    .sort((a, b) => metric(b) - metric(a))
    .slice(0, limit)

  if (ranked.length === 0) return `### ${title}\n\n_None._`
  const items = ranked.map((n) => `- \`${n.pkg.name}\` — ${label(n)}`)
  return [`### ${title}`, '', ...items].join('\n')
}

function uniqueExternalDeps(graph: RepoGraph): number {
  const names = new Set(graph.order)
  const external = new Set<string>()
  for (const node of graph.nodes.values()) {
    const all = {
      ...node.pkg.dependencies,
      ...node.pkg.devDependencies,
      ...node.pkg.peerDependencies,
    }
    for (const dep of Object.keys(all)) {
      if (!names.has(dep)) external.add(dep)
    }
  }
  return external.size
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}
