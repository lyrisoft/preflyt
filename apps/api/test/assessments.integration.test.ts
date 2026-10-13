import {disposableDatabase} from './disposable-database.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { CiAttestationController } from '../src/github-events/ci-attestation.controller.js'
import { CiAttestationService } from '../src/github-events/ci-attestation.service.js'
import { CiAttestationVerifier } from '../src/github-events/ci-attestation-verifier.js'
import { attestationPolicy } from '../src/github-events/ci-attestation-policy.js'
import { createHash } from 'node:crypto'
import { parseArtifact } from '../src/github-events/ci-artifact-parser.js'
import { PullRequestController } from '../src/assessments/pull-request.controller.js'
import { PullRequestService } from '../src/assessments/pull-request.service.js'
import { GitHubPrSyncService } from '../src/github/github-pr-sync.service.js'
import { CiBindingController } from '../src/assessments/ci-binding.controller.js'
import { CiBindingService } from '../src/assessments/ci-binding.service.js'
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { AssessmentController } from '../src/assessments/assessment.controller.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { digest } from '../src/assessments/assessment-plan.js'
import { GitHubEventProcessor } from '../src/github-events/github-event-processor.js'
import { importCiEvidence } from '../src/github-events/ci-evidence.js'
import { ForbiddenException, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard, OwnerAdminGuard } from '../src/auth/session.guard.js'
import { StandardsController } from '../src/standards/standards.controller.js'
import { StandardsService } from '../src/standards/standards.service.js'
const verifyProof = vi.fn()
let app: INestApplication, prisma: PrismaService, actorId: string
const body = (
  expectedSelectionId: string | null = null,
  profile = 'RECOMMENDED',
) => ({
  expectedSelectionId,
  profile,
  packs: [{ id: 'baseline-engineering', version: '1.0.0' }],
})
const post = (
  value: object = body(),
  role = 'OWNER',
  origin = 'http://localhost:5173',
  id = '501',
) =>
  request(app.getHttpServer())
    .post(`/github/repositories/${id}/standards`)
    .set('Cookie', 'test.sid=' + role)
    .set('Origin', origin)
    .send(value)
const get = (id = '501') =>
  request(app.getHttpServer())
    .get(`/github/repositories/${id}/standards`)
    .set('Cookie', 'test.sid=VIEWER')
beforeAll(async () => {
  fixture = await disposableDatabase('assessments')
  prisma = fixture.prisma
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [
        CiAttestationController,
        PullRequestController,
        StandardsController,
        AssessmentController,
        CiBindingController,
      ],
      providers: [
        CiAttestationService,
        { provide: CiAttestationVerifier, useValue: { verify: verifyProof } },
        PullRequestService,
        CiBindingService,
        StandardsService,
        AssessmentService,
        SessionGuard,
        {
          provide: AuthorizationService,
          useValue: {
            authorizeRequest: async () => false,
            repositoryScope: async () =>
              prisma.gitHubRepository.findMany({
                where: {
                  selected: true,
                  available: true,
                  installation: { active: true },
                },
              }),
          },
        },
        OwnerAdminGuard,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: 'test.sid',
            assertOrigin: (origin?: string) => {
              if (origin !== 'http://localhost:5173')
                throw new ForbiddenException()
            },
            currentSession: async (token?: string) =>
              ['OWNER', 'ADMIN', 'SUPER_ADMIN', 'VIEWER'].includes(token ?? '')
                ? { authenticated: true, identityId: actorId, organizationId: 'fixture-org', role: token }
                : { authenticated: false },
          },
        },
      ],
    },
    { logger: false },
  )
  app.use(cookieParser())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  await app.init()
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  await fixture?.close()
})
beforeEach(async () => {
  await fixture.reset()
  vi.unstubAllEnvs()
  verifyProof.mockReset()
  await prisma.gitHubWebhookDelivery.deleteMany()
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.gitHubSetupTransaction.deleteMany()
  await prisma.identity.deleteMany()
  await prisma.auditEvent.deleteMany()
  actorId = (
    await prisma.identity.create({
      data: { issuer: 'test', subject: 'standards-owner' },
    })
  ).id
  const organization = await prisma.organization.create({data: {id: 'fixture-org', name: 'Fixture'}})
  await prisma.organizationMembership.create({data: {organizationId: organization.id, identityId: actorId, role: 'OWNER'}})
  await prisma.gitHubInstallation.create({
    data: {
      organizationId: organization.id,
      id: 500n,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      connectedById: actorId,
    },
  })
  const repo = await prisma.gitHubRepository.create({
    data: {
      githubId: 501n,
      installationId: 500n,
      name: 'app',
      fullName: 'fixture/app',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: true,
    },
  })
  await prisma.repositoryProfile.create({
    data: {
      repositoryId: repo.id,
      sourceSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      branch: 'main',
      fullName: 'fixture/app',
      version: 1,
      complete: true,
      report: {
        signals: [
          {
            id: 'frameworks',
            state: 'detected',
            observations: ['NestJS'],
            evidence: [
              {
                path: 'package.json',
                blobSha: 'c'.repeat(40),
                reason: 'manifest',
              },
            ],
          },
          { id: 'ci', state: 'not_detected', observations: [], evidence: [] },
        ],
      },
    },
  })
})

async function ready(sha = 'a'.repeat(40)) {
  const saved = await post()
  const delivery = await prisma.gitHubWebhookDelivery.create({
    data: {
      id: randomUUID(),
      event: 'check_run',
      action: 'completed',
      installationId: 500n,
      repositoryGithubId: 501n,
      sourceSha: sha,
      sourceObjectId: '44',
      sourceStatus: 'completed',
      sourceConclusion: 'success',
      sourceUpdatedAt: new Date(),
      payloadHash: 'f'.repeat(64),
      state: 'PROCESSED',
    },
  })
  await prisma.importedCiEvidence.create({ data: importCiEvidence(delivery)! })
  return { selection: saved.body, delivery }
}
const create = (
  value: object,
  role = 'OWNER',
  origin = 'http://localhost:5173',
  repo = '501',
) =>
  request(app.getHttpServer())
    .post(`/github/repositories/${repo}/assessments`)
    .set('Cookie', 'test.sid=' + role)
    .set('Origin', origin)
    .send(value)
const readAssessment = (id: string, repo = '501') =>
  request(app.getHttpServer())
    .get(`/github/repositories/${repo}/assessments/${id}`)
    .set('Cookie', 'test.sid=VIEWER')
const assessmentBody = (selectionId: string, deliveryId: string) => ({
  sourceSha: 'a'.repeat(40),
  expectedSelectionId: selectionId,
  requestKey: randomUUID(),
  mappings: [{ ruleId: 'tests.required', deliveryId }],
})
describe('immutable exact-SHA assessment API', () => {
  it('freezes exact selected versions, source evidence and private artifact summaries with a reproducible hash', async () => {
    const { selection, delivery } = await ready()
    await prisma.ciArtifactImport.create({
      data: {
        deliveryId: delivery.id,
        format: 'junit',
        sha256: 'd'.repeat(64),
        content: Buffer.from('secret-report'),
        summary: { tests: 1, passed: 1 },
        uploadedById: actorId,
      },
    })
    const result = await create(assessmentBody(selection.id, delivery.id))
    expect(result.status).toBe(201)
    const stored = result.body.assessment
    expect(stored.report).toMatchObject({
      sourceSha: 'a'.repeat(40),
      coverage: 'INCOMPLETE',
      qualityGate: null,
      trustedExecutedChecks: 0,
    })
    expect(
      stored.report.checks.find(
        (c: { ruleId: string }) => c.ruleId === 'tests.required',
      ),
    ).toMatchObject({ coverage: 'INVALID', providerResult: 'SUCCEEDED' })
    expect(JSON.stringify(stored)).not.toContain('secret-report')
    expect(stored.assessmentHash).toBe(
      digest({
        request: stored.request,
        plan: stored.plan,
        report: stored.report,
      }),
    )
    const update = await post(body(selection.id, 'STRICT'))
    expect(update.status).toBe(201)
    await prisma.importedCiEvidence.deleteMany()
    const historical = await readAssessment(stored.id)
    expect(historical.status).toBe(200)
    expect(historical.body.plan.adoptionProfile).toBe('RECOMMENDED')
    expect(historical.body.report.observations).toHaveLength(1)
    expect(historical.body.assessmentHash).toBe(stored.assessmentHash)
  })
  it('queues verified source locations with new assessments without changing their evidence hash', async () => {
    const { selection, delivery } = await ready()
    const content = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'fixture' } }, results: [{ ruleId: 'unsafe-query', level: 'error', message: { text: 'Unsafe query' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'src/app.ts' }, region: { startLine: 2, endLine: 3 } } }] }] }] })
    const sha256 = createHash('sha256').update(content).digest('hex'), parsed = parseArtifact('sarif', content, sha256)
    await prisma.ciArtifactImport.create({ data: { deliveryId: delivery.id, format: 'sarif', sha256, parserVersion: 1, content: parsed.bytes, summary: parsed.summary, uploadedById: actorId } })
    const result = await create(assessmentBody(selection.id, delivery.id))
    expect(result.status).toBe(201)
    const queued = await prisma.findingSourceExcerpt.findMany()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ sourceSha: 'a'.repeat(40), path: 'src/app.ts', line: 2, endLine: 3, content: null, capturedAt: null })
    const saved = result.body.assessment
    expect(saved.assessmentHash).toBe(digest({ request: saved.request, plan: saved.plan, report: saved.report }))
  })
  it('deduplicates concurrent requests and rejects request-key reuse with altered input', async () => {
    const { selection, delivery } = await ready()
    const value = assessmentBody(selection.id, delivery.id)
    const results = await Promise.all([
      create(value),
      create(value),
      create(value),
    ])
    expect(results.every((r) => r.status === 201)).toBe(true)
    expect(results.filter((r) => !r.body.duplicate)).toHaveLength(1)
    expect(await prisma.commitAssessment.count()).toBe(1)
    expect(
      await prisma.auditEvent.count({ where: { event: 'assessment.created' } }),
    ).toBe(1)
    expect((await create({ ...value, mappings: [] })).status).toBe(409)
  })
  it('filters assessment history by exact standards selection and revision', async () => {
    const { selection, delivery } = await ready()
    const saved = await create(assessmentBody(selection.id, delivery.id))
    expect(saved.status).toBe(201)
    const current = await prisma.commitAssessment.findUniqueOrThrow({ where: { id: saved.body.assessment.id } })
    const requestV2 = { ...(current.request as Record<string, unknown>), selectionRevision: selection.revision + 1 }
    const newer = await prisma.commitAssessment.create({ data: {
      ...current, id: randomUUID(), requestKey: randomUUID(), request: JSON.parse(JSON.stringify(requestV2)),
      createdAt: new Date(current.createdAt.getTime() + 1000),
      assessmentHash: digest({ request: requestV2, plan: current.plan, report: current.report }),
      plan: JSON.parse(JSON.stringify(current.plan)), report: JSON.parse(JSON.stringify(current.report)),
    } })
    const url = `/github/repositories/501/assessments?selection=${selection.id}&revision=${selection.revision}`
    const result = await request(app.getHttpServer()).get(url).set('Cookie', 'test.sid=VIEWER')
    expect(result.status).toBe(200)
    expect(result.body.assessments.map((row: { id: string }) => row.id)).toEqual([current.id])
    const otherRevision = await request(app.getHttpServer()).get(url.replace(`revision=${selection.revision}`, `revision=${selection.revision + 1}`)).set('Cookie', 'test.sid=VIEWER')
    expect(otherRevision.body.assessments.map((row: { id: string }) => row.id)).toEqual([newer.id])
    const anotherSelection = await request(app.getHttpServer()).get(url.replace(selection.id, 'other-selection')).set('Cookie', 'test.sid=VIEWER')
    expect(anotherSelection.body.assessments).toEqual([])
    for (const query of ['selection=valid', 'revision=1', 'selection=valid&revision=0', 'selection=valid&revision=1.5', 'selection=valid&revision=2147483648']) {
      expect((await request(app.getHttpServer()).get('/github/repositories/501/assessments?' + query).set('Cookie', 'test.sid=VIEWER')).status).toBe(400)
    }
    expect((await request(app.getHttpServer()).get(url)).status).toBe(401)
    await prisma.gitHubRepository.update({ where: { githubId: 501n }, data: { selected: false } })
    expect((await request(app.getHttpServer()).get(url).set('Cookie', 'test.sid=VIEWER')).status).toBe(403)
  })
  it('requires admin/origin/current selection for creation and active repository access for every read', async () => {
    const { selection, delivery } = await ready()
    const value = assessmentBody(selection.id, delivery.id)
    expect((await create(value, 'invalid')).status).toBe(401)
    expect((await create(value, 'VIEWER')).status).toBe(403)
    expect(
      (await create(value, 'OWNER', 'https://attacker.example')).status,
    ).toBe(403)
    expect(
      (await create({ ...value, expectedSelectionId: 'old' })).status,
    ).toBe(409)
    const saved = await create(value, 'SUPER_ADMIN')
    expect(saved.status).toBe(201)
    expect((await readAssessment(saved.body.assessment.id, '502')).status).toBe(
      403,
    )
    expect(
      (
        await request(app.getHttpServer()).get(
          '/github/repositories/501/assessments',
        )
      ).status,
    ).toBe(401)
    await prisma.gitHubRepository.update({
      where: { githubId: 501n },
      data: { selected: false },
    })
    expect((await readAssessment(saved.body.assessment.id)).status).toBe(403)
    expect((await create({ ...value, requestKey: randomUUID() })).status).toBe(
      403,
    )
  })
  it('never borrows evidence/profile from another commit and rejects duplicate/unknown rule mappings', async () => {
    const { selection, delivery } = await ready('b'.repeat(40))
    const value = assessmentBody(selection.id, delivery.id)
    expect((await create(value)).status).toBe(400)
    expect(
      (await create({ ...value, sourceSha: 'c'.repeat(40), mappings: [] }))
        .status,
    ).toBe(404)
    expect(
      (
        await create({
          ...value,
          sourceSha: 'b'.repeat(40),
          mappings: [...value.mappings, ...value.mappings],
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await create({
          ...value,
          sourceSha: 'b'.repeat(40),
          mappings: [{ ruleId: 'unknown', deliveryId: delivery.id }],
        })
      ).status,
    ).toBe(400)
    expect(
      (await create({ ...value, mappings: [], qualityGate: 'PASS' })).status,
    ).toBe(400)
    const other = await create({ ...value, sourceSha: 'b'.repeat(40) })
    expect(other.status).toBe(201)
    expect(other.body.assessment.request.profileSnapshotId).toBeNull()
    const list = await request(app.getHttpServer())
      .get('/github/repositories/501/assessments?sha=' + 'a'.repeat(40))
      .set('Cookie', 'test.sid=VIEWER')
    expect(list.body.assessments).toEqual([])
  })
  it('bounds collected history and rejects evidence outside the collection instead of silently truncating mapping', async () => {
    const { selection, delivery } = await ready()
    const original = await prisma.importedCiEvidence.findUniqueOrThrow({
      where: { deliveryId: delivery.id },
    })
    const newIds = Array.from({ length: 100 }, () => randomUUID())
    await prisma.gitHubWebhookDelivery.createMany({
      data: newIds.map((id) => ({
        id,
        event: 'check_run',
        action: 'completed',
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceSha: 'a'.repeat(40),
        sourceObjectId: '45',
        sourceStatus: 'completed',
        sourceConclusion: 'success',
        sourceUpdatedAt: new Date(),
        payloadHash: 'f'.repeat(64),
        state: 'PROCESSED' as const,
      })),
    })
    await prisma.importedCiEvidence.createMany({
      data: newIds.map((id) => ({
        ...original,
        deliveryId: id,
        observedAt: new Date(Date.now() + 1000),
      })),
    })
    expect(
      (await create(assessmentBody(selection.id, delivery.id))).status,
    ).toBe(400)
    const result = await create({
      ...assessmentBody(selection.id, newIds[0]),
      mappings: [],
    })
    expect(result.status).toBe(201)
    expect(result.body.assessment.report.collectionTruncated).toBe(true)
    await bind(selection.id)
    expect(testRule(await boundAssessment(selection.id)).coverage).toBe(
      'AMBIGUOUS',
    )
    expect(result.body.assessment.report.observations).toHaveLength(100)
    expect(result.body.assessment.report.coverage).toBe('INCOMPLETE')
  })
  it('rejects a historical report whose stored content no longer matches its digest', async () => {
    const { selection, delivery } = await ready()
    const saved = await create(assessmentBody(selection.id, delivery.id))
    await prisma.commitAssessment.update({
      where: { id: saved.body.assessment.id },
      data: { report: { qualityGate: 'PASS' } },
    })
    expect((await readAssessment(saved.body.assessment.id)).status).toBe(409)
  })
  it('rolls back the snapshot when audit storage fails and fails closed on adopted digest tampering', async () => {
    const { selection, delivery } = await ready()
    const value = assessmentBody(selection.id, delivery.id)
    const broken = {
      gitHubRepository: prisma.gitHubRepository,
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                return key === 'auditEvent'
                  ? {
                      findMany: tx.auditEvent.findMany.bind(tx.auditEvent),
                      create: async () => {
                        throw new Error('storage unavailable')
                      },
                    }
                  : Reflect.get(target, key)
              },
            }),
          ),
        ),
    } as unknown as PrismaService
    await expect(
      new AssessmentService(broken).create('501', value, actorId),
    ).rejects.toThrow('storage unavailable')
    expect(await prisma.commitAssessment.count()).toBe(0)
    await prisma.repositoryStandardsSelection.update({
      where: { id: selection.id },
      data: {
        packs: [
          { id: 'baseline-engineering', version: '1.0.0', digest: 'bad' },
        ],
      },
    })
    expect((await create(value)).status).toBe(409)
  })
})

describe('atomic automatic CI assessment snapshots', () => {
  it('reuses unchanged polling snapshots, ignores its own feedback, and records changed CI evidence', async () => {
    vi.stubEnv('GITHUB_APP_ID', '999')
    const {selection, delivery} = await ready()
    const service = new AssessmentService(prisma)
    const context = {...prContext('a'.repeat(40)), version: 1 as const, state: 'open' as const, number: 5, objectId: '55'}
    const run = () => service.createAutomatic('501', delivery.sourceSha, selection.id, randomUUID(), actorId, context)
    const first = await run()
    expect((first.assessment.report as any).observations).toHaveLength(1)
    const second = await run()
    expect(second.duplicate).toBe(true)
    expect(second.assessment.id).toBe(first.assessment.id)
    const feedback = await prisma.gitHubWebhookDelivery.create({data: {
      id: randomUUID(), event: 'check_run', action: 'completed', installationId: 500n,
      repositoryGithubId: 501n, sourceSha: delivery.sourceSha, sourceObjectId: '999',
      sourceIdentity: {kind: 'check_run', appId: '999', checkName: 'Preflyt / Engineering Readiness'},
      sourceStatus: 'completed', sourceConclusion: 'failure', payloadHash: '1'.repeat(64), sourceUpdatedAt: new Date(),
    }})
    await prisma.importedCiEvidence.create({data: importCiEvidence(feedback)!})
    expect((await run()).assessment.id).toBe(first.assessment.id)
    const changed = await prisma.gitHubWebhookDelivery.create({data: {
      id: randomUUID(), event: 'check_run', action: 'completed', installationId: 500n,
      repositoryGithubId: 501n, sourceSha: delivery.sourceSha, sourceObjectId: '88',
      sourceStatus: 'completed', sourceConclusion: 'failure', payloadHash: '2'.repeat(64), sourceUpdatedAt: new Date(),
    }})
    await prisma.importedCiEvidence.create({data: importCiEvidence(changed)!})
    const next = await run()
    expect(next.assessment.id).not.toBe(first.assessment.id)
    expect((next.assessment.report as any).observations).toHaveLength(2)
    expect(await prisma.commitAssessment.count()).toBe(2)
  })

  it('preserves manual request idempotency hashes used before automatic triggers were added', async () => {
    const { selection, delivery } = await ready()
    const input = assessmentBody(selection.id, delivery.id)
    const first = await create(input)
    expect(first.status).toBe(201)
    const stored = await prisma.commitAssessment.findUniqueOrThrow({
      where: { id: first.body.assessment.id },
    })
    expect(stored.inputHash).toBe(
      digest({
        sourceSha: input.sourceSha,
        expectedSelectionId: input.expectedSelectionId,
        mappings: input.mappings,
        actorId,
      }),
    )
    const retry = await create(input)
    expect(retry.status).toBe(201)
    expect(retry.body).toMatchObject({
      duplicate: true,
      assessment: { id: stored.id },
    })
  })
  async function incoming(
    sha = 'd'.repeat(40),
    event = 'check_run',
    action = 'completed',
  ) {
    return prisma.gitHubWebhookDelivery.create({
      data: {
        id: randomUUID(),
        event,
        action,
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceSha: sha,
        sourceObjectId: '99',
        sourceStatus: 'completed',
        sourceConclusion: 'success',
        sourceUpdatedAt: new Date(),
        payloadHash: 'e'.repeat(64),
      },
    })
  }
  it('commits one exact-SHA frozen assessment with evidence and audits under concurrent retries', async () => {
    const selection = (await post()).body
    const delivery = await incoming()
    const processor = new GitHubEventProcessor(prisma)
    await Promise.all([
      processor.process(delivery.id),
      processor.process(delivery.id),
    ])
    await processor.process(delivery.id)
    const snapshot = await prisma.commitAssessment.findFirstOrThrow()
    expect(await prisma.commitAssessment.count()).toBe(1)
    expect(await prisma.importedCiEvidence.count()).toBe(1)
    expect(snapshot.request).toMatchObject({
      trigger: 'GITHUB_CI',
      sourceDeliveryId: delivery.id,
      sourceSha: delivery.sourceSha,
      actorId: null,
      selectionId: selection.id,
      mappings: [],
      profileSnapshot: null,
    })
    expect(snapshot.report).toMatchObject({
      sourceSha: delivery.sourceSha,
      coverage: 'INCOMPLETE',
      qualityGate: null,
      trustedExecutedChecks: 0,
      observations: [{ deliveryId: delivery.id, result: 'SUCCEEDED' }],
    })
    expect(
      (snapshot.report as any).checks.find(
        (c: any) => c.ruleId === 'tests.required',
      ),
    ).toMatchObject({
      coverage: 'MISSING',
      mappingTrust: null,
      ruleOutcome: null,
    })
    expect(snapshot.assessmentHash).toBe(
      digest({
        request: snapshot.request,
        plan: snapshot.plan,
        report: snapshot.report,
      }),
    )
    expect(
      await prisma.auditEvent.count({ where: { event: 'assessment.created' } }),
    ).toBe(1)
    expect(
      await prisma.auditEvent.count({
        where: { event: 'github_event_processed' },
      }),
    ).toBe(1)
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).state,
    ).toBe('PROCESSED')
  })
  it('keeps new commits and out-of-order deliveries historical without borrowing a profile or rewriting old reports', async () => {
    await post()
    const processor = new GitHubEventProcessor(prisma)
    const first = await incoming('d'.repeat(40))
    await processor.process(first.id)
    const old = await prisma.commitAssessment.findFirstOrThrow()
    const second = await incoming('c'.repeat(40), 'workflow_run')
    await prisma.gitHubWebhookDelivery.update({
      where: { id: second.id },
      data: { sourceUpdatedAt: new Date('2020-01-01') },
    })
    await processor.process(second.id)
    expect(await prisma.commitAssessment.count()).toBe(2)
    expect(
      await prisma.commitAssessment.findUnique({ where: { id: old.id } }),
    ).toEqual(old)
    const newer = await prisma.commitAssessment.findFirstOrThrow({
      where: { sourceSha: second.sourceSha },
    })
    expect(
      (newer.report as any).observations.every(
        (o: any) => o.sourceSha === second.sourceSha,
      ),
    ).toBe(true)
    expect(newer.request).toMatchObject({ profileSnapshot: null })
  })
  it('imports CI without adoption and does not infer missing PR context', async () => {
    const processor = new GitHubEventProcessor(prisma)
    const delivery = await incoming()
    await processor.process(delivery.id)
    expect(await prisma.importedCiEvidence.count()).toBe(1)
    expect(await prisma.commitAssessment.count()).toBe(0)
    expect(
      (
        await prisma.auditEvent.findFirstOrThrow({
          where: { event: 'github_event_processed' },
        })
      ).metadata,
    ).toMatchObject({
      assessmentId: null,
      assessmentReason: 'standards_not_adopted',
    })
    await post()
    const pr = await incoming('e'.repeat(40), 'pull_request', 'synchronize')
    await processor.process(pr.id)
    expect(await prisma.commitAssessment.count()).toBe(0)
  })
  it('does not create evidence or assessments after selection is revoked', async () => {
    await post()
    const delivery = await incoming()
    await prisma.gitHubRepository.updateMany({ data: { selected: false } })
    await new GitHubEventProcessor(prisma).process(delivery.id)
    expect(await prisma.importedCiEvidence.count()).toBe(0)
    expect(await prisma.commitAssessment.count()).toBe(0)
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).state,
    ).toBe('IGNORED')
  })
  it('retains a delayed triggering observation beyond the bounded latest-100 collection', async () => {
    await post()
    const old = await incoming()
    await prisma.gitHubWebhookDelivery.update({
      where: { id: old.id },
      data: { receivedAt: new Date('2020-01-01') },
    })
    for (let index = 0; index < 101; index++) {
      const newer = await incoming()
      await prisma.importedCiEvidence.create({
        data: importCiEvidence(newer)!,
      })
      await prisma.gitHubWebhookDelivery.update({
        where: { id: newer.id },
        data: { state: 'PROCESSED' },
      })
    }
    await new GitHubEventProcessor(prisma).process(old.id)
    const snapshot = await prisma.commitAssessment.findFirstOrThrow()
    const report = snapshot.report as any
    expect(report.collectionTruncated).toBe(true)
    expect(report.observations).toHaveLength(100)
    expect(report.observations.some((o: any) => o.deliveryId === old.id)).toBe(
      true,
    )
  })
  it('rolls back the claimed delivery and CI evidence if adopted definitions are corrupt; retry recovers', async () => {
    const selection = (await post()).body
    const adopted = await prisma.repositoryStandardsSelection.findUniqueOrThrow(
      { where: { id: selection.id } },
    )
    await prisma.repositoryStandardsSelection.update({
      where: { id: selection.id },
      data: { packs: [{ id: 'missing', version: '1', digest: 'bad' }] },
    })
    const delivery = await incoming()
    const processor = new GitHubEventProcessor(prisma)
    await expect(processor.process(delivery.id)).rejects.toThrow()
    expect(await prisma.importedCiEvidence.count()).toBe(0)
    expect(await prisma.commitAssessment.count()).toBe(0)
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).state,
    ).toBe('RECEIVED')
    await prisma.repositoryStandardsSelection.update({
      where: { id: selection.id },
      data: { packs: adopted.packs! },
    })
    await processor.process(delivery.id)
    expect(await prisma.commitAssessment.count()).toBe(1)
  })
  it('rolls back delivery, CI evidence and snapshot if the processor audit fails after snapshot creation', async () => {
    await post()
    const delivery = await incoming()
    const broken = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                return key === 'auditEvent'
                  ? {
                      findMany: tx.auditEvent.findMany.bind(tx.auditEvent),
                      create: async (args: any) => {
                        if (args.data.event === 'github_event_processed')
                          throw new Error('processor audit unavailable')
                        return tx.auditEvent.create(args)
                      },
                    }
                  : Reflect.get(target, key)
              },
            }),
          ),
        ),
    } as unknown as PrismaService
    await expect(
      new GitHubEventProcessor(broken).process(delivery.id),
    ).rejects.toThrow('processor audit unavailable')
    expect(await prisma.importedCiEvidence.count()).toBe(0)
    expect(await prisma.commitAssessment.count()).toBe(0)
    expect(
      await prisma.auditEvent.count({ where: { event: 'assessment.created' } }),
    ).toBe(0)
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: delivery.id },
        })
      ).state,
    ).toBe('RECEIVED')
  })
})

const ciBinding = {
  ruleId: 'tests.required',
  kind: 'check_run',
  appId: '123',
  checkName: 'unit tests',
}
const bind = (
  selectionId: string,
  bindings: object[] = [ciBinding],
  expectedBindingId: string | null = null,
  role = 'OWNER',
  origin = 'http://localhost:5173',
) =>
  request(app.getHttpServer())
    .post('/github/repositories/501/ci-bindings')
    .set('Cookie', 'test.sid=' + role)
    .set('Origin', origin)
    .send({ expectedSelectionId: selectionId, expectedBindingId, bindings })
const boundAssessment = (selectionId: string) =>
  create({
    sourceSha: 'a'.repeat(40),
    expectedSelectionId: selectionId,
    requestKey: randomUUID(),
    mappings: [],
  })
async function identify(
  deliveryId: string,
  identity: object = {
    kind: 'check_run',
    appId: '123',
    checkName: 'unit tests',
  },
) {
  // Re-import the normalized signed delivery exactly as the processor does.
  await prisma.importedCiEvidence.delete({ where: { deliveryId } })
  const d = await prisma.gitHubWebhookDelivery.update({
    where: { id: deliveryId },
    data: { sourceIdentity: identity },
  })
  await prisma.importedCiEvidence.create({ data: importCiEvidence(d)! })
}
const testRule = (response: any) =>
  response.body.assessment.report.checks.find(
    (c: any) => c.ruleId === 'tests.required',
  )
describe('approved source bindings', () => {
  it('requires role, origin, current adoption and valid exact identities', async () => {
    const { selection } = await ready()
    expect((await bind(selection.id, [ciBinding], null, 'VIEWER')).status).toBe(
      403,
    )
    expect(
      (
        await bind(
          selection.id,
          [ciBinding],
          null,
          'OWNER',
          'https://evil.example',
        )
      ).status,
    ).toBe(403)
    expect((await bind('stale')).status).toBe(409)
    for (const b of [
      { ...ciBinding, appId: '0' },
      { ...ciBinding, checkName: '' },
      { ...ciBinding, workflowId: '9' },
      { ...ciBinding, ruleId: 'dependencies.locked' },
      { ...ciBinding, ruleId: 'unknown' },
    ])
      expect((await bind(selection.id, [b])).status).toBe(400)
    expect((await bind(selection.id, [ciBinding, ciBinding])).status).toBe(400)
    expect(await prisma.repositoryCiBindings.count()).toBe(0)
  })
  it('serializes competing approvals and audits only the winner', async () => {
    const { selection } = await ready()
    const responses = await Promise.all([
      bind(selection.id),
      bind(selection.id),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prisma.repositoryCiBindings.count()).toBe(1)
    expect(
      await prisma.auditEvent.count({
        where: { event: 'ci_bindings.adopted' },
      }),
    ).toBe(1)
  })
  it('automatically associates exact signed identities without claiming execution and freezes approvals', async () => {
    const { selection, delivery } = await ready()
    await identify(delivery.id)
    const approved = await bind(selection.id)
    expect(approved.status).toBe(201)
    const assessed = await boundAssessment(selection.id)
    expect(testRule(assessed)).toMatchObject({
      deliveryId: delivery.id,
      mappingTrust: 'APPROVED_SOURCE_BINDING',
      coverage: 'UNVERIFIED',
      ruleOutcome: null,
      providerResult: 'SUCCEEDED',
    })
    expect(assessed.body.assessment.request.sourceBindings.id).toBe(
      approved.body.id,
    )
    expect(assessed.body.assessment.report).toMatchObject({
      trustedExecutedChecks: 0,
      qualityGate: null,
    })
    expect((await bind(selection.id, [], approved.body.id)).status).toBe(201)
    expect(testRule(await boundAssessment(selection.id)).deliveryId).toBeNull()
    const historical = await readAssessment(assessed.body.assessment.id)
    expect(historical.body.assessmentHash).toBe(
      assessed.body.assessment.assessmentHash,
    )
  })
  it('rejects another app, differently cased names and identity-free historic evidence', async () => {
    const { selection, delivery } = await ready()
    await bind(selection.id)
    expect(testRule(await boundAssessment(selection.id)).deliveryId).toBeNull()
    for (const identity of [
      { kind: 'check_run', appId: '124', checkName: 'unit tests' },
      { kind: 'check_run', appId: '123', checkName: 'Unit tests' },
    ]) {
      await identify(delivery.id, identity)
      expect(
        testRule(await boundAssessment(selection.id)).deliveryId,
      ).toBeNull()
    }
  })
  it('blocks automatic selection between distinct matching run IDs', async () => {
    const { selection, delivery } = await ready()
    await identify(delivery.id)
    await bind(selection.id)
    const d = await prisma.gitHubWebhookDelivery.create({
      data: {
        id: randomUUID(),
        event: 'check_run',
        action: 'completed',
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceSha: 'a'.repeat(40),
        sourceObjectId: '45',
        sourceStatus: 'completed',
        sourceConclusion: 'failure',
        sourceUpdatedAt: new Date(),
        payloadHash: 'e'.repeat(64),
        sourceIdentity: {
          kind: 'check_run',
          appId: '123',
          checkName: 'unit tests',
        },
        state: 'PROCESSED',
      },
    })
    await prisma.importedCiEvidence.create({ data: importCiEvidence(d)! })
    expect(testRule(await boundAssessment(selection.id))).toMatchObject({
      coverage: 'AMBIGUOUS',
      ambiguous: true,
      deliveryId: null,
    })
    expect(
      testRule(await create(assessmentBody(selection.id, delivery.id))),
    ).toMatchObject({ mappingTrust: 'ADMIN_ASSOCIATED_UNVERIFIED' })
  })
  it('requires reapproval after standards adoption and keeps bindings inactive', async () => {
    const { selection, delivery } = await ready()
    await identify(delivery.id)
    const b = await bind(selection.id)
    const next = await post(body(selection.id, 'STRICT'))
    const status = await request(app.getHttpServer())
      .get('/github/repositories/501/ci-bindings')
      .set('Cookie', 'test.sid=VIEWER')
    expect(status.body.active).toBe(false)
    expect(testRule(await boundAssessment(next.body.id)).deliveryId).toBeNull()
    expect((await bind(next.body.id, [ciBinding], b.body.id)).status).toBe(201)
  })
  it('uses the approved binding atomically during automatic CI processing', async () => {
    const { selection, delivery } = await ready()
    await bind(selection.id)
    await prisma.importedCiEvidence.delete({
      where: { deliveryId: delivery.id },
    })
    await prisma.gitHubWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        state: 'RECEIVED',
        sourceIdentity: {
          kind: 'check_run',
          appId: '123',
          checkName: 'unit tests',
        },
      },
    })
    await new GitHubEventProcessor(prisma).process(delivery.id)
    const snapshot = await prisma.commitAssessment.findFirst({
      where: { requestKey: 'github:' + delivery.id },
    })
    expect(
      (snapshot!.report as any).checks.find(
        (c: any) => c.ruleId === 'tests.required',
      ),
    ).toMatchObject({
      mappingTrust: 'APPROVED_SOURCE_BINDING',
      coverage: 'UNVERIFIED',
    })
    expect((snapshot!.request as any).sourceBindings.selectionId).toBe(
      selection.id,
    )
  })
})

it('rolls back binding adoption when auditing fails', async () => {
  const { selection } = await ready()
  const service = new CiBindingService({
    gitHubRepository: prisma.gitHubRepository,
    $transaction: (cb: any) =>
      prisma.$transaction((tx) =>
        cb(
          new Proxy(tx, {
            get(target, key) {
              return key === 'auditEvent'
                ? {
                    create: async () => {
                      throw new Error('audit unavailable')
                    },
                  }
                : Reflect.get(target, key)
            },
          }),
        ),
      ),
  } as any)
  await expect(
    service.save(
      '501',
      {
        expectedSelectionId: selection.id,
        expectedBindingId: null,
        bindings: [ciBinding as any],
      },
      actorId,
    ),
  ).rejects.toThrow('audit unavailable')
  expect(await prisma.repositoryCiBindings.count()).toBe(0)
})
it('does not borrow an approved source observation from a different SHA', async () => {
  const { selection, delivery } = await ready('b'.repeat(40))
  await identify(delivery.id)
  await bind(selection.id)
  expect(testRule(await boundAssessment(selection.id)).deliveryId).toBeNull()
})
it('prefers the newest workflow attempt without superseding it with a delayed old success', async () => {
  const { selection, delivery } = await ready()
  const identity = { kind: 'workflow_run', workflowId: '7', runAttempt: 1 }
  await prisma.importedCiEvidence.delete({
    where: { deliveryId: delivery.id },
  })
  const old = await prisma.gitHubWebhookDelivery.update({
    where: { id: delivery.id },
    data: {
      event: 'workflow_run',
      sourceIdentity: identity,
      sourceUpdatedAt: new Date(Date.now() + 1000),
    },
  })
  await prisma.importedCiEvidence.create({ data: importCiEvidence(old)! })
  const next = await prisma.gitHubWebhookDelivery.create({
    data: {
      id: randomUUID(),
      event: 'workflow_run',
      action: 'in_progress',
      installationId: 500n,
      repositoryGithubId: 501n,
      sourceSha: 'a'.repeat(40),
      sourceObjectId: old.sourceObjectId,
      sourceStatus: 'in_progress',
      sourceConclusion: null,
      sourceUpdatedAt: new Date(),
      payloadHash: 'e'.repeat(64),
      sourceIdentity: { ...identity, runAttempt: 2 },
      state: 'PROCESSED',
    },
  })
  await prisma.importedCiEvidence.create({ data: importCiEvidence(next)! })
  await bind(selection.id, [
    { ruleId: 'tests.required', kind: 'workflow_run', workflowId: '7' },
  ])
  expect(testRule(await boundAssessment(selection.id))).toMatchObject({
    deliveryId: next.id,
    coverage: 'PENDING',
    superseded: false,
    ambiguous: false,
  })
})

const prContext = (head = 'c'.repeat(40), base = 'a'.repeat(40)) => ({
  version: 1,
  head: { repositoryId: '501', ref: 'feature/one', sha: head },
  base: { repositoryId: '501', ref: 'development', sha: base },
  state: 'open',
  draft: false,
  merged: false,
})
async function prIncoming(context: any = prContext(), action = 'opened') {
  return prisma.gitHubWebhookDelivery.create({
    data: {
      id: randomUUID(),
      event: 'pull_request',
      action,
      installationId: 500n,
      repositoryGithubId: 501n,
      sourceObjectId: '99',
      sourceNumber: 1,
      sourceSha: context?.head?.sha ?? 'c'.repeat(40),
      sourceStatus: context?.state ?? 'open',
      payloadHash: 'f'.repeat(64),
      ...(context ? { pullRequestContext: context } : {}),
    },
  })
}
async function processPr(d: any) {
  await new GitHubEventProcessor(prisma).process(d.id)
  return prisma.commitAssessment.findUnique({
    where: {
      repositoryId_requestKey: {
        repositoryId: (
          await prisma.gitHubRepository.findUniqueOrThrow({
            where: { githubId: 501n },
          })
        ).id,
        requestKey: 'github:' + d.id,
      },
    },
  })
}
describe('PR-triggered exact-head assessments', () => {
  it('creates an incomplete pinned PR snapshot without CI or a head profile', async () => {
    const selection = await post()
    const d = await prIncoming()
    const snapshot = await processPr(d)
    expect(snapshot!.sourceSha).toBe('c'.repeat(40))
    expect(snapshot!.request).toMatchObject({
      subjectKind: 'PULL_REQUEST',
      trigger: 'GITHUB_PR',
      actorId: null,
      sourceDeliveryId: d.id,
      selectionId: selection.body.id,
      baseContext: prContext().base,
      pullRequest: { ...prContext(), number: 1, objectId: '99' },
      profileSnapshot: null,
    })
    expect(snapshot!.report).toMatchObject({
      coverage: 'INCOMPLETE',
      qualityGate: null,
      trustedExecutedChecks: 0,
      currentBranchReadiness: 'NOT_VERIFIED',
      observations: [],
    })
    expect(
      (snapshot!.report as any).checks.find(
        (c: any) => c.ruleId === 'tests.required',
      ).coverage,
    ).toBe('MISSING')
    expect(await prisma.importedCiEvidence.count()).toBe(0)
    expect(
      (snapshot!.report as any).checks.some(
        (c: any) => c.coverage === 'CONFIGURATION_OBSERVED',
      ),
    ).toBe(false)
  })
  it('uses approved CI only from the PR head, not the base or unrelated merge SHA', async () => {
    const { selection, delivery } = await ready('a'.repeat(40))
    await identify(delivery.id)
    await bind(selection.id)
    const merge = await prisma.gitHubWebhookDelivery.create({
      data: {
        id: randomUUID(),
        event: 'check_run',
        action: 'completed',
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceObjectId: '46',
        sourceSha: 'e'.repeat(40),
        sourceStatus: 'completed',
        sourceConclusion: 'success',
        sourceUpdatedAt: new Date(),
        payloadHash: 'e'.repeat(64),
        sourceIdentity: {
          kind: 'check_run',
          appId: '123',
          checkName: 'unit tests',
        },
        state: 'PROCESSED',
      },
    })
    await prisma.importedCiEvidence.create({ data: importCiEvidence(merge)! })
    const d = await prIncoming()
    const without = await processPr(d)
    expect((without!.report as any).observations).toHaveLength(0)
    const ci = await prisma.gitHubWebhookDelivery.create({
      data: {
        id: randomUUID(),
        event: 'check_run',
        action: 'completed',
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceObjectId: '45',
        sourceSha: 'c'.repeat(40),
        sourceStatus: 'completed',
        sourceConclusion: 'failure',
        sourceUpdatedAt: new Date(),
        payloadHash: 'e'.repeat(64),
        sourceIdentity: {
          kind: 'check_run',
          appId: '123',
          checkName: 'unit tests',
        },
        state: 'PROCESSED',
      },
    })
    await prisma.importedCiEvidence.create({ data: importCiEvidence(ci)! })
    const next = await processPr(await prIncoming(prContext(), 'synchronize'))
    expect(
      (next!.report as any).checks.find(
        (c: any) => c.ruleId === 'tests.required',
      ),
    ).toMatchObject({
      deliveryId: ci.id,
      providerResult: 'FAILED',
      mappingTrust: 'APPROVED_SOURCE_BINDING',
      coverage: 'UNVERIFIED',
    })
    expect((await readAssessment(without!.id)).body.assessmentHash).toBe(
      without!.assessmentHash,
    )
  })
  it('preserves delayed old-head and changed-base snapshots without advancing a current pointer', async () => {
    await post()
    const newer = await processPr(
      await prIncoming(prContext('d'.repeat(40)), 'synchronize'),
    )
    const older = await processPr(
      await prIncoming(prContext('c'.repeat(40)), 'synchronize'),
    )
    const rebased = await processPr(
      await prIncoming(prContext('d'.repeat(40), 'e'.repeat(40)), 'edited'),
    )
    expect([newer!.sourceSha, older!.sourceSha, rebased!.sourceSha]).toEqual([
      'd'.repeat(40),
      'c'.repeat(40),
      'd'.repeat(40),
    ])
    expect((rebased!.request as any).baseContext.sha).toBe('e'.repeat(40))
    expect((newer!.request as any).baseContext.sha).toBe('a'.repeat(40))
    expect(await prisma.commitAssessment.count()).toBe(3)
  })
  it('deduplicates concurrent delivery processing and rolls back PR snapshots with failed audit', async () => {
    await post()
    const d = await prIncoming()
    await Promise.all([processPr(d), processPr(d)])
    expect(await prisma.commitAssessment.count()).toBe(1)
    const next = await prIncoming(prContext('d'.repeat(40)))
    const broken = {
      $transaction: (cb: any) =>
        prisma.$transaction((tx) =>
          cb(
            new Proxy(tx, {
              get(target, key) {
                return key === 'auditEvent'
                  ? {
                      findMany: tx.auditEvent.findMany.bind(tx.auditEvent),
                      create: async () => {
                        throw new Error('audit unavailable')
                      },
                    }
                  : Reflect.get(target, key)
              },
            }),
          ),
        ),
    } as any
    await expect(
      new GitHubEventProcessor(broken).process(next.id),
    ).rejects.toThrow('audit unavailable')
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: next.id },
        })
      ).state,
    ).toBe('RECEIVED')
    expect(await prisma.commitAssessment.count()).toBe(1)
    await processPr(next)
    expect(await prisma.commitAssessment.count()).toBe(2)
  })
  it('records explicit reasons for forked, closed and missing or inconsistent contexts', async () => {
    await post()
    const cases: [any, string, string][] = [
      [
        { ...prContext(), head: { ...prContext().head, repositoryId: '999' } },
        'opened',
        'fork_head_not_supported',
      ],
      [
        { ...prContext(), state: 'closed', merged: true },
        'closed',
        'pr_not_open',
      ],
      [null, 'opened', 'pr_context_unavailable'],
      [
        { ...prContext(), base: { ...prContext().base, repositoryId: '999' } },
        'opened',
        'pr_context_unavailable',
      ],
    ]
    for (const [ctx, action, reason] of cases) {
      const d = await prIncoming(ctx, action)
      expect(await processPr(d)).toBeNull()
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: {
          event: 'github_event_processed',
          metadata: { path: ['deliveryId'], equals: d.id },
        },
      })
      expect(audit.metadata).toMatchObject({
        assessmentReason: reason,
        assessmentId: null,
      })
    }
    expect(await prisma.commitAssessment.count()).toBe(0)
  })
  it('requires adoption and active available repository access', async () => {
    expect(await processPr(await prIncoming())).toBeNull()
    await post()
    await prisma.gitHubRepository.updateMany({ data: { available: false } })
    const d = await prIncoming()
    expect(await processPr(d)).toBeNull()
    expect(
      (
        await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id: d.id },
        })
      ).state,
    ).toBe('IGNORED')
  })
  it('preserves draft status and the selection adopted at processing time', async () => {
    const first = await post()
    const d = await prIncoming({ ...prContext(), draft: true })
    const next = await post(body(first.body.id, 'STRICT'))
    const snapshot = await processPr(d)
    expect(snapshot!.request).toMatchObject({
      selectionId: next.body.id,
      pullRequest: { draft: true },
    })
  })
})

const currentPr = () =>
  request(app.getHttpServer())
    .get('/github/repositories/501/pull-requests/1')
    .set('Cookie', 'test.sid=VIEWER')
async function tracked(
  context: any = prContext(),
  at = new Date(),
  action = 'opened',
) {
  const d = await prIncoming(context, action)
  await prisma.gitHubWebhookDelivery.update({
    where: { id: d.id },
    data: { sourceUpdatedAt: at },
  })
  await processPr(d)
  return prisma.repositoryPullRequest.findFirstOrThrow()
}
async function verifyPr(context: any = prContext(), provider?: any) {
  const row = await prisma.repositoryPullRequest.findFirstOrThrow()
  await new GitHubPrSyncService(
    prisma,
    provider ??
      ({
        readPullRequest: async () => ({
          context,
          sourceObjectId: row.objectId,
          sourceUpdatedAt: new Date(),
        }),
      } as any),
  ).sync(row.id)
  return prisma.repositoryPullRequest.findUniqueOrThrow({
    where: { id: row.id },
  })
}
describe('current PR state and exact-head CI links', () => {
  it('keeps newer provider timestamps and blocks equal-time conflicts', async () => {
    await post()
    const now = new Date()
    const first = await tracked(prContext('d'.repeat(40)), now)
    await tracked(
      prContext('c'.repeat(40)),
      new Date(now.getTime() - 1000),
      'synchronize',
    )
    expect(
      (await prisma.repositoryPullRequest.findFirstOrThrow()).revision,
    ).toBe(first.revision)
    expect((await currentPr()).body.reason).toBe('CURRENT_STATE_UNVERIFIED')
    const verified = await verifyPr(prContext('d'.repeat(40)))
    await tracked(
      prContext('e'.repeat(40)),
      verified.sourceUpdatedAt!,
      'synchronize',
    )
    expect(
      (await prisma.repositoryPullRequest.findFirstOrThrow()).syncState,
    ).toBe('CONFLICTED')
    expect((await currentPr()).body.ciAssessment).toBeNull()
  })
  it('links later exact-head CI and invalidates policy, head, base and binding changes', async () => {
    const selection = await post()
    const b = await bind(selection.body.id)
    await tracked()
    await verifyPr()
    const pr = (await currentPr()).body
    expect(pr.prAssessment.id).toBeTruthy()
    const ci = await prisma.gitHubWebhookDelivery.create({
      data: {
        id: randomUUID(),
        event: 'check_run',
        action: 'completed',
        installationId: 500n,
        repositoryGithubId: 501n,
        sourceObjectId: '42',
        sourceSha: 'c'.repeat(40),
        sourceStatus: 'completed',
        sourceConclusion: 'success',
        sourceUpdatedAt: new Date(),
        payloadHash: 'e'.repeat(64),
      },
    })
    await new GitHubEventProcessor(prisma).process(ci.id)
    const linked = (await currentPr()).body
    expect(linked.ciAssessment.id).toBeTruthy()
    expect(linked.prAssessment.id).toBe(pr.prAssessment.id)
    expect(linked).toMatchObject({
      reason: 'EXECUTION_NOT_VERIFIED',
      qualityGate: null,
      readiness: 'NOT_EVALUATED',
    })
    await verifyPr(prContext('d'.repeat(40)))
    expect((await currentPr()).body).toMatchObject({
      ciAssessment: null,
      prAssessment: null,
    })
    await verifyPr(prContext('c'.repeat(40), 'b'.repeat(40)))
    expect((await currentPr()).body.prAssessment).toBeNull()
    await verifyPr()
    await bind(selection.body.id, [], b.body.id)
    expect((await currentPr()).body).toMatchObject({
      ciAssessment: null,
      prAssessment: null,
    })
    expect((await readAssessment(pr.prAssessment.id)).status).toBe(200)
    await post(body(selection.body.id, 'STRICT'))
    expect((await currentPr()).body.reason).toBe('NO_APPLICABLE_ASSESSMENT')
  })
  it('hides links for closed/forked state and expired or failed verification', async () => {
    await post()
    await tracked()
    await verifyPr({ ...prContext(), state: 'closed', merged: true })
    expect((await currentPr()).body.reason).toBe('PR_CLOSED')
    await verifyPr({
      ...prContext(),
      head: { ...prContext().head, repositoryId: '999' },
    })
    expect((await currentPr()).body.reason).toBe('FORK_HEAD_UNSUPPORTED')
    await verifyPr()
    await prisma.repositoryPullRequest.updateMany({
      data: { verifiedAt: new Date(Date.now() - 300001) },
    })
    expect((await currentPr()).body.verification).toBe('UNVERIFIED')
    await verifyPr(undefined, {
      readPullRequest: async () => {
        throw new Error('rate limited')
      },
    })
    expect((await currentPr()).body).toMatchObject({
      verification: 'UNVERIFIED',
      ciAssessment: null,
    })
    expect(
      (await prisma.repositoryPullRequest.findFirstOrThrow()).syncState,
    ).toBe('ERROR')
  })
  it('cannot overwrite a newer webhook or restore revoked access from in-flight provider data', async () => {
    await post()
    await tracked()
    await verifyPr(undefined, {
      readPullRequest: async () => {
        await tracked(
          prContext('d'.repeat(40)),
          new Date(Date.now() + 1000),
          'synchronize',
        )
        return {
          context: prContext(),
          sourceObjectId: '99',
          sourceUpdatedAt: new Date(),
        }
      },
    })
    expect(
      (await prisma.repositoryPullRequest.findFirstOrThrow()).context,
    ).toMatchObject({ head: { sha: 'd'.repeat(40) } })
    expect((await currentPr()).body.verification).toBe('UNVERIFIED')
    await verifyPr(prContext('d'.repeat(40)))
    await prisma.gitHubInstallation.updateMany({
      data: { accessRevision: { increment: 1 } },
    })
    expect((await currentPr()).body.verification).toBe('UNVERIFIED')
    await verifyPr(undefined, {
      readPullRequest: async () => {
        await prisma.gitHubInstallation.updateMany({
          data: { active: false, accessRevision: { increment: 1 } },
        })
        return {
          context: prContext(),
          sourceObjectId: '99',
          sourceUpdatedAt: new Date(),
        }
      },
    })
    expect((await currentPr()).status).toBe(403)
  })
  it('requires session and repository access and serves local list metadata', async () => {
    await tracked()
    expect(
      (
        await request(app.getHttpServer()).get(
          '/github/repositories/501/pull-requests',
        )
      ).status,
    ).toBe(401)
    const list = await request(app.getHttpServer())
      .get('/github/repositories/501/pull-requests')
      .set('Cookie', 'test.sid=VIEWER')
    expect(list.status).toBe(200)
    expect(list.headers['cache-control']).toBe('no-store')
    expect(list.body.pullRequests[0].verification).toBe('UNVERIFIED')
    expect(
      (
        await request(app.getHttpServer())
          .get('/github/repositories/501/pull-requests/0')
          .set('Cookie', 'test.sid=VIEWER')
      ).status,
    ).toBe(404)
    await prisma.gitHubRepository.updateMany({ data: { selected: false } })
    expect((await currentPr()).status).toBe(403)
  })
  it('repairs missing webhook events periodically without calling GitHub on reload', async () => {
    await post()
    await tracked()
    let calls = 0
    const sync = new GitHubPrSyncService(prisma, {
      readPullRequest: async () => {
        calls++
        return {
          context: { ...prContext(), state: 'closed', merged: true },
          sourceObjectId: '99',
          sourceUpdatedAt: new Date(),
        }
      },
    } as any)
    await sync.reconcile()
    await sync.reconcile()
    await currentPr()
    await currentPr()
    expect(calls).toBe(1)
    expect((await currentPr()).body.reason).toBe('PR_CLOSED')
  })
})

it('withholds links when state changes during a read and rejects matching tampered assessments', async () => {
  await post()
  await tracked()
  await verifyPr()
  const wrapper = new Proxy(prisma, {
    get(target, key) {
      if (key === 'commitAssessment')
        return {
          findMany: async (args: any) => {
            const rows = await target.commitAssessment.findMany(args)
            await target.repositoryPullRequest.updateMany({
              data: {
                revision: { increment: 1 },
                verifiedAt: null,
                syncState: 'PENDING',
              },
            })
            return rows
          },
        }
      return Reflect.get(target, key)
    },
  })
  expect(await new PullRequestService(wrapper).get('501', '1')).toMatchObject({
    reason: 'CONTEXT_CHANGED',
    prAssessment: null,
    ciAssessment: null,
  })
  await verifyPr()
  const linked = (await currentPr()).body
  await prisma.commitAssessment.update({
    where: { id: linked.prAssessment.id },
    data: { report: { qualityGate: 'PASS' } },
  })
  expect((await currentPr()).status).toBe(409)
})

it('freezes fail-closed evidence validation and exposes no report content', async () => {
  const { selection, delivery } = await ready()
  await identify(delivery.id)
  await bind(selection.id)
  const content = '<testsuite><testcase name="secret-report-name"/></testsuite>'
  const sha256 = createHash('sha256').update(content).digest('hex')
  const artifact = await prisma.ciArtifactImport.create({
    data: {
      deliveryId: delivery.id,
      format: 'junit',
      sha256,
      content: Buffer.from(content),
      summary: parseArtifact('junit', content, sha256).summary,
      uploadedById: actorId,
    },
  })
  const response = await boundAssessment(selection.id)
  expect(response.status).toBe(201)
  expect(testRule(response).evidenceValidation).toMatchObject({
    status: 'INCOMPLETE',
    trustedExecuted: false,
    sourceApproved: true,
    observationIntegrity: true,
    reports: [
      { artifactId: artifact.id, integrity: 'VALID', executedTests: 1 },
    ],
  })
  expect(JSON.stringify(response.body)).not.toContain('secret-report-name')
  await prisma.ciArtifactImport.update({
    where: { id: artifact.id },
    data: { content: Buffer.from('tampered') },
  })
  const later = await boundAssessment(selection.id)
  expect(testRule(later)).toMatchObject({
    coverage: 'INVALID',
    evidenceValidation: { status: 'INVALID', trustedExecuted: false },
  })
  expect(
    (await readAssessment(response.body.assessment.id)).body.assessmentHash,
  ).toBe(response.body.assessment.assessmentHash)
})
it('detects changed imported observation metadata and never trusts failed or missing proofs', async () => {
  const { selection, delivery } = await ready()
  await identify(delivery.id)
  await bind(selection.id)
  await prisma.importedCiEvidence.update({
    where: { deliveryId: delivery.id },
    data: { sourceObjectId: 'forged' },
  })
  const response = await boundAssessment(selection.id)
  expect(testRule(response).evidenceValidation.reasons).toContain(
    'CI_OBSERVATION_INTEGRITY_INVALID',
  )
  expect(response.body.assessment.report).toMatchObject({
    trustedExecutedChecks: 0,
    qualityGate: null,
  })
})
it('bounds original artifact validation and freezes truncation without trusted outcomes', async () => {
  const { selection, delivery } = await ready()
  // Deliberately simulate legacy/out-of-band rows beyond the upload quota.
  for (let i = 0; i < 33; i++) {
    const content = `<testsuite><testcase name="test-${i}"/></testsuite>`
    const sha256 = createHash('sha256').update(content).digest('hex')
    await prisma.ciArtifactImport.create({
      data: {
        deliveryId: delivery.id,
        format: 'junit',
        sha256,
        content: Buffer.from(content),
        summary: parseArtifact('junit', content, sha256).summary,
        uploadedById: actorId,
      },
    })
  }
  const response = await create(assessmentBody(selection.id, delivery.id))
  expect(response.status).toBe(201)
  const check = testRule(response)
  expect(check.evidenceValidation.reports).toHaveLength(32)
  expect(check.evidenceValidation.reasons).toContain(
    'VALIDATION_COLLECTION_TRUNCATED',
  )
  expect(response.body.assessment.report).toMatchObject({
    validationCollectionTruncated: true,
    trustedExecutedChecks: 0,
    qualityGate: null,
  })
})

async function provenanceFixture() {
  const { selection, delivery } = await ready()
  await prisma.gitHubWebhookDelivery.update({
    where: { id: delivery.id },
    data: { event: 'workflow_run' },
  })
  await identify(delivery.id, {
    kind: 'workflow_run',
    workflowId: '7',
    runAttempt: 1,
  })
  await bind(selection.id, [
    { ruleId: 'tests.required', kind: 'workflow_run', workflowId: '7' },
  ])
  const content = '<testsuite><testcase name="test"/></testsuite>'
  const sha256 = createHash('sha256').update(content).digest('hex')
  const artifact = await prisma.ciArtifactImport.create({
    data: {
      deliveryId: delivery.id,
      format: 'junit',
      sha256,
      content: Buffer.from(content),
      summary: parseArtifact('junit', content, sha256).summary,
      uploadedById: actorId,
    },
  })
  for (const [key, value] of Object.entries({
    CI_ATTESTATION_GH_PATH: '/tmp/gh',
    CI_ATTESTATION_GH_SHA256: 'e'.repeat(64),
    CI_ATTESTATION_ROOT_PATH: '/tmp/root',
    CI_ATTESTATION_ROOT_SHA256: 'f'.repeat(64),
    CI_ATTESTATION_WORKFLOWS: '["fixture/app/.github/workflows/ci.yml"]',
  }))
    vi.stubEnv(key, value)
  verifyProof.mockImplementation(async (_content, _bundle, context) => ({
    claims: {
      ...context,
      issuer: 'https://token.actions.githubusercontent.com',
      signerUri:
        'https://github.com/fixture/app/.github/workflows/ci.yml@refs/heads/main',
      signerDigest: 'c'.repeat(40),
      runnerEnvironment: 'github-hosted',
      predicateType: 'https://slsa.dev/provenance/v1',
    },
    policyDigest: attestationPolicy()!.digest,
  }))
  const path = `/github/repositories/501/ci-evidence/${delivery.id}/artifacts/${artifact.id}/provenance`
  const proof = (
    role = 'OWNER',
    origin = 'http://localhost:5173',
    value: object = {
      bundle: '{}',
      signerWorkflow: 'fixture/app/.github/workflows/ci.yml',
    },
  ) =>
    request(app.getHttpServer())
      .post(path)
      .set('Cookie', 'test.sid=' + role)
      .set('Origin', origin)
      .send(value)
  return { selection, artifact, delivery, proof, path }
}
it('verifies provenance separately, freezes it in new assessments and preserves older reports', async () => {
  const f = await provenanceFixture()
  const old = await boundAssessment(f.selection.id)
  const response = await f.proof()
  expect(response.status).toBe(201)
  expect(response.body).toMatchObject({
    duplicate: false,
    executionTrusted: false,
    provenance: { status: 'VERIFIED_ATTESTATION', runId: '44', runAttempt: 1 },
  })
  expect((await f.proof()).body.duplicate).toBe(true)
  expect(await prisma.ciArtifactAttestation.count()).toBe(1)
  expect(
    await prisma.auditEvent.count({
      where: { event: 'ci.artifact.provenance.verified' },
    }),
  ).toBe(1)
  expect(
    (
      await prisma.ciArtifactImport.findUniqueOrThrow({
        where: { id: f.artifact.id },
      })
    ).verification,
  ).toBe('ADMIN_ASSOCIATED_UNVERIFIED')
  const later = await boundAssessment(f.selection.id)
  const validation = testRule(later).evidenceValidation
  expect(validation).toMatchObject({
    trustedExecuted: false,
    status: 'INCOMPLETE',
    reports: [{ provenance: { status: 'VERIFIED_ATTESTATION' } }],
  })
  expect(validation.reasons).not.toContain('REPORT_PROVENANCE_UNVERIFIED')
  expect(validation.reasons).toContain('RULE_COVERAGE_UNVERIFIED')
  expect(
    (await readAssessment(old.body.assessment.id)).body.assessmentHash,
  ).toBe(old.body.assessment.assessmentHash)
  const read = await request(app.getHttpServer())
    .get(f.path)
    .set('Cookie', 'test.sid=VIEWER')
  expect(read.status).toBe(200)
  expect(read.body.provenance.status).toBe('VERIFIED_ATTESTATION')
  expect(read.body).not.toHaveProperty('bundle')
  vi.stubEnv(
    'CI_ATTESTATION_WORKFLOWS',
    '["fixture/app/.github/workflows/other.yml"]',
  )
  expect(
    testRule(await boundAssessment(f.selection.id)).evidenceValidation.reasons,
  ).toContain('REPORT_PROVENANCE_UNVERIFIED')
})
it('enforces proof roles, origin, body limits, source binding and repository revocation', async () => {
  const f = await provenanceFixture()
  expect((await f.proof('VIEWER')).status).toBe(403)
  expect((await f.proof('OWNER', 'https://evil.example')).status).toBe(403)
  expect(
    (
      await f.proof('OWNER', undefined, {
        bundle: 'bad',
        signerWorkflow: 'fixture/app/.github/workflows/ci.yml',
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await f.proof('OWNER', undefined, {
        bundle: '{}',
        signerWorkflow: 'fork/app/.github/workflows/ci.yml',
      })
    ).status,
  ).toBe(400)
  await bind(
    f.selection.id,
    [],
    (
      await prisma.repositoryCiBindings.findFirstOrThrow({
        orderBy: { revision: 'desc' },
      })
    ).id,
  )
  expect((await f.proof()).status).toBe(409)
  expect(verifyProof).not.toHaveBeenCalled()
  await prisma.gitHubRepository.updateMany({ data: { selected: false } })
  expect((await f.proof()).status).toBe(403)
})
it('rechecks access after cryptographic verification and leaves no partial receipt', async () => {
  const f = await provenanceFixture()
  const original = verifyProof.getMockImplementation()!
  verifyProof.mockImplementation(async (...args) => {
    const proof = await original(...args)
    await prisma.gitHubInstallation.updateMany({ data: { active: false } })
    return proof
  })
  expect((await f.proof()).status).toBe(403)
  expect(await prisma.ciArtifactAttestation.count()).toBe(0)
})
it('rejects corrupt stored proof bytes and returns unverified provenance in new reports', async () => {
  const f = await provenanceFixture()
  expect((await f.proof()).status).toBe(201)
  await prisma.ciArtifactAttestation.updateMany({
    data: { bundle: Buffer.from('changed') },
  })
  expect(
    (
      await request(app.getHttpServer())
        .get(f.path)
        .set('Cookie', 'test.sid=VIEWER')
    ).body.provenance,
  ).toBeNull()
  expect(
    testRule(await boundAssessment(f.selection.id)).evidenceValidation.reasons,
  ).toContain('REPORT_PROVENANCE_UNVERIFIED')
})
it('rolls back receipt insertion when its audit fails', async () => {
  const f = await provenanceFixture()
  const wrapper = new Proxy(prisma, {
    get(target, key) {
      if (key === '$transaction')
        return (fn: any) =>
          target.$transaction((tx: any) =>
            fn(
              new Proxy(tx, {
                get(t, k) {
                  if (k === 'auditEvent')
                    return {
                      create: async () => {
                        throw Error('audit failed')
                      },
                    }
                  return Reflect.get(t, k)
                },
              }),
            ),
          )
      return Reflect.get(target, key)
    },
  })
  await expect(
    new CiAttestationService(wrapper, { verify: verifyProof } as any).verify(
      '501',
      f.delivery.id,
      f.artifact.id,
      { bundle: '{}', signerWorkflow: 'fixture/app/.github/workflows/ci.yml' },
      actorId,
    ),
  ).rejects.toThrow('audit failed')
  expect(await prisma.ciArtifactAttestation.count()).toBe(0)
})
it('caps historical proof policies per report without changing the upload', async () => {
  const f = await provenanceFixture()
  for (let i = 0; i < 5; i++) {
    vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', String(i).repeat(64))
    expect((await f.proof()).status).toBe(201)
  }
  vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', '9'.repeat(64))
  expect((await f.proof()).status).toBe(429)
  expect(await prisma.ciArtifactAttestation.count()).toBe(5)
})
it('fails before verification for unsupported check sources, absent attempts and oversized bundles', async () => {
  const f = await provenanceFixture()
  expect(
    (
      await f.proof('OWNER', undefined, {
        signerWorkflow: 'fixture/app/.github/workflows/ci.yml',
        bundle: 'x'.repeat(524289),
      })
    ).status,
  ).toBeGreaterThanOrEqual(400)
  const d = await prisma.gitHubWebhookDelivery.update({
    where: { id: f.delivery.id },
    data: {
      event: 'check_run',
      sourceIdentity: { kind: 'check_run', appId: '1', checkName: 'test' },
    },
  })
  await prisma.importedCiEvidence.update({
    where: { deliveryId: d.id },
    data: importCiEvidence(d)!,
  })
  expect((await f.proof()).status).toBe(400)
  const w = await prisma.gitHubWebhookDelivery.update({
    where: { id: d.id },
    data: {
      event: 'workflow_run',
      sourceIdentity: { kind: 'workflow_run', workflowId: '7' },
    },
  })
  await prisma.importedCiEvidence.update({
    where: { deliveryId: d.id },
    data: importCiEvidence(w)!,
  })
  expect((await f.proof()).status).toBe(400)
  expect(verifyProof).not.toHaveBeenCalled()
})


describe('historical gate preview API', () => {
  it('uses integrity-checked exact-revision policy and preserves the immutable snapshot', async () => {
    const {selection,delivery}=await ready()
    const created=await create(assessmentBody(selection.id,delivery.id))
    expect(created.status).toBe(201)
    const path=`/github/repositories/501/assessments/${created.body.assessment.id}/gate-preview`
    const preview=await request(app.getHttpServer()).get(path).set('Cookie','test.sid=VIEWER').expect(200)
    expect(preview.body).toMatchObject({status:'INCOMPLETE',publication:'DISABLED',sourceSha:'a'.repeat(40)})
    expect((await readAssessment(created.body.assessment.id)).body.assessmentHash).toBe(created.body.assessment.assessmentHash)
    await request(app.getHttpServer()).get(path).expect(401)
    await request(app.getHttpServer()).get(path.replace('/501/','/999/')).set('Cookie','test.sid=VIEWER').expect(403)
    await prisma.commitAssessment.update({where:{id:created.body.assessment.id},data:{report:{qualityGate:'PASS'}}})
    await request(app.getHttpServer()).get(path).set('Cookie','test.sid=VIEWER').expect(409)
  })
})

it('blocks a signed failed approved CI source through the scoped historical gate API', async () => {
  const { selection, delivery } = await ready()
  await prisma.importedCiEvidence.delete({ where: { deliveryId: delivery.id } })
  const failed = await prisma.gitHubWebhookDelivery.update({
    where: { id: delivery.id },
    data: {sourceConclusion: 'failure', sourceIdentity: {kind: 'check_run', appId: '123', checkName: 'unit tests'}},
  })
  await prisma.importedCiEvidence.create({data: importCiEvidence(failed)!})
  await bind(selection.id).expect(201)
  const created = await boundAssessment(selection.id).expect(201)
  const preview = await request(app.getHttpServer())
    .get(`/github/repositories/501/assessments/${created.body.assessment.id}/gate-preview`)
    .set('Cookie', 'test.sid=VIEWER').expect(200)
  expect(preview.body).toMatchObject({status: 'BLOCK', publication: 'DISABLED', requiredRulesBlocked: 1})
  expect(preview.body.rules.find((r: any) => r.ruleId === 'tests.required')).toMatchObject({
    status: 'BLOCK', reasons: expect.arrayContaining(['APPROVED_CI_SOURCE_FAILED']),
  })
  // The immutable snapshot remains evidence, not a current branch decision.
  expect((await readAssessment(created.body.assessment.id)).body.report.qualityGate).toBeNull()
})
