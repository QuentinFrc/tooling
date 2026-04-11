import { Command } from 'commander'
import { setup } from './commands/setup.js'
import { status } from './commands/status.js'

const program = new Command()
  .name('claude-storage')
  .description('Manage Claude Code storage location')
  .version('1.0.0')

program
  .command('setup')
  .description('Move ~/.claude/projects to an external volume and symlink it back')
  .option('-t, --target <path>', 'Target directory on external volume')
  .action(setup)

program
  .command('status')
  .description('Show current ~/.claude/projects storage state')
  .action(status)

program.parse()
