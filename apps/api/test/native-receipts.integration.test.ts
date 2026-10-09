import 'reflect-metadata'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { NativePlanService } from '../src/execution/native-plan.service.js'
import { NativeRequestService } from '../src/execution/native-request.service.js'
import { NativeResultService } from '../src/execution/native-result.service.js'
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
