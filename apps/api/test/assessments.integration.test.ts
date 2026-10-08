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
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard, OwnerAdminGuard } from '../src/auth/session.guard.js'
import { StandardsController } from '../src/standards/standards.controller.js'
import { StandardsService } from '../src/standards/standards.service.js'
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
  prisma = new PrismaService()
  await prisma.$connect()
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [StandardsController, AssessmentController],
      providers: [
        StandardsService,
        AssessmentService,
        SessionGuard,
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
                ? { authenticated: true, identityId: actorId, role: token }
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
  await app?.close()
  await prisma?.$disconnect()
})
beforeEach(async () => {
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
  await prisma.gitHubInstallation.create({
    data: {
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
    ).toMatchObject({ coverage: 'UNVERIFIED', providerResult: 'SUCCEEDED' })
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
  it('imports evidence without a snapshot when standards are not adopted and ignores PR-only events', async () => {
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
      await prisma.importedCiEvidence.create({ data: importCiEvidence(newer)! })
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
