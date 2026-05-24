import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { findRepoRoot, loadPackages } from '../discover.js'
import { collectFileStats } from '../loc.js'
import { isGitRepo, gitActivity } from '../git.js'
import { buildGraph, serializeGraph } from '../graph.js'
import { renderReport } from '../report.js'
import { pool } from '../pool.js'
import type { PackageStats } from '../types.js'

export interface ReportOptions {
  out: string
  stdout?: boolean
  json?: boolean
  git: boolean // commander sets this to false via --no-git
}

export async function report(pathArg: string | undefined, opts: ReportOptions): Promise<void> {
  const start = path.resolve(pathArg ?? process.cwd())
  const root = findRepoRoot(start)

  p.intro(`repo-report · ${path.basename(root)}`)

  const { packages, packageManager } = loadPackages(root)
  if (packages.length === 0) {
    p.log.error('No workspace packages found. Is this a pnpm / npm / yarn monorepo?')
    p.outro('Nothing to report.')
    return
  }

  const useGit = opts.git && (await isGitRepo(root))
  if (opts.git && !useGit) p.log.warn('Not a git repository — skipping git activity stats.')

  const spin = p.spinner()
  spin.start(`Analyzing ${packages.length} packages`)

  const entries = await pool(packages, 8, async (pkg): Promise<[string, PackageStats]> => {
    const [files, activity] = await Promise.all([
      collectFileStats(root, pkg, useGit),
      useGit
        ? gitActivity(root, pkg.relDir)
        : Promise.resolve({ lastCommit: '—', lastCommitTs: 0, commitCount: 0 }),
    ])
    return [
      pkg.name,
      {
        loc: files.loc,
        files: files.files,
        filesByExt: files.filesByExt,
        lastCommit: activity.lastCommit,
        lastCommitTs: activity.lastCommitTs,
        commitCount: activity.commitCount,
      },
    ]
  })

  const statsMap = new Map(entries)
  spin.stop(`Analyzed ${packages.length} packages`)

  const graph = buildGraph(root, packageManager, packages, statsMap)
  const markdown = renderReport(graph, { git: useGit })

  if (opts.stdout) {
    process.stdout.write(markdown)
    p.outro('Done.')
    return
  }

  const outPath = path.resolve(process.cwd(), opts.out)
  fs.writeFileSync(outPath, markdown)

  if (opts.json) {
    const jsonPath = outPath.replace(/\.md$/i, '') + '.json'
    fs.writeFileSync(jsonPath, JSON.stringify(serializeGraph(graph), null, 2))
    p.log.info(`Wrote ${path.relative(process.cwd(), jsonPath)}`)
  }

  const apps = packages.filter((p) => p.type === 'app').length
  const libs = packages.length - apps
  p.note(
    [
      `${apps} apps · ${libs} packages`,
      `${graph.cycles.length} circular · ${graph.orphans.length} orphan`,
    ].join('\n'),
    'Summary',
  )
  p.outro(`Report written to ${path.relative(process.cwd(), outPath)}`)
}
