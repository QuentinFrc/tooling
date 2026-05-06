import { claudeHeadless } from './claude.js'

export type SlugKind = 'feature' | 'fix' | 'audit'

export interface SlugResult {
  kind: SlugKind
  slug: string
  branch: string
  dir: string
}

export async function generateSlug(prompt: string, model: string, cwd: string): Promise<SlugResult> {
  const raw = await claudeHeadless(instruction(prompt), { model, cwd })
  const parsed = parseRaw(raw)
  if (!parsed) {
    throw new Error(`Could not parse slug response from Claude:\n${raw}`)
  }
  const prefix = parsed.kind === 'audit' ? 'audit' : parsed.kind === 'fix' ? 'fix' : 'feat'
  const branch = `${prefix}/${parsed.slug}`
  const dir = branch.replaceAll('/', '-')
  return { ...parsed, branch, dir }
}

function instruction(userPrompt: string): string {
  return `From the user prompt below, output a single JSON object with two fields:
- "kind": one of "feature", "fix", "audit"
- "slug": kebab-case branch suffix (max 5 words, [a-z0-9-] only)

Output ONLY the JSON object, no prose, no markdown fences.

PROMPT:
${userPrompt}`
}

function parseRaw(raw: string): { kind: SlugKind; slug: string } | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/m, '')
    .replace(/```$/m, '')
    .trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0]) as { kind?: unknown; slug?: unknown }
    const { kind, slug } = obj
    if (kind !== 'feature' && kind !== 'fix' && kind !== 'audit') return null
    if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) return null
    return { kind, slug }
  } catch {
    return null
  }
}
