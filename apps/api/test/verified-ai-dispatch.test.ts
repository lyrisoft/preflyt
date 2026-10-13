import { beforeEach, expect, it, vi } from 'vitest'
import { SkillReviewService } from '../src/intelligence/skill-review.service.js'

const mocks = vi.hoisted(() => ({ enabled: true, route: vi.fn(), checks: vi.fn() }))
vi.mock('../src/intelligence/ai-configuration.js', async importOriginal => ({
  ...await importOriginal<any>(), aiReviewsEnabled: () => mocks.enabled,
}))
vi.mock('../src/intelligence/effective-ai-route.js', () => ({ effectiveAiRoute: mocks.route }))
vi.mock('../src/standards/catalogue.js', async importOriginal => ({
  ...await importOriginal<any>(), assessmentAiChecks: mocks.checks,
}))
const verified = { repositoryId: 'repo', number: 7, sourceSha: 'a'.repeat(40),
  policyId: 'policy', policyHash: 'hash', assessmentId: 'assessment' }
const context = { version: 1, state: 'open', draft: false, merged: false,
  head: { repositoryId: '51', ref: 'feature', sha: verified.sourceSha },
  base: { repositoryId: '51', ref: 'development', sha: 'b'.repeat(40) } }
const check = { id: 'review', stages: ['pull_request'] }

function fixture() {
  const pr = { id: 'pr', repositoryId: 'repo', number: 7, revision: 3,
    aiReviewAttemptAt: new Date(), context,
    repository: { githubId: 51n, installationId: 50n, installation: { organizationId: 'org' },
      readinessAutomation: { aiReviews: true, aiReviewsEnabledAt: new Date(0), actorId: 'actor', revision: 2 } } }
  const db = {
    pipelineRunSubmission: { findUnique: vi.fn().mockResolvedValue({ ...verified, prNumber: 7, state: 'COMPLETE' }),
      findFirst: vi.fn().mockResolvedValue({ assessmentId: 'assessment' }) },
    repositoryPullRequest: { findFirst: vi.fn().mockResolvedValue(pr), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    gatePolicyRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'policy', definitionHash: 'hash', definition: { aiChecks: [check] } }) },
    commitAssessment: { findFirst: vi.fn().mockResolvedValue({ id: 'assessment', plan: {}, request: { pullRequest: context } }) },
  }
  const service = new SkillReviewService(db as any, {} as any, {} as any, {} as any, {} as any)
  const eligibility = vi.spyOn(service, 'list').mockResolvedValue({ checks: [{ id: 'review', available: true }] } as any)
  const policy = vi.spyOn(service as any, 'currentPolicy').mockResolvedValue(undefined)
  const request = vi.spyOn(service, 'request').mockResolvedValue({} as any)
  return { db, pr, service, eligibility, policy, request }
}
beforeEach(() => {
  mocks.enabled = true
  mocks.route.mockResolvedValue({ enabled: true, automaticReviews: false, allowSource: true, revision: 1 })
  mocks.checks.mockReturnValue([check])
})
it('immediately admits only the verified PR while retaining eligibility, policy and source-sharing checks', async () => {
  const f = fixture()
  await f.service.dispatchVerifiedPipeline('submission')
  const where = f.db.repositoryPullRequest.findFirst.mock.calls[0][0].where
  expect(where).toMatchObject({ repositoryId: 'repo', number: 7, context: { path: ['head', 'sha'], equals: verified.sourceSha } })
  expect(where).not.toHaveProperty('OR') // only the minute cooldown is bypassed
  expect(where.repository).toMatchObject({ selected: true, available: true, installation: { active: true } })
  expect(f.eligibility).toHaveBeenCalled()
  expect(f.policy).toHaveBeenCalled()
  expect(f.request).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'actor', organizationId: 'org' }),
    '51', 'assessment', ['review'], expect.objectContaining({ includeSource: true,
      automatic: expect.objectContaining({ policyId: 'policy', policyHash: 'hash', number: 7 }) }))
})
it.each(['PENDING', 'PROCESSING', 'FAILED', 'STALE'])('does not admit an unverified %s submission', async state => {
  const f = fixture()
  f.db.pipelineRunSubmission.findUnique.mockResolvedValue({ ...verified, prNumber: 7, state })
  await f.service.dispatchVerifiedPipeline('submission')
  expect(f.db.repositoryPullRequest.findFirst).not.toHaveBeenCalled()
  expect(f.request).not.toHaveBeenCalled()
})
it('does not admit a missing submission or incomplete assessment binding', async () => {
  const f = fixture()
  for (const row of [null, { state: 'COMPLETE', assessmentId: null }]) {
    f.db.pipelineRunSubmission.findUnique.mockResolvedValue(row as any)
    await f.service.dispatchVerifiedPipeline('submission')
  }
  expect(f.request).not.toHaveBeenCalled()
})
it('does not widen a changed policy, newer assessment, disabled configuration or denied source consent', async () => {
  const changed = fixture()
  changed.db.gatePolicyRevision.findFirst.mockResolvedValue({ id: 'new-policy', definitionHash: 'hash', definition: { aiChecks: [check] } })
  await changed.service.dispatchVerifiedPipeline('submission')
  expect(changed.request).not.toHaveBeenCalled()
  const newer = fixture()
  newer.db.pipelineRunSubmission.findFirst.mockResolvedValue({ assessmentId: 'new-assessment' })
  await newer.service.dispatchVerifiedPipeline('submission')
  expect(newer.request).not.toHaveBeenCalled()
  mocks.route.mockResolvedValue({ enabled: true, automaticReviews: false, allowSource: false })
  const denied = fixture()
  await denied.service.dispatchVerifiedPipeline('submission')
  expect(denied.request).not.toHaveBeenCalled()
  mocks.route.mockResolvedValue({ enabled: true, automaticReviews: true, allowSource: true })
  const unconfigured = fixture()
  unconfigured.pr.repository.readinessAutomation.aiReviews = false
  await unconfigured.service.dispatchVerifiedPipeline('submission')
  expect(unconfigured.request).not.toHaveBeenCalled()
  mocks.enabled = false
  const disabled = fixture()
  await disabled.service.dispatchVerifiedPipeline('submission')
  expect(disabled.db.repositoryPullRequest.findFirst).not.toHaveBeenCalled()
})
it('does not duplicate admission after losing the PR claim or when its live source changed', async () => {
  const claimed = fixture()
  claimed.db.repositoryPullRequest.updateMany.mockResolvedValue({ count: 0 })
  await claimed.service.dispatchVerifiedPipeline('submission')
  expect(claimed.request).not.toHaveBeenCalled()
  const moved = fixture()
  moved.pr.context = { ...context, head: { ...context.head, sha: 'c'.repeat(40) } }
  await moved.service.dispatchVerifiedPipeline('submission')
  expect(moved.request).not.toHaveBeenCalled()
})
it('retains the one-minute recovery cooldown for ordinary automatic admission', async () => {
  const f = fixture()
  f.db.repositoryPullRequest.findFirst.mockResolvedValue(null as any)
  await f.service.dispatchAutomatic()
  expect(f.db.repositoryPullRequest.findFirst.mock.calls[0][0].where.OR).toHaveLength(2)
})
