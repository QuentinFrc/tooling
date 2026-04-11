import { Command } from 'commander'
import { setup } from './commands/setup.js'
import { add } from './commands/add.js'
import { rm } from './commands/rm.js'
import { ls } from './commands/ls.js'
import { cd } from './commands/cd.js'
import { root } from './commands/root.js'
import { ide } from './commands/ide.js'
import { clean } from './commands/clean.js'
import { sync } from './commands/sync.js'
import { prepare } from './commands/prepare.js'
import { connect } from './commands/connect.js'

const program = new Command()
  .name('wt-cli')
  .description('Git worktree manager')
  .version('1.0.0')

program
  .command('setup')
  .description('Create project folder on WT_ROOT')
  .option('--base <branch>', 'Base branch to compare worktrees against', 'develop')
  .action(setup)

program
  .command('add')
  .description('Create a new worktree with a new branch')
  .argument('<branch>', 'Branch name')
  .action(add)

program
  .command('rm')
  .description('Remove a specific worktree')
  .argument('[name]', 'Worktree name')
  .action(rm)

program
  .command('ls')
  .description('List worktrees with metadata')
  .action(ls)

program
  .command('cd')
  .description('Navigate to a worktree (use with shell wrapper)')
  .argument('[name]', 'Worktree name')
  .action(cd)

program
  .command('root')
  .description('Go back to the main repo (use with shell wrapper)')
  .action(root)

program
  .command('ide')
  .description('Open a worktree in IDE')
  .argument('[name]', 'Worktree name')
  .action(ide)

program
  .command('sync')
  .description('Sync env files and IDE config from main repo to all worktrees')
  .action(sync)

program
  .command('prepare')
  .description('Install dependencies in a worktree')
  .argument('[path]', 'Worktree path (defaults to main repo)')
  .action(prepare)

program
  .command('connect')
  .description('Connect an orphan worktree to wt-cli')
  .action(connect)

program
  .command('clean')
  .description('Remove pushed + merged + clean worktrees')
  .action(clean)

program.parse()
