import { API_BASE_URL } from '@/lib/api'

export type DraftOptions = {
  name: string
  profile: 'STANDARD' | 'STRICT' | 'CUSTOM'
  branches: string[]
  approvals: number
  requirePullRequest: boolean
  resolveConversations: boolean
  preventForcePush: boolean
  preventDeletion: boolean
  expectedSelectionId: string | null
}
export type StandardsSelection = {
  id: string
  revision: number
  packs: { id: string; version: string }[]
}
export type RulesetPreview = {
  definition: {
    name: string
    enforcement: 'disabled'
    conditions: {
      ref_name: { include: string[]; exclude: string[] }
      repository_id: { repository_ids: number[] }
    }
    rules: { type: string; parameters?: Record<string, unknown> }[]
    bypass_actors: unknown[]
  }
  definitionHash: string
  selection: StandardsSelection | null
  activationAvailable: false
  checkSourceVerified: false
}
export type RulesetDraft = {
  id: string
  name: string
  profile: DraftOptions['profile']
  options: DraftOptions
  definition: RulesetPreview['definition']
  definitionHash: string
  selectionId: string | null
  packs: StandardsSelection['packs']
  revision: number
  updatedAt: string
}
export type DraftPage = {
  drafts: RulesetDraft[]
  selection: StandardsSelection | null
  hasMore: boolean
  page: number
  activationAvailable: false
}
export class DraftRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}
export async function draftRequest<T>(
  repositoryId: string,
  suffix = '',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ruleset-drafts${suffix}`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(20_000),
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }
  )
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    throw new DraftRequestError(
      response.status === 403
        ? 'You no longer have permission for this repository.'
        : typeof data?.message === 'string'
          ? data.message
          : 'Could not load or save this draft. Check the inputs and try again.',
      response.status
    )
  }
  return response.json() as Promise<T>
}
/** Save the reviewed inputs; the existing draft hash guards against concurrent edits. */
export function reviewedSaveBody(options: DraftOptions, draft?: RulesetDraft) {
  return {
    ...options,
    branches: [...options.branches],
    ...(draft ? { expectedHash: draft.definitionHash } : {}),
  }
}
