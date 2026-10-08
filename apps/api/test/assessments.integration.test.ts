import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { AssessmentController } from '../src/assessments/assessment.controller.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { digest } from '../src/assessments/assessment-plan.js'
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
