import { BadRequestException } from '@nestjs/common'
export type PullRequestContext = {
  version: 1
  head: { repositoryId: string; ref: string; sha: string }
  base: { repositoryId: string; ref: string; sha: string }
  state: 'open' | 'closed'
  draft: boolean
  merged: boolean
}
const sha = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{40}$/i.test(s)
const ref = (s: unknown) =>
  typeof s === 'string' &&
  s.length > 0 &&
  s.length <= 255 &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(s) &&
  !s.includes('..') &&
  !s.includes('@{') &&
  !s.includes('//') &&
  !s.startsWith('/') &&
  !s.endsWith('/') &&
  !s.endsWith('.') &&
  s.split('/').every((v) => !v.startsWith('.') && !v.endsWith('.lock')) &&
  s !== '@'
const repoId = (s: unknown) =>
  typeof s === 'string' &&
  /^[1-9]\d{0,15}$/.test(s) &&
  Number.isSafeInteger(Number(s))
/** Validate the persisted allowlist again before it becomes assessment context. */
export function readPullRequestContext(
  value: unknown,
): PullRequestContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as PullRequestContext
  if (
    v.version !== 1 ||
    !['open', 'closed'].includes(v.state) ||
    typeof v.draft !== 'boolean' ||
    typeof v.merged !== 'boolean'
  )
    return null
  for (const branch of [v.head, v.base])
    if (
      !branch ||
      !repoId(branch.repositoryId) ||
      !sha(branch.sha) ||
      !ref(branch.ref)
    )
      return null
  return {
    version: 1,
    head: {
      repositoryId: v.head.repositoryId,
      ref: v.head.ref,
      sha: v.head.sha.toLowerCase(),
    },
    base: {
      repositoryId: v.base.repositoryId,
      ref: v.base.ref,
      sha: v.base.sha.toLowerCase(),
    },
    state: v.state,
    draft: v.draft,
    merged: v.merged,
  }
}
/** Old minimized deliveries cannot supply reliable base context; preserve them without inference. */
export function normalizePullRequestContext(
  source: Record<string, any>,
): PullRequestContext | undefined {
  if (
    source.head?.ref == null &&
    source.base?.ref == null &&
    source.base?.sha == null
  )
    return undefined
  const numeric = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? String(n) : null
  const value = {
    version: 1,
    head: {
      repositoryId: numeric(source.head?.repo?.id),
      ref: source.head?.ref,
      sha: source.head?.sha,
    },
    base: {
      repositoryId: numeric(source.base?.repo?.id),
      ref: source.base?.ref,
      sha: source.base?.sha,
    },
    state: source.state,
    draft: source.draft,
    merged: source.merged,
  }
  const context = readPullRequestContext(value)
  if (!context)
    throw new BadRequestException(
      'Pull request context is invalid or incomplete',
    )
  return context
}
