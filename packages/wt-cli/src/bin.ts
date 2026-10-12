import { Command } from 'commander'
import * as p from '@clack/prompts'
import { setup } from './commands/setup.js'
import { add } from './commands/add.js'
import { rm } from './commands/rm.js'
import { ls } from './commands/ls.js'
import { cd } from './commands/cd.js'
import { root } from './commands/root.js'
import { copy } from './commands/copy.js'
import { rename } from './commands/rename.js'
import { agent } from './commands/agent.js'
import { go } from './commands/go.js'
import { rebase } from './commands/rebase.js'
import { release } from './commands/release.js'
import { review } from './commands/review.js'
import { followup } from './commands/followup.js'
import { close } from './commands/close.js'
import { scan } from './commands/scan.js'
import { prune } from './commands/prune.js'

// Wrap a command action so thrown errors surface as a clean message instead of
// an unhandled promise rejection (which hides the real cause behind a stack
// trace and a still-spinning spinner).
function run<A extends unknown[]>(fn: (...args: A) => unknown | Promise<unknown>) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      p.log.error(msg)
      process.exit(1)
    }
  }
}

const program = new Command()
  .name('wt-cli')
  .description('Git worktree manager')
  .version('1.0.0')

program
  .command('setup')
  .description('Create project folder on WT_ROOT')
  .option('--base <branch>', 'Base branch to compare worktrees against', 'develop')
  .action(run(setup))

program
  .command('add')
  .description('Create a new worktree with the given branch name')
  .argument('[name]', 'Branch name (prompts if omitted)')
  .action(run(add))

program
  .command('rm')
  .description('Remove a worktree locally (no merge); with a name, removes without confirmation')
  .argument('[name]', 'Worktree name — skips the confirmation prompt (defaults to the current worktree)')
  .action(run(rm))

program
  .command('ls')
  .description('List worktrees with metadata')
  .action(run(ls))

program
  .command('cd')
  .description('Navigate to a worktree (use with shell wrapper)')
  .argument('[name]', 'Worktree name')
  .action(run(cd))

program
  .command('root')
  .description('Go back to the main repo (use with shell wrapper)')
  .action(run(root))

program
  .command('copy')
  .description('Copy configured files (env vars, etc.) from the main repo into worktrees')
  .argument('[name]', 'Worktree name (defaults to all worktrees)')
  .option('--add <pattern...>', 'Add copy pattern(s) to .wt.json instead of copying')
  .option('--list', 'Show configured patterns and matching files')
  .action(run(copy))

program
  .command('scan')
  .description('Reconcile git worktrees with .wt.json (adopt orphans, drop stale entries, move external worktrees)')
  .action(run(scan))

program
  .command('rename')
  .description('Rename a worktree branch and directory')
  .argument('[name]', 'Worktree name')
  .action(run(rename))

program
  .command('prune')
  .description('Interactively prune worktrees and/or local branches')
  .option('--no-worktrees', 'Skip worktree pruning')
  .option('--no-branches', 'Skip branch pruning')
  .action(run(prune))

program
  .command('agent')
  .description('Create worktree from a prompt and generate a plan via Claude')
  .argument('[prompt]', 'Prompt text (opens $EDITOR if omitted)')
  .action(run(agent))

program
  .command('go')
  .description('Launch interactive Claude in this worktree using the local PLAN.md/AUDIT.md')
  .action(run(go))

program
  .command('rebase')
  .description('Rebase the current worktree onto the latest base branch')
  .action(run(rebase))

program
  .command('release')
  .description('Commit, push, rebase if behind, and create the PR')
  .action(run(release))

program
  .command('review')
  .description('Generate a Claude self-review and post it on the PR')
  .action(run(review))

program
  .command('followup')
  .description('Launch interactive Claude with PR reviews + comments to address them')
  .action(run(followup))

program
  .command('close')
  .description('Merge the PR, remove the worktree, and cd back to main repo')
  .option('--squash', 'Squash merge (default)')
  .option('--merge', 'Merge commit')
  .option('--rebase', 'Rebase merge')
  .action(run(close))

program.parse()
