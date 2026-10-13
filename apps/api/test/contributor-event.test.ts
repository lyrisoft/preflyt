import { expect, it } from 'vitest'
import { normalizeContributorEvent } from '../src/github-events/contributor-event.js'
const sha = 'a'.repeat(40)
const pr = {
  id: 8,
  number: 2,
  user: { id: 42, login: 'someone', type: 'User' },
  head: { sha },
  base: { repo: { id: 2 } },
  state: 'open',
  merged: false,
  updated_at: '2026-10-09T00:00:00Z',
}
const body = {
  installation: { id: 1 },
  repository: { id: 2 },
  action: 'opened',
  pull_request: pr,
}
it('records stable identities and revision-bound roles without names, email or bodies', () => {
  const event = normalizeContributorEvent('pull_request', {
    ...body,
    review_body: 'secret',
    pull_request: {
      ...pr,
      user: { ...pr.user, email: 'private@example.test' },
    },
  })!
  expect(event.activities[0]).toMatchObject({
    relationship: 'PR_AUTHOR',
    sourceSha: sha,
    actor: { githubUserId: '42', login: 'someone', kind: 'HUMAN' },
  })
  expect(JSON.stringify(event.activities)).not.toContain('private')
})
it('keeps reviews pinned to the reviewed revision, not the latest PR head', () => {
  const event = normalizeContributorEvent('pull_request_review', {
    ...body,
    action: 'submitted',
    review: {
      id: 9,
      user: { id: 43, login: 'reviewer', type: 'User' },
      commit_id: 'b'.repeat(40),
      state: 'APPROVED',
      submitted_at: pr.updated_at,
    },
  })!
  expect(event.activities[0]).toMatchObject({
    relationship: 'REVIEWER',
    sourceSha: 'b'.repeat(40),
    sourceObjectId: '9',
    pullRequestNumber: 2,
  })
})
it('never matches Git commit names or usernames to GitHub identities', () => {
  expect(
    normalizeContributorEvent('push', {
      installation: { id: 1 },
      repository: { id: 2 },
      commits: [
        {
          id: sha,
          author: { name: 'Someone', username: 'someone', email: 'private' },
          committer: { name: 'Other' },
          timestamp: pr.updated_at,
        },
      ],
    })!.activities,
  ).toEqual([])
})
it('rejects incorrect base repository and invalid stable provider identity', () => {
  expect(() =>
    normalizeContributorEvent('pull_request', {
      ...body,
      pull_request: { ...pr, base: { repo: { id: 3 } } },
    }),
  ).toThrow()
  expect(() =>
    normalizeContributorEvent('pull_request', {
      ...body,
      pull_request: { ...pr, user: { id: '42', login: 'someone' } },
    }),
  ).toThrow()
})
it('labels bot identity without equating it to a person', () => {
  expect(
    normalizeContributorEvent('pull_request', {
      ...body,
      pull_request: { ...pr, user: { id: 99, login: 'bot[bot]', type: 'Bot' } },
    })!.activities[0].actor.kind,
  ).toBe('BOT')
})
