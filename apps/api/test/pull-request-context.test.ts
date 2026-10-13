import { expect, it } from 'vitest'
import { normalizeGitHubEvent } from '../src/github-events/github-event.js'
import { readPullRequestContext } from '../src/github-events/pull-request-context.js'
const payload = () => ({
  action: 'opened',
  installation: { id: 500 },
  repository: { id: 501 },
  pull_request: {
    id: 99,
    number: 1,
    state: 'open',
    draft: false,
    merged: false,
    head: { repo: { id: 501 }, ref: 'feature/test', sha: 'A'.repeat(40) },
    base: { repo: { id: 501 }, ref: 'development', sha: 'b'.repeat(40) },
    body: 'secret',
    title: 'secret',
  },
})
it('pins only signed head/base identifiers and revisions without raw PR content', () => {
  const normalized = normalizeGitHubEvent('pull_request', payload())!
  expect(normalized.pullRequestContext).toEqual({
    version: 1,
    state: 'open',
    draft: false,
    merged: false,
    head: { repositoryId: '501', ref: 'feature/test', sha: 'a'.repeat(40) },
    base: { repositoryId: '501', ref: 'development', sha: 'b'.repeat(40) },
  })
  expect(
    JSON.stringify(normalized, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ).not.toContain('secret')
})
it.each([
  'bad..ref',
  'bad ref',
  'bad\nref',
  '/bad',
  'bad.lock',
  'bad@{ref',
  'bad\\ref',
])('rejects invalid branch %s', (branch) => {
  const p = payload()
  p.pull_request.head.ref = branch
  expect(() => normalizeGitHubEvent('pull_request', p)).toThrow()
})
it('rejects incomplete context and inconsistent base repositories', () => {
  const p = payload()
  p.pull_request.base.sha = 'no-sha'
  expect(() => normalizeGitHubEvent('pull_request', p)).toThrow()
  const other = payload()
  other.pull_request.base.repo.id = 502
  expect(() => normalizeGitHubEvent('pull_request', other)).toThrow()
  expect(readPullRequestContext({ version: 1 })).toBeNull()
})
it('keeps legacy minimized payloads without inferred base context', () => {
  const p = payload() as any
  delete p.pull_request.base.sha
  delete p.pull_request.head.ref
  delete p.pull_request.base.ref
  expect(
    normalizeGitHubEvent('pull_request', p)!.pullRequestContext,
  ).toBeUndefined()
})
