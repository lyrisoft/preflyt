import { BadRequestException } from '@nestjs/common'

export type GitHubEvent = {
  event: string
  action: string
  installationId: bigint
  repositoryGithubId: bigint
  sourceSha: string
  sourceObjectId: string
  sourceNumber: number | null
  sourceStatus: string | null
  sourceConclusion: string | null
  sourceUpdatedAt: Date | null
}

const actions: Record<string, Set<string>> = {
  pull_request: new Set(['opened', 'reopened', 'synchronize', 'edited', 'closed', 'ready_for_review']),
  check_run: new Set(['created', 'completed', 'rerequested']),
  workflow_run: new Set(['requested', 'in_progress', 'completed']),
}
const conclusions = new Set(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'])
const id = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new BadRequestException('GitHub event identifier is invalid')
  return BigInt(value)
}

// Explicit allowlist: persist no title, PR body, logs, sender data, tokens or URLs.
export function normalizeGitHubEvent(event: string, body: unknown): GitHubEvent | null {
  const supported = actions[event]
  if (!(supported instanceof Set)) return null
  const payload = body as Record<string, any>
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new BadRequestException('GitHub event is invalid')
  if (!actions[event].has(payload.action)) return null
  const source = payload[event]
  if (!source || typeof source !== 'object') throw new BadRequestException('GitHub event source is missing')
  const sha = event === 'pull_request' ? source.head?.sha : source.head_sha
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha))
    throw new BadRequestException('GitHub event revision is invalid')
  // Fork PR evidence is associated with the installed base repository, at its head SHA.
  if (event === 'pull_request' && source.base?.repo?.id !== payload.repository?.id)
    throw new BadRequestException('Pull request base repository is inconsistent')
  const number = event === 'pull_request' ? Number(id(source.number)) : null
  if (number !== null && number > 2_147_483_647) throw new BadRequestException('Pull request number is invalid')
  const updated = source.updated_at ?? source.completed_at ?? source.started_at
  const date = typeof updated === 'string' ? new Date(updated) : null
  if (updated != null && (!date || Number.isNaN(date.getTime())))
    throw new BadRequestException('GitHub event timestamp is invalid')
  return {
    event, action: payload.action,
    installationId: id(payload.installation?.id),
    repositoryGithubId: id(payload.repository?.id),
    sourceSha: sha.toLowerCase(), sourceObjectId: id(source.id).toString(),
    sourceNumber: number,
    sourceStatus: event === 'pull_request'
      ? (source.state === 'open' || source.state === 'closed' ? source.state : 'unknown')
      : (['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending'].includes(source.status) ? source.status : 'unknown'),
    sourceConclusion: source.conclusion == null ? null : conclusions.has(source.conclusion) ? source.conclusion : 'unknown',
    sourceUpdatedAt: date,
  }
}
