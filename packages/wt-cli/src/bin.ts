import { Command } from 'commander'
import { setup } from './commands/setup.js'
import { add } from './commands/add.js'
import { rm } from './commands/rm.js'
import { ls } from './commands/ls.js'
import { cd } from './commands/cd.js'
import { root } from './commands/root.js'
import { ide } from './commands/ide.js'
import { sync } from './commands/sync.js'
import { prepare } from './commands/prepare.js'
import { rename } from './commands/rename.js'
import { agent } from './commands/agent.js'
import { go } from './commands/go.js'
import { release } from './commands/release.js'
import { followup } from './commands/followup.js'
import { close } from './commands/close.js'
import { scan } from './commands/scan.js'
import { prune } from './commands/prune.js'

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
  .description('Create a new worktree from a prompt (Claude picks the branch name)')
  .argument('[prompt]', 'Prompt text (opens $EDITOR if omitted)')
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
  .command('scan')
  .description('Reconcile git worktrees with .wt.json (adopt orphans, drop stale entries)')
  .action(scan)

program
  .command('rename')
  .description('Rename a worktree branch and directory')
  .argument('[name]', 'Worktree name')
  .action(rename)

program
  .command('prune')
  .description('Interactively prune worktrees and/or local branches')
  .option('--no-worktrees', 'Skip worktree pruning')
  .option('--no-branches', 'Skip branch pruning')
  .action(prune)

program
  .command('agent')
  .description('Create worktree from a prompt and generate a plan via Claude')
  .argument('[prompt]', 'Prompt text (opens $EDITOR if omitted)')
  .action(agent)

program
  .command('go')
  .description('Launch interactive Claude in this worktree using the local PLAN.md/AUDIT.md')
  .action(go)

program
  .command('release')
  .description('Commit, push, rebase if behind, create PR, and post a Claude review')
  .action(release)

program
  .command('followup')
  .description('Launch interactive Claude with PR reviews + comments to address them')
  .action(followup)

program
  .command('close')
  .description('Merge the PR, remove the worktree, and cd back to main repo')
  .option('--squash', 'Squash merge (default)')
  .option('--merge', 'Merge commit')
  .option('--rebase', 'Rebase merge')
  .action(close)

program.parse()
