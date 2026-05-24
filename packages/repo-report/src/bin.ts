import { Command } from 'commander'
import { report } from './commands/report.js'

const program = new Command()
  .name('repo-report')
  .description('Generate a dependency + stats report for a monorepo (apps/ & packages/)')
  .version('1.0.0')
  .argument('[path]', 'Path inside the repo to analyze (defaults to cwd)')
  .option('-o, --out <file>', 'Output markdown file', 'repo-report.md')
  .option('--stdout', 'Print the report to stdout instead of writing a file')
  .option('--json', 'Also write the raw graph data as JSON next to the report')
  .option('--no-git', 'Skip git activity stats (last commit, commit count)')
  .action(report)

program.parseAsync()
