import { afterEach, expect, it, vi } from 'vitest'
import {
  draftRequest,
  DraftRequestError,
  reviewedSaveBody,
  type DraftOptions,
  type RulesetDraft,
} from './ruleset-draft-api'

const options: DraftOptions = {
  name: 'Development protection',
  profile: 'STANDARD',
  branches: ['development'],
  approvals: 1,
  requirePullRequest: true,
  resolveConversations: false,
  preventForcePush: true,
  preventDeletion: true,
  expectedSelectionId: 'selection-2',
}
afterEach(() => vi.unstubAllGlobals())
it('sends reviewed inputs and the original draft hash, without server-owned fields', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ id: 'saved' }), { status: 201 })
  )
  vi.stubGlobal('fetch', fetch)
  const draft = {
    id: 'draft-1',
    definitionHash: 'a'.repeat(64),
    revision: 3,
    organizationId: 'private',
  } as unknown as RulesetDraft
  const body = reviewedSaveBody(options, draft)
  await draftRequest('51', '/draft-1/edit', body)
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toContain('/51/ruleset-drafts/draft-1/edit')
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  })
  expect(JSON.parse(init.body as string)).toEqual({
    ...options,
    expectedHash: draft.definitionHash,
  })
  options.branches.push('release')
  expect(body.branches).toEqual(['development'])
  options.branches.pop()
})
it('preserves conflict status for explicit reload and never redirects on permission failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: 'Standards changed. Reload the preview before saving.',
          }),
          { status: 409 }
        )
    )
  )
  await expect(draftRequest('51', '/preview', options)).rejects.toMatchObject({
    status: 409,
    message: 'Standards changed. Reload the preview before saving.',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 403 }))
  )
  await expect(draftRequest('51')).rejects.toBeInstanceOf(DraftRequestError)
  await expect(draftRequest('51')).rejects.toMatchObject({
    status: 403,
    message: 'You no longer have permission for this repository.',
  })
})
it('keeps cancelled list requests abortable and does not send a body on reads', async () => {
  const fetch = vi.fn(async () => new Response('{"drafts": []}'))
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  await draftRequest('51', '?page=2', undefined, controller.signal)
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(init.signal).toBe(controller.signal)
  expect(init.body).toBeUndefined()
  expect(init.method).toBeUndefined()
})
