import 'reflect-metadata'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
vi.mock('../src/execution/native-controller-client.js', () => ({
  nativeControllerCall: vi.fn(),
}))
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { NativePlanService } from '../src/execution/native-plan.service.js'
import { NativeRequestService } from '../src/execution/native-request.service.js'
import { NativeResultService } from '../src/execution/native-result.service.js'
import { NativeDispatchService } from '../src/execution/native-dispatch.service.js'
import { nativeControllerCall } from '../src/execution/native-controller-client.js'
import { deliverNotification } from '../src/notifications/notification-delivery.js'
import { NotificationsService } from '../src/notifications/notifications.service.js'
import {
  assessmentNotification,
  nativeExecutionFailureId,
} from '../src/notifications/notification-event.js'
import {
  nativeAdapters,
  nativeToolReviews,
} from '../src/execution/native-plan.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
import {
  nativeReceiptSummary,
  signNativeReceipt,
  type NativeReceipt,
} from '../src/execution/native-receipt.js'
import {
  freezeNativeEvidence,
  nativeEvidenceExpected,
  readLatestNativeEvidence,
} from '../src/execution/native-evidence.js'
import { catalogue } from '../src/standards/catalogue.js'
import { digest } from '../src/assessments/assessment-digest.js'
import { evaluatePublishedPolicy } from '../src/assessments/published-policy-evaluation.js'
import type { AuthenticatedSession } from '../src/auth/session.guard.js'
let db: PrismaService,
  admin: Client,
  created = false,
  repoId: string,
  actor: AuthenticatedSession,
  service: NativeResultService,
  requests: NativeRequestService,
  plans: NativePlanService
const name = 'preflyt_native_receipt_test_' + randomUUID().replaceAll('-', '')
const pair = generateKeyPairSync('ed25519')
const pub = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const seal = (value: NativeReceipt) => signNativeReceipt(value, key, pub)
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Local disposable database required')
  admin = new Client({ connectionString: url.toString() })
  await admin.connect()
  await admin.query(`CREATE DATABASE "${name}"`)
  created = true
  url.pathname = '/' + name
  const sql = new Client({ connectionString: url.toString() })
  await sql.connect()
  try {
    for (const entry of (await readdir('prisma/migrations'))
      .filter((n) => /^\d/.test(n))
      .sort())
      await sql.query(
        await readFile(`prisma/migrations/${entry}/migration.sql`, 'utf8'),
      )
  } finally {
    await sql.end()
  }
  vi.stubEnv('DATABASE_URL', url.toString())
  db = new PrismaService()
  await db.$connect()
  const access = new AuthorizationService(db)
  const assessments = new AssessmentService(db)
  plans = new NativePlanService(access, db)
  requests = new NativeRequestService(db, access, plans, {
    status: async () => ({
      preflightVerified: false,
      reason: 'PREFLIGHT_DISABLED',
    }),
  } as any)
  service = new NativeResultService(db, access, assessments)
}, 30000)
afterAll(async () => {
  await db?.$disconnect()
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin?.end()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  // This client is created only after the dedicated UUID database exists. Never use the original URL for mutation.
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'false')
  await db.notificationEvent.deleteMany()
  await db.gitHubRepository.deleteMany()
  await db.gitHubInstallation.deleteMany()
  await db.organization.deleteMany()
  await db.identity.deleteMany()
  await db.auditEvent.deleteMany()
  const identity = await db.identity.create({
    data: { issuer: 'fixture', subject: randomUUID() },
  })
  const org = await db.organization.create({
    data: { name: 'native receipt fixture' },
  })
  await db.organizationMembership.create({
    data: { identityId: identity.id, organizationId: org.id, role: 'OWNER' },
  })
  actor = {
    authenticated: true,
    identityId: identity.id,
    subject: identity.subject,
    email: null,
    role: 'OWNER',
    organizationId: org.id,
  }
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: identity.id,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      organizationId: org.id,
    },
  })
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: 51n,
      installationId: 50n,
      name: 'repo',
      fullName: 'fixture/repo',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: true,
    },
  })
  repoId = repo.id
  await db.repositoryProfile.create({
    data: {
      repositoryId: repo.id,
      sourceSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      branch: 'main',
      fullName: repo.fullName,
      version: 1,
      complete: true,
      report: {
        signals: [
          {
            id: 'ci',
            state: 'detected',
            evidence: [
              { path: '.github/workflows/tests.yml', blobSha: 'b'.repeat(40) },
            ],
          },
          {
            id: 'lockfiles',
            state: 'detected',
            evidence: [{ path: 'package-lock.json', blobSha: 'c'.repeat(40) }],
          },
        ],
      },
    },
  })
  const pack = catalogue.find((p) => p.id === 'baseline-engineering')!
  await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repo.id,
      revision: 1,
      profile: 'DEFAULT',
      packs: [{ id: pack.id, version: pack.version, digest: pack.digest }],
      selectedById: identity.id,
    },
  })
  vi.stubEnv(
    'NATIVE_TOOL_REVIEWS',
    JSON.stringify(
      ['tests.required', 'secrets.scan'].map((ruleId) => ({
        ruleId,
        image: 'registry.example/fixture@sha256:' + 'a'.repeat(64),
        toolVersion: '1.0.0',
        license: nativeAdapters[ruleId as keyof typeof nativeAdapters].license,
        configHash: 'b'.repeat(64),
        reviewDigest: 'c'.repeat(64),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        databaseBuiltAt: null,
      })),
    ),
  )
  vi.mocked(nativeRuntimeApproval).mockReturnValue({
    backend: 'docker',
    approvalHash: 'd'.repeat(64),
    approval: {
      controllerPublicKey: pub,
      organizationIds: [org.id],
      environmentId: 'fixture',
      controlsHash: 'e'.repeat(64),
      toolReviewHash: nativeToolReviews()!.reviewHash,
      approvedAt: new Date(Date.now() - 60000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  } as any)
})
async function admitted(state: 'PASS' | 'FAIL' | 'INCOMPLETE' = 'PASS') {
  const plan = await plans.get(actor, '51')
  const queued = await requests.request(actor, '51', {
    requestKey: randomUUID(),
    expectedSourceSha: plan.sourceSha,
    expectedSelectionId: plan.selectionId,
    expectedPlanHash: plan.planHash,
    ruleIds: ['tests.required', 'secrets.scan'],
  })
  const record = await db.nativeExecutionRequest.update({
    where: { id: queued.id },
    data: {
      state: 'RUNNING',
      finishedAt: null,
      runtimeApprovalHash: 'd'.repeat(64),
      environmentId: 'fixture',
      sourceHash: 'f'.repeat(64),
      controllerJobId: randomUUID(),
      leaseUntil: new Date(Date.now() + 60000),
      attempts: 1,
    },
  })
  const expected = nativeEvidenceExpected(record)!
  const tools = nativeToolReviews()!
  const value: NativeReceipt = {
    version: 1,
    requestId: record.id,
    attemptId: record.controllerJobId!,
    organizationId: record.organizationId,
    repositoryId: '51',
    sourceSha: record.sourceSha,
    sourceHash: record.sourceHash!,
    selectionId: record.selectionId,
    planHash: record.planHash,
    approvalHash: expected.approvalHash,
    environmentId: 'fixture',
    controlsHash: 'e'.repeat(64),
    toolReviewHash: tools.reviewHash,
    cancelled: false,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    finishedAt: new Date().toISOString(),
    checks: tools.reviews.map((tool) => {
      const isTest = tool.ruleId === 'tests.required'
      const output = nativeCheckOutcome(
        tool.ruleId,
        state === 'FAIL' ? 1 : state === 'INCOMPLETE' ? 2 : 0,
        isTest
          ? Buffer.from(
              '<testsuite><testcase name="test">' +
                (state === 'FAIL' ? '<failure/>' : '') +
                '</testcase></testsuite>',
            )
          : Buffer.from(
              JSON.stringify({
                version: '2.1.0',
                runs: [
                  {
                    tool: { driver: { name: 'fixture' } },
                    results:
                      state === 'FAIL'
                        ? [{ message: { text: 'fixture finding' } }]
                        : [],
                  },
                ],
              }),
            ),
      )
      return {
        ...output,
        summary: nativeReceiptSummary(output.summary),
        adapterId: nativeAdapters[tool.ruleId].id,
        image: tool.image,
        toolVersion: tool.toolVersion,
        configHash: tool.configHash,
        commandHash: digest(nativeAdapters[tool.ruleId]),
        exitCode: state === 'FAIL' ? 1 : state === 'INCOMPLETE' ? 2 : 0,
        cleanupConfirmed: true,
        coverage: 'FULL_RULE',
      }
    }),
  }
  return { record, value, signature: seal(value) }
}
async function gate() {
  const assessment = await db.commitAssessment.findFirstOrThrow({
    where: { repositoryId: repoId },
    orderBy: { createdAt: 'desc' },
  })
  const plan = assessment.plan as any
  const definition = {
    branchRef: 'refs/heads/main',
    selectionId: assessment.selectionId,
    rules: plan.checks,
  }
  const live = await readLatestNativeEvidence(db, {
    repositoryId: repoId,
    organizationId: actor.organizationId!,
    sourceSha: assessment.sourceSha,
    selectionId: assessment.selectionId,
  })
  return evaluatePublishedPolicy(
    assessment,
    {
      id: 'fixture-policy',
      state: 'PUBLISHED',
      selectionId: assessment.selectionId,
      definition,
      definitionHash: digest(definition),
    },
    definition.branchRef,
    {},
    new Date(),
    live,
  )
}
it.each(['PASS', 'FAIL', 'INCOMPLETE'] as const)(
  'saves %s results and evaluates a complete immutable policy snapshot',
  async (state) => {
    const f = await admitted(state)
    const result = await service.complete(f.record.id, f.signature)
    expect(result.state).toBe(
      state === 'PASS' ? 'SUCCEEDED' : state === 'FAIL' ? 'FAILED' : 'BLOCKED',
    )
    const saved = await db.nativeExecutionRequest.findUniqueOrThrow({
      where: { id: f.record.id },
    })
    expect(saved.receiptHash).toBe(digest(f.signature))
    expect(saved.leaseUntil).toBeNull()
    expect((await gate()).status).toBe(
      state === 'PASS' ? 'PASS' : state === 'FAIL' ? 'BLOCK' : 'INCOMPLETE',
    )
    expect(await db.gitHubCheckPublication.count()).toBe(0)
  },
)
it('deduplicates completion and repairs the same assessment without reexecution', async () => {
  const f = await admitted()
  await service.complete(f.record.id, f.signature)
  expect((await service.complete(f.record.id, f.signature)).duplicate).toBe(
    true,
  )
  expect(await db.commitAssessment.count()).toBe(1)
  expect(
    await db.auditEvent.count({
      where: { event: 'native.execution.completed' },
    }),
  ).toBe(1)
  f.value.finishedAt = new Date(Date.now() + 1).toISOString()
  await expect(service.complete(f.record.id, seal(f.value))).rejects.toThrow(
    'different result',
  )
})
it.each([
  'lease',
  'membership',
  'selection',
  'attempt',
  'tamper',
  'request-integrity',
])('rejects changed %s without saving passing evidence', async (kind) => {
  const f = await admitted()
  if (kind === 'lease')
    await db.nativeExecutionRequest.update({
      where: { id: f.record.id },
      data: { leaseUntil: new Date(0) },
    })
  if (kind === 'membership')
    await db.organizationMembership.updateMany({
      where: { identityId: actor.identityId },
      data: { active: false },
    })
  if (kind === 'selection')
    await db.repositoryStandardsSelection.create({
      data: {
        repositoryId: repoId,
        revision: 2,
        profile: 'DEFAULT',
        packs: [],
        selectedById: actor.identityId,
      },
    })
  if (kind === 'attempt')
    await db.nativeExecutionRequest.update({
      where: { id: f.record.id },
      data: { controllerJobId: randomUUID() },
    })
  if (kind === 'request-integrity')
    await db.nativeExecutionRequest.update({
      where: { id: f.record.id },
      data: { inputHash: '0'.repeat(64) },
    })
  if (kind === 'tamper') f.signature = f.signature.slice(0, -5)
  await expect(service.complete(f.record.id, f.signature)).rejects.toThrow()
  expect(await db.commitAssessment.count()).toBe(0)
  expect(
    (
      await db.nativeExecutionRequest.findUniqueOrThrow({
        where: { id: f.record.id },
      })
    ).receiptHash,
  ).toBeNull()
})
it('acknowledges cancellation only after cleanup and excludes it from assessment evidence', async () => {
  const f = await admitted()
  await requests.cancel(actor, '51', f.record.id)
  expect((await service.complete(f.record.id, f.signature)).state).toBe(
    'CANCELLED',
  )
  expect(await db.commitAssessment.count()).toBe(0)
})
it('a newer queued attempt prevents reuse of a passing receipt', async () => {
  const f = await admitted()
  await service.complete(f.record.id, f.signature)
  expect((await gate()).status).toBe('PASS')
  const newer = await admitted()
  expect((await gate()).status).toBe('INCOMPLETE')
  expect(freezeNativeEvidence(newer.record).state).toBe('RUNNING')
})

it('queues only reviewed tools after signed execution capability and explicit opt-in', async () => {
  vi.stubEnv('NATIVE_EXECUTION_ENABLED', 'true')
  const access = new AuthorizationService(db)
  const queuedRequests = new NativeRequestService(db, access, plans, {
    status: async () => ({ preflightVerified: true, executionAvailable: true }),
  } as any)
  const plan = await plans.get(actor, '51', false)
  const input = {
    requestKey: randomUUID(),
    expectedSourceSha: plan.sourceSha,
    expectedSelectionId: plan.selectionId,
    expectedPlanHash: plan.planHash,
    ruleIds: ['secrets.scan'],
  }
  const queued = await queuedRequests.request(actor, '51', input)
  expect(queued.state).toBe('QUEUED')
  expect(queued.finishedAt).toBeNull()
  expect((await queuedRequests.list(actor, '51')).items[0].id).toBe(queued.id)
  expect(
    await db.auditEvent.count({ where: { event: 'native.execution.queued' } }),
  ).toBe(1)
  expect(await db.commitAssessment.count()).toBe(0)
  vi.stubEnv('NATIVE_EXECUTION_ENABLED', 'false')
  expect(
    (
      await queuedRequests.request(actor, '51', {
        ...input,
        requestKey: randomUUID(),
      })
    ).state,
  ).toBe('BLOCKED')
})

it('records a verified native failure and one attempt alert before saving the assessment, including replay', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted('FAIL')
  await service.complete(f.record.id, f.signature)
  const assessment = await db.commitAssessment.findFirstOrThrow({
    where: { repositoryId: repoId },
  })
  expect(assessmentNotification(assessment.report).type).toBe(
    'ASSESSMENT_FAILED',
  )
  const event = await db.notificationEvent.findUniqueOrThrow({
    where: {
      id: nativeExecutionFailureId(f.record.id, f.record.controllerJobId!),
    },
  })
  expect(event).toMatchObject({
    type: 'NATIVE_EXECUTION_FAILED',
    severity: 'error',
    organizationId: actor.organizationId,
    repositoryId: repoId,
    repositoryGithubId: '51',
    sourceSha: f.record.sourceSha,
    actorId: actor.identityId,
  })
  expect(event.assessmentId).toBeNull()
  expect(await db.notificationEvent.count()).toBe(1)
  expect((await service.complete(f.record.id, f.signature)).duplicate).toBe(
    true,
  )
  expect(await db.notificationEvent.count()).toBe(1)
  expect(await db.commitAssessment.count()).toBe(1)
})
it('rolls back a failed execution state when its outbox insertion fails', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted('FAIL')
  const failingDb = new Proxy(db, {
    get(target, property) {
      if (property !== '$transaction') return Reflect.get(target, property)
      return async (call: (tx: any) => Promise<unknown>, options: any) =>
        db.$transaction(async (tx) => {
          const fail = vi
            .spyOn(tx.notificationEvent, 'createMany')
            .mockRejectedValueOnce(new Error('outbox unavailable'))
          try {
            return await call(tx)
          } finally {
            fail.mockRestore()
          }
        }, options)
    },
  })
  const failingService = new NativeResultService(
    failingDb,
    new AuthorizationService(db),
    new AssessmentService(db),
  )
  await expect(
    failingService.complete(f.record.id, f.signature),
  ).rejects.toThrow('outbox unavailable')
  expect(await db.notificationEvent.count()).toBe(0)
  expect(await db.commitAssessment.count()).toBe(0)
  const live = await db.nativeExecutionRequest.findUniqueOrThrow({
    where: { id: f.record.id },
  })
  expect(live.state).toBe('RUNNING')
  expect(live.receiptHash).toBeNull()
  await service.complete(f.record.id, f.signature)
  expect(await db.notificationEvent.count()).toBe(1)
})
it('does not emit a native failure notification for user cancellation or partial coverage', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const cancelled = await admitted()
  await requests.cancel(actor, '51', cancelled.record.id)
  await service.complete(cancelled.record.id, cancelled.signature)
  expect(await db.notificationEvent.count()).toBe(0)
  const partial = await admitted()
  partial.value.checks.forEach((check) => {
    check.coverage = 'PARTIAL'
  })
  expect(
    (await service.complete(partial.record.id, seal(partial.value))).state,
  ).toBe('BLOCKED')
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(0)
  expect(
    await db.notificationEvent.count({
      where: { type: 'ASSESSMENT_INCOMPLETE' },
    }),
  ).toBe(1)
})
it('records a signed tool execution error as a failure notice while its evidence stays incomplete', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted('INCOMPLETE')
  f.value.checks.forEach((check) => {
    check.reason = 'TOOL_EXECUTION_FAILED'
  })
  expect((await service.complete(f.record.id, seal(f.value))).state).toBe(
    'BLOCKED',
  )
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(1)
  expect(await db.notificationEvent.count()).toBe(1)
  expect((await gate()).status).toBe('INCOMPLETE')
})
it.each([
  { reason: 'EXECUTION_UNAVAILABLE', cleanupConfirmed: true },
  { reason: 'CLEANUP_UNCONFIRMED', cleanupConfirmed: false },
])(
  'records signed $reason with no exit status while the check remains incomplete',
  async ({ reason, cleanupConfirmed }) => {
    vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
    const f = await admitted('INCOMPLETE')
    f.value.checks.forEach((check) => {
      check.exitCode = null
      check.reason = reason
      check.cleanupConfirmed = cleanupConfirmed
      check.reportHash = null
      check.summary = null
    })
    const signature = seal(f.value)
    expect((await service.complete(f.record.id, signature)).state).toBe(
      'BLOCKED',
    )
    const event = await db.notificationEvent.findUniqueOrThrow({
      where: {
        id: nativeExecutionFailureId(f.record.id, f.record.controllerJobId!),
      },
    })
    expect(event).toMatchObject({
      type: 'NATIVE_EXECUTION_FAILED',
      severity: 'error',
    })
    expect(await db.notificationEvent.count()).toBe(1)
    const assessment = await db.commitAssessment.findFirstOrThrow({
      where: { repositoryId: repoId },
    })
    expect(assessmentNotification(assessment.report).type).toBe(
      'ASSESSMENT_INCOMPLETE',
    )
    expect((await gate()).status).toBe('INCOMPLETE')
    expect((await service.complete(f.record.id, signature)).duplicate).toBe(
      true,
    )
    expect(await db.notificationEvent.count()).toBe(1)
  },
)
it.each([
  { reason: 'EXECUTION_UNAVAILABLE', cleanupConfirmed: true },
  { reason: 'CLEANUP_UNCONFIRMED', cleanupConfirmed: false },
])(
  'keeps user cancellation silent for signed $reason with no exit status',
  async ({ reason, cleanupConfirmed }) => {
    vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
    const f = await admitted('INCOMPLETE')
    await requests.cancel(actor, '51', f.record.id)
    f.value.cancelled = true
    f.value.checks.forEach((check) => {
      check.exitCode = null
      check.reason = reason
      check.cleanupConfirmed = cleanupConfirmed
      check.reportHash = null
      check.summary = null
    })
    expect((await service.complete(f.record.id, seal(f.value))).state).toBe(
      cleanupConfirmed ? 'CANCELLED' : 'BLOCKED',
    )
    expect(
      await db.notificationEvent.count({
        where: { type: 'NATIVE_EXECUTION_FAILED' },
      }),
    ).toBe(0)
  },
)
it('does not treat an incomplete report without an exit status as a runtime failure', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted('INCOMPLETE')
  f.value.checks.forEach((check) => {
    check.exitCode = null
    check.reason = 'REPORT_UNAVAILABLE'
    check.coverage = 'PARTIAL'
    check.reportHash = null
    check.summary = null
  })
  expect((await service.complete(f.record.id, seal(f.value))).state).toBe(
    'BLOCKED',
  )
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(0)
  expect((await gate()).status).toBe('INCOMPLETE')
})
it('does not misclassify a worker interruption as user cancellation during signed cleanup', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { state: 'CANCEL_REQUESTED', reason: 'EXECUTION_INTERRUPTED' },
  })
  f.value.cancelled = true
  f.value.checks.forEach((check) => {
    check.state = 'INCOMPLETE'
    check.reason = 'EXECUTION_CANCELLED'
    check.coverage = 'PARTIAL'
  })
  expect((await service.complete(f.record.id, seal(f.value))).state).toBe(
    'FAILED',
  )
  expect(await db.notificationEvent.count()).toBe(1)
  expect((await gate()).status).toBe('INCOMPLETE')
})

function dispatcher() {
  vi.stubEnv('NATIVE_EXECUTION_ENABLED', 'true')
  return new NativeDispatchService(
    db,
    new AuthorizationService(db),
    {
      readNativeSource: vi.fn(async () => {
        throw new Error('Running attempts must not export source again')
      }),
    } as any,
    { status: async () => ({ executionAvailable: true }) } as any,
    service,
  )
}
it('atomically records an admitted timeout once and does not re-notify a terminal attempt', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { leaseUntil: null, requestedAt: new Date(Date.now() - 1800001) },
  })
  vi.mocked(nativeControllerCall).mockRejectedValue(
    new Error('private controller error'),
  )
  const worker = dispatcher()
  await worker.reconcile()
  expect(
    (
      await db.nativeExecutionRequest.findUniqueOrThrow({
        where: { id: f.record.id },
      })
    ).state,
  ).toBe('TIMED_OUT')
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(1)
  expect(await db.commitAssessment.count()).toBe(0)
  await worker.reconcile()
  expect(await db.notificationEvent.count()).toBe(1)
})
it('records admitted infrastructure failure on missing completion proof, without creating trusted evidence', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { leaseUntil: null },
  })
  vi.mocked(nativeControllerCall).mockResolvedValue({ state: 'COMPLETE' })
  await dispatcher().reconcile()
  const live = await db.nativeExecutionRequest.findUniqueOrThrow({
    where: { id: f.record.id },
  })
  expect(live.state).toBe('FAILED')
  expect(live.receiptHash).toBeNull()
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(1)
  expect(await db.commitAssessment.count()).toBe(0)
})
it('does not emit failure alerts for user cancellation that reaches the worker deadline', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await requests.cancel(actor, '51', f.record.id)
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { leaseUntil: null, requestedAt: new Date(Date.now() - 1800001) },
  })
  vi.mocked(nativeControllerCall).mockRejectedValue(
    new Error('controller unavailable'),
  )
  await dispatcher().reconcile()
  expect(await db.notificationEvent.count()).toBe(0)
})
it('distinguishes confirmed worker-interruption cleanup from user cancellation', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { leaseUntil: null },
  })
  f.value.cancelled = true
  f.value.checks.forEach((check) => {
    check.state = 'INCOMPLETE'
    check.reason = 'EXECUTION_CANCELLED'
    check.coverage = 'PARTIAL'
  })
  vi.mocked(nativeControllerCall)
    .mockRejectedValueOnce(new Error('controller status unavailable'))
    .mockResolvedValue({ state: 'COMPLETE', signature: seal(f.value) })
  await dispatcher().reconcile()
  const live = await db.nativeExecutionRequest.findUniqueOrThrow({
    where: { id: f.record.id },
  })
  expect(live.state).toBe('FAILED')
  expect(live.reason).toBe('EXECUTION_UNAVAILABLE')
  expect(await db.notificationEvent.count()).toBe(1)
  expect(await db.commitAssessment.count()).toBe(0)
})

it('delivers native failure alerts only to current authorized repository recipients and hides revoked grants', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted('FAIL')
  await service.complete(f.record.id, f.signature)
  const eventId = nativeExecutionFailureId(
    f.record.id,
    f.record.controllerJobId!,
  )
  const granted = await db.identity.create({
    data: { issuer: 'fixture', subject: randomUUID() },
  })
  const unassigned = await db.identity.create({
    data: { issuer: 'fixture', subject: randomUUID() },
  })
  const foreign = await db.identity.create({
    data: { issuer: 'fixture', subject: randomUUID() },
  })
  const outside = await db.organization.create({
    data: { name: 'foreign notification scope' },
  })
  const membership = await db.organizationMembership.create({
    data: {
      identityId: granted.id,
      organizationId: actor.organizationId!,
      role: 'SECURITY_ENGINEER',
    },
  })
  await db.organizationMembership.create({
    data: {
      identityId: unassigned.id,
      organizationId: actor.organizationId!,
      role: 'SECURITY_ENGINEER',
    },
  })
  const foreignMembership = await db.organizationMembership.create({
    data: {
      identityId: foreign.id,
      organizationId: outside.id,
      role: 'SECURITY_ENGINEER',
    },
  })
  await db.repositoryGrant.createMany({
    data: [
      { membershipId: membership.id, repositoryId: repoId },
      { membershipId: foreignMembership.id, repositoryId: repoId },
    ],
  })
  await deliverNotification(db, eventId)
  expect(
    (
      await db.inboxNotification.findMany({
        where: { eventId },
        select: { identityId: true },
      })
    )
      .map((item) => item.identityId)
      .sort(),
  ).toEqual([actor.identityId, granted.id].sort())
  const notifications = new NotificationsService(
    db,
    new AuthorizationService(db),
  )
  const securitySession = {
    ...actor,
    identityId: granted.id,
    subject: granted.subject,
    role: 'SECURITY_ENGINEER',
  }
  expect(
    (
      await notifications.list(securitySession, {
        type: 'NATIVE_EXECUTION_FAILED',
      })
    ).total,
  ).toBe(1)
  await db.repositoryGrant.deleteMany({
    where: { membershipId: membership.id },
  })
  expect(
    (
      await notifications.list(securitySession, {
        type: 'NATIVE_EXECUTION_FAILED',
      })
    ).items,
  ).toEqual([])
  expect(
    (
      await notifications.list(
        { ...securitySession, organizationId: outside.id },
        {},
      )
    ).items,
  ).toEqual([])
})

it('does not accept a late passing receipt after an admitted worker interruption', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  await db.nativeExecutionRequest.update({
    where: { id: f.record.id },
    data: { state: 'CANCEL_REQUESTED', reason: 'EXECUTION_INTERRUPTED' },
  })
  expect((await service.complete(f.record.id, f.signature)).state).toBe(
    'CANCELLED',
  )
  expect(await db.commitAssessment.count()).toBe(0)
  expect(await db.notificationEvent.count()).toBe(0)
})

it('notifies a signed controller restart interruption of a running attempt without accepting cancelled evidence', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const f = await admitted()
  f.value.cancelled = true
  f.value.checks.forEach((check) => {
    check.state = 'INCOMPLETE'
    check.reason = 'EXECUTION_CANCELLED'
    check.coverage = 'PARTIAL'
  })
  expect((await service.complete(f.record.id, seal(f.value))).state).toBe(
    'FAILED',
  )
  expect(
    await db.notificationEvent.count({
      where: { type: 'NATIVE_EXECUTION_FAILED' },
    }),
  ).toBe(1)
  expect((await gate()).status).toBe('INCOMPLETE')
})
