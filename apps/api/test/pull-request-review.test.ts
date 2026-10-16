import { expect, it, vi } from 'vitest'
import { PullRequestService } from '../src/assessments/pull-request.service.js'
import { digest } from '../src/assessments/assessment-digest.js'

function fixture(complete = true) {
  const sourceSha = 'a'.repeat(40)
  const repo = { id: 'repo', githubId: 501n, installationId: 500n, installation: { accessRevision: 2 } }
  const row = { id: 'pr', number: 1, objectId: 'object', revision: 1, syncState: 'SYNCED', verifiedAt: new Date(), verifiedInstallationId: '500', verifiedAccessRevision: 2, context: { version: 1, state: 'open', merged: false, draft: false, head: { repositoryId: '501', ref: 'feature', sha: sourceSha }, base: { repositoryId: '501', ref: 'main', sha: 'b'.repeat(40) } } }
  const request = { trigger: 'GITHUB_CI', subjectKind: 'COMMIT', installationId: '500', sourceSha, profileSnapshot: { sourceSha, complete: true } }
  const plan = { version: 1, sourceSha, mode: 'INGEST_ONLY', stage: 'ci', enforcement: 'observe', checks: [{ id: 'ci.configured', required: true, operator: 'configuration_hint_present', capability: 'available' }] }
  const report = { version: 1, sourceSha, collectionTruncated: false, validationCollectionTruncated: false, checks: [{ ruleId: 'ci.configured', required: true, coverage: complete ? 'CONFIGURATION_OBSERVED' : 'MISSING', configurationEvidence: [{ path: '.github/workflows/ci.yml', blobSha: 'c'.repeat(40) }] }] }
  const snapshot = { id: 'saved', sourceSha, request, plan, report, assessmentHash: digest({ request, plan, report }) }
  const db = { gitHubRepository: { findFirst: vi.fn().mockResolvedValue(repo) }, repositoryPullRequest: { findUnique: vi.fn().mockResolvedValue(row) }, gatePolicyRevision: { findFirst: vi.fn().mockResolvedValue(null) }, repositoryStandardsSelection: { findFirst: vi.fn().mockResolvedValue({ id: 'selection' }) }, repositoryCiBindings: { findFirst: vi.fn().mockResolvedValue(null) }, commitAssessment: { findMany: vi.fn().mockResolvedValue([snapshot]) } }
  return { db, row, snapshot, service: new PullRequestService(db as never) }
}
it.each([[true, 'PASS'], [false, 'INCOMPLETE']] as const)('evaluates matching saved evidence (%s)', async (complete, status) => {
  const { service } = fixture(complete)
  expect(await service.get('501', '1')).toMatchObject({ readiness: status, reason: `SAVED_ASSESSMENT_${status}`, mergeReview: { assessmentId: 'saved', status } })
})
it('hides an otherwise passing result after PR context changes', async () => {
  const { db, row, service } = fixture()
  db.repositoryPullRequest.findUnique.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, revision: 2 })
  expect(await service.get('501', '1')).toMatchObject({ readiness: 'NOT_EVALUATED', mergeReview: null, reason: 'CONTEXT_CHANGED' })
})
it('rejects tampered evidence and does not evaluate stale PR context', async () => {
  const { snapshot, service } = fixture()
  snapshot.assessmentHash = 'invalid'
  await expect(service.get('501', '1')).rejects.toThrow('integrity')
  const stale = fixture()
  stale.row.verifiedAt = new Date(Date.now() - 600000)
  expect(await stale.service.get('501', '1')).toMatchObject({ readiness: 'NOT_EVALUATED', mergeReview: null, reason: 'CURRENT_STATE_UNVERIFIED' })
  expect(stale.db.commitAssessment.findMany).not.toHaveBeenCalled()
})
