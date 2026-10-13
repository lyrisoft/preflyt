import { expect, it, vi } from 'vitest'
import { PipelineProcessingService } from '../src/assessments/pipeline-processing.service.js'

vi.mock('../src/auth/authorization.service.js', () => ({ AuthorizationService: class {
  async requireRepository() {}
} }))
vi.mock('../src/standards/policy-standards.js', () => ({ currentStandards: async () => ({ id: 'selection' }) }))
vi.mock('../src/assessments/pipeline-source-registration.js', () => ({ registerPipelineSources: async () => {} }))
vi.mock('../src/assessments/pipeline-job-evidence.js', () => ({ recordJobEvidence: async () => ({ deliveryId: 'delivery' }) }))
vi.mock('../src/assessments/published-policy-evaluation.js', () => ({ evaluatePublishedPolicy: () => ({ status: 'PASS', rules: [] }) }))
vi.mock('../src/assessments/check-publication.service.js', () => ({ CheckPublicationService: class {
  async preview() { return { previewHash: 'preview' } }
  async publish() {}
} }))

function fixture({ leaseHeld = true, dispatchFails = false } = {}) {
  const sourceSha = 'a'.repeat(40)
  const row = { id: 'submission', repositoryId: 'repo', organizationId: 'org', submittedById: 'actor',
    prNumber: 7, sourceSha, policyId: 'policy', policyHash: 'hash', runId: '123', runAttempt: 1,
    attempts: 0, createdAt: new Date(), payload: { verificationScope: 'jobs', submissionJobId: 'job',
      signerWorkflow: 'org/repo/.github/workflows/ci.yml', reports: [] } }
  const config = { enabled: true, revision: 1, organizationId: 'org', pipelineComments: false }
  const repo = { id: 'repo', githubId: 51n, installationId: 50n, fullName: 'org/repo', selected: true, available: true, readinessAutomation: config }
  let state = 'PENDING'
  const updates: any[] = []
  const db: any = {
    pipelineRunSubmission: { findMany: vi.fn().mockResolvedValue([row]), findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn(async (input: any) => {
        updates.push(input)
        if (input.data.state === 'COMPLETE' && !leaseHeld) return { count: 0 }
        if (input.data.state) state = input.data.state
        return { count: 1 }
      }) },
    gitHubRepository: { findUnique: vi.fn().mockResolvedValue(repo), findFirst: vi.fn().mockResolvedValue(repo) },
    readinessAutomation: { findUnique: vi.fn().mockResolvedValue(config) },
    gatePolicyRevision: { findFirst: vi.fn().mockResolvedValue({ id: 'policy', definitionHash: 'hash', branchRef: 'refs/heads/development' }) },
    auditEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: vi.fn(), $transaction: async (callback: any) => callback(db),
  }
  const run = { runAttempt: 1, sourceSha, status: 'in_progress', event: 'pull_request', workflowId: '10',
    workflowPath: '.github/workflows/ci.yml', verifiedJobs: { jobIds: ['job'], conclusion: 'success' } }
  const github: any = {
    readPipelineVerificationRun: vi.fn().mockResolvedValue(run),
    readPullRequest: vi.fn().mockResolvedValue({ context: { state: 'open', draft: false,
      head: { sha: sourceSha, repositoryId: '51' }, base: { ref: 'development' } } }),
    readPipelineJobs: vi.fn().mockResolvedValue([{ sourceSha, status: 'completed', conclusion: 'success',
      steps: [{ status: 'completed', conclusion: 'success' }] }]),
  }
  const onVerified = vi.fn(async () => {
    expect(state).toBe('COMPLETE')
    if (dispatchFails) throw new Error('private provider detail')
  })
  const service = new PipelineProcessingService(db, { requireRepository: vi.fn() } as any, github,
    { createAutomatic: vi.fn().mockResolvedValue({ assessment: { id: 'assessment' } }) } as any, onVerified)
  return { service, onVerified, db, updates, github }
}
it('dispatches the verified submission immediately after its leased completion is persisted', async () => {
  const f = fixture()
  await f.service.reconcile()
  expect(f.onVerified).toHaveBeenCalledExactlyOnceWith('submission')
  expect(f.updates.filter(u => u.data.state === 'COMPLETE')).toHaveLength(1)
})
it('does not dispatch after the completion lease is lost', async () => {
  const f = fixture({ leaseHeld: false })
  await f.service.reconcile()
  expect(f.onVerified).not.toHaveBeenCalled()
})
it('dispatch failure preserves verified completion and leaves safe recovery diagnostics', async () => {
  const f = fixture({ dispatchFails: true })
  await f.service.reconcile()
  expect(f.onVerified).toHaveBeenCalledOnce()
  expect(f.updates.at(-1).data.state).toBe('COMPLETE')
  expect(f.db.auditEvent.createMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: [
    expect.objectContaining({ event: 'ai.review.pipeline_dispatch_unavailable', metadata: { submissionId: 'submission' } }),
  ] }))
  expect(JSON.stringify(f.db.auditEvent.createMany.mock.calls)).not.toContain('private provider detail')
})
it('does not dispatch when the verified run no longer matches the submitted commit', async () => {
  const f = fixture()
  f.github.readPipelineVerificationRun.mockResolvedValue({ runAttempt: 2, sourceSha: 'b'.repeat(40) })
  await f.service.reconcile()
  expect(f.onVerified).not.toHaveBeenCalled()
  expect(f.updates.at(-1).data.state).toBe('STALE')
})
