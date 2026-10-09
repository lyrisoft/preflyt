import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
vi.mock('../src/execution/native-admission.js', () => ({
  nativeAdmission: vi.fn(),
}))
vi.mock('../src/execution/native-controller-client.js', () => ({
  nativeControllerCall: vi.fn(),
}))
import { nativeControllerCall } from '../src/execution/native-controller-client.js'
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import { NativeDispatchService } from '../src/execution/native-dispatch.service.js'
import { digest } from '../src/assessments/assessment-digest.js'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
function fixture(state = 'QUEUED') {
  vi.stubEnv('NATIVE_EXECUTION_ENABLED', 'true')
  const plan = {
    version: 1,
    repositoryId: '51',
    organizationId: 'org',
    sourceSha: 'a'.repeat(40),
    selectionId: 'selection',
  }
  const input = {
    requestKey: randomUUID(),
    expectedSourceSha: plan.sourceSha,
    expectedSelectionId: plan.selectionId,
    expectedPlanHash: digest(plan),
    ruleIds: ['secrets.scan'],
  }
  const row: any = {
    id: randomUUID(),
    repositoryId: 'db-repo',
    repositoryGithubId: '51',
    organizationId: 'org',
    actorId: 'owner',
    requestKey: input.requestKey,
    sourceSha: plan.sourceSha,
    selectionId: plan.selectionId,
    planHash: input.expectedPlanHash,
    plan,
    ruleIds: input.ruleIds,
    state,
    leaseUntil: null,
    controllerJobId: state === 'QUEUED' ? null : randomUUID(),
    sourceHash: state === 'QUEUED' ? null : 'b'.repeat(64),
    runtimeApprovalHash: state === 'QUEUED' ? null : 'c'.repeat(64),
    requestedAt: new Date(),
    inputHash: digest({
      organizationId: 'org',
      repositoryId: '51',
      actorId: 'owner',
      input,
    }),
  }
  const db: any = {
    nativeExecutionRequest: {
      findMany: vi.fn(async () => [structuredClone(row)]),
      findUniqueOrThrow: vi.fn(async () => structuredClone(row)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.leaseUntil?.getTime() !== row.leaseUntil?.getTime() ||
          (where.state && where.state !== row.state)
        )
          return { count: 0 }
        Object.assign(row, { ...data, attempts: 1 })
        return { count: 1 }
      }),
    },
    repositoryStandardsSelection: {
      findFirst: vi.fn(async () => ({ id: 'selection' })),
    },
    gitHubRepository: {
      findUniqueOrThrow: vi.fn(async () => ({ installationId: 7n })),
    },
  }
  const access: any = {
    requireRepository: vi.fn(async () => ({ id: 'db-repo' })),
  }
  const github: any = {
    readNativeSource: vi.fn(async () => ({ sourceHash: 'b'.repeat(64) })),
  }
  const status: any = {
    status: vi.fn(async () => ({ executionAvailable: true })),
  }
  const results: any = { complete: vi.fn() }
  vi.mocked(nativeRuntimeApproval).mockReturnValue({
    approvalHash: 'c'.repeat(64),
    approval: { environmentId: 'test' },
  } as any)
  vi.mocked(nativeControllerCall).mockResolvedValue({
    state: 'COMPLETE',
    signature: 'signed-result',
  })
  const service = new NativeDispatchService(db, access, github, status, results)
  return { service, row, db, access, github, status, results }
}
it('claims once, exports exact commit using contents access, admits and ingests the signed result', async () => {
  const { service, row, github, results } = fixture()
  await service.reconcile()
  expect(github.readNativeSource).toHaveBeenCalledWith(
    7n,
    51n,
    row.sourceSha,
    expect.any(AbortSignal),
  )
  expect(nativeControllerCall).toHaveBeenNthCalledWith(
    1,
    'admit',
    expect.objectContaining({
      attemptId: row.controllerJobId,
      sourceHash: 'b'.repeat(64),
    }),
    expect.anything(),
    expect.any(AbortSignal),
  )
  expect(results.complete).toHaveBeenCalledWith(row.id, 'signed-result')
})
it('blocks revoked membership before source export or admission', async () => {
  const { service, row, access, github } = fixture()
  access.requireRepository.mockRejectedValue(new Error('revoked'))
  await service.reconcile()
  expect(github.readNativeSource).not.toHaveBeenCalled()
  expect(nativeControllerCall).not.toHaveBeenCalled()
  expect(row.state).toBe('BLOCKED')
})
it('resumes a running attempt by polling without exporting or executing again', async () => {
  const { service, row, github, results } = fixture('RUNNING')
  await service.reconcile()
  expect(github.readNativeSource).not.toHaveBeenCalled()
  expect(nativeControllerCall).toHaveBeenCalledOnce()
  expect(nativeControllerCall).toHaveBeenCalledWith(
    'status',
    expect.objectContaining({ attemptId: row.controllerJobId }),
    undefined,
    expect.any(AbortSignal),
  )
  expect(results.complete).toHaveBeenCalledOnce()
})
it('does not dispatch without explicit deployment opt-in', async () => {
  const { service, db } = fixture()
  vi.stubEnv('NATIVE_EXECUTION_ENABLED', 'false')
  await service.reconcile()
  expect(db.nativeExecutionRequest.findMany).not.toHaveBeenCalled()
})
it('keeps cancellation pending rather than claiming unconfirmed cleanup', async () => {
  const { service, row, github, results } = fixture('CANCEL_REQUESTED')
  vi.mocked(nativeControllerCall).mockResolvedValue({ state: 'RUNNING' })
  await service.reconcile()
  expect(github.readNativeSource).not.toHaveBeenCalled()
  expect(results.complete).not.toHaveBeenCalled()
  expect(row.state).toBe('CANCEL_REQUESTED')
  expect(nativeControllerCall).toHaveBeenCalledWith(
    'cancel',
    expect.anything(),
    undefined,
    expect.any(AbortSignal),
  )
})

it('does not change an admitted scope after source export or standards changes', async () => {
  const { service, row, db } = fixture()
  db.repositoryStandardsSelection.findFirst
    .mockResolvedValueOnce({ id: 'selection' })
    .mockResolvedValueOnce({ id: 'changed' })
  await service.reconcile()
  expect(row.state).toBe('BLOCKED')
  expect(nativeControllerCall).not.toHaveBeenCalled()
})
it('reports a thirty-minute timeout without claiming cleanup confirmation', async () => {
  const { service, row, results } = fixture('RUNNING')
  row.requestedAt = new Date(Date.now() - 1800001)
  vi.mocked(nativeControllerCall).mockRejectedValue(new Error('unavailable'))
  await service.reconcile()
  expect(row.state).toBe('TIMED_OUT')
  expect(row.reason).toBe('CLEANUP_UNCONFIRMED')
  expect(results.complete).not.toHaveBeenCalled()
})
