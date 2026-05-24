import type { RepoGraph } from './types.js'

/** Render the internal dependency graph as a Mermaid `graph LR` block. */
export function renderMermaid(graph: RepoGraph): string {
  const id = new Map<string, string>()
  graph.order.forEach((name, i) => id.set(name, `n${i}`))

  const lines: string[] = ['```mermaid', 'graph LR']

  for (const name of graph.order) {
    lines.push(`  ${id.get(name)}["${escapeLabel(name)}"]`)
  }

  for (const name of graph.order) {
    const node = graph.nodes.get(name)!
    for (const dep of node.internalDeps) {
      if (id.has(dep)) lines.push(`  ${id.get(name)} --> ${id.get(dep)}`)
    }
  }

  const appIds = idsOfType(graph, id, 'app')
  const pkgIds = idsOfType(graph, id, 'package')
  lines.push('  classDef app fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a;')
  lines.push('  classDef pkg fill:#dcfce7,stroke:#22c55e,color:#14532d;')
  if (appIds.length) lines.push(`  class ${appIds.join(',')} app;`)
  if (pkgIds.length) lines.push(`  class ${pkgIds.join(',')} pkg;`)

  lines.push('```')
  return lines.join('\n')
}

function idsOfType(graph: RepoGraph, id: Map<string, string>, type: 'app' | 'package'): string[] {
  return graph.order.filter((n) => graph.nodes.get(n)!.pkg.type === type).map((n) => id.get(n)!)
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '&quot;')
}
