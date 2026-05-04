import { execa } from 'execa'
import type { AgentConfig, WtMeta } from './types.js'

const DEFAULTS: Required<AgentConfig> = {
  rebaseThreshold: 0,
  slugModel: 'claude-sonnet-4-6',
  planModel: 'claude-opus-4-7',
  prModel: 'claude-sonnet-4-6',
  reviewModel: 'claude-opus-4-7',
}

export function resolveAgentConfig(meta: WtMeta): Required<AgentConfig> {
  return { ...DEFAULTS, ...(meta.agent ?? {}) }
}

export type PermissionMode = 'plan' | 'acceptEdits' | 'bypassPermissions' | 'default'

export interface ClaudeHeadlessOpts {
  model: string
  cwd: string
  permissionMode?: PermissionMode
  addDirs?: string[]
  allowedTools?: string[]
  appendSystemPrompt?: string
}

export async function claudeHeadless(prompt: string, opts: ClaudeHeadlessOpts): Promise<string> {
  // Note: --allowedTools and --add-dir are variadic. We always pass the prompt via
  // stdin to avoid positional-arg ambiguity with variadic options.
  const args = ['-p', '--model', opts.model]
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode)
  for (const d of opts.addDirs ?? []) args.push('--add-dir', d)
  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push('--allowedTools', opts.allowedTools.join(','))
  }
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt)

  try {
    const { stdout } = await execa('claude', args, { cwd: opts.cwd, input: prompt })
    return stdout.trim()
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stderr?: string
      stdout?: string
      exitCode?: number
      shortMessage?: string
    }
    if (e.code === 'ENOENT') {
      throw new Error('`claude` binary not found on PATH. Install Claude Code first.')
    }
    const parts = [
      `claude headless failed (exit ${e.exitCode ?? '?'})`,
      e.shortMessage ? `cmd: ${e.shortMessage}` : null,
      e.stderr?.trim() ? `stderr:\n${e.stderr.trim()}` : null,
      e.stdout?.trim() ? `stdout:\n${e.stdout.trim()}` : null,
    ].filter(Boolean)
    throw new Error(parts.join('\n\n'))
  }
}

export async function claudeInteractive(initialPrompt: string, opts: { cwd: string; model?: string }): Promise<void> {
  const args: string[] = []
  if (opts.model) args.push('--model', opts.model)
  args.push(initialPrompt)
  try {
    await execa('claude', args, { cwd: opts.cwd, stdio: 'inherit' })
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      throw new Error('`claude` binary not found on PATH. Install Claude Code first.')
    }
    throw err
  }
}
