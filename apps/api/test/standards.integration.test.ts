import 'reflect-metadata'
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
      controllers: [StandardsController],
      providers: [
        StandardsService,
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
describe('standards assignment and access', () => {
  it('requires a session for the catalogue and exposes repository-specific recommendations without a gate', async () => {
    expect(
      (await request(app.getHttpServer()).get('/standards/catalogue')).status,
    ).toBe(401)
    const result = await get()
    expect(result.status).toBe(200)
    expect(result.body.catalogue).toHaveLength(5)
    expect(result.body.selection).toBeNull()
    expect(result.body.qualityGate).toBeNull()
    expect(
      result.body.recommendations.map((r: { id: string }) => r.id),
    ).toContain('backend-service')
    expect(
      result.body.controls.find(
        (r: { id: string }) => r.id === 'ci.configured',
      ),
    ).toMatchObject({ configuration: 'MISSING', assessmentResult: null })
  })
  it('requires admin roles, exact origin and selected/active repository for changes', async () => {
    expect((await post(body(), 'invalid')).status).toBe(401)
    expect((await post(body(), 'VIEWER')).status).toBe(403)
    expect(
      (await post(body(), 'OWNER', 'https://attacker.example')).status,
    ).toBe(403)
    expect(
      (await post(body(), 'OWNER', 'http://localhost:5173', '502')).status,
    ).toBe(403)
    const saved = await post(body(), 'SUPER_ADMIN')
    expect(saved.status).toBe(201)
    await prisma.gitHubRepository.update({
      where: { githubId: 501n },
      data: { selected: false },
    })
    expect((await get()).status).toBe(403)
    expect((await post(body(saved.body.id))).status).toBe(403)
    await prisma.gitHubRepository.update({
      where: { githubId: 501n },
      data: { selected: true },
    })
    await prisma.gitHubInstallation.update({
      where: { id: 500n },
      data: { active: false },
    })
    expect((await get()).status).toBe(403)
    expect((await post(body(saved.body.id))).status).toBe(403)
  })
  it('saves immutable pack digests and selection history with audit and prevents stale concurrent overwrites', async () => {
    const results = await Promise.all([post(), post()])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    const first = results.find((r) => r.status === 201)!.body
    expect(first).toMatchObject({
      revision: 1,
      profile: 'RECOMMENDED',
      sourceSha: 'a'.repeat(40),
    })
    expect(first.packs[0].digest).toMatch(/^[a-f0-9]{64}$/)
    const second = await post(body(first.id, 'STRICT'), 'ADMIN')
    expect(second.status).toBe(201)
    expect(second.body.revision).toBe(2)
    expect(
      (
        await prisma.repositoryStandardsSelection.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).profile,
    ).toBe('RECOMMENDED')
    expect(
      await prisma.auditEvent.count({
        where: { event: 'standards.selection.assigned' },
      }),
    ).toBe(2)
    expect((await get()).body.selection.id).toBe(second.body.id)
  })
  it('rejects unknown versions, duplicate packs, unsafe fields and missing concurrency token without writes', async () => {
    for (const value of [
      { ...body(), packs: [{ id: 'baseline-engineering', version: '99' }] },
      { ...body(), packs: [...body().packs, ...body().packs] },
      { ...body(), enforcement: 'enforce' },
      { profile: 'STRICT', packs: body().packs },
      { ...body(), packs: [] },
      { ...body(), packs: [{ ...body().packs[0], digest: 'forged' }] },
    ])
      expect((await post(value)).status).toBe(400)
    expect(await prisma.repositoryStandardsSelection.count()).toBe(0)
  })
  it('marks absent profiles unknown and refuses to interpret mismatched adopted digests', async () => {
    await prisma.repositoryProfile.deleteMany()
    const empty = await get()
    expect(empty.body.profileSnapshot).toBeNull()
    expect(
      empty.body.controls.every(
        (r: { configuration: string }) => r.configuration === 'UNKNOWN',
      ),
    ).toBe(true)
    const saved = await post()
    await prisma.repositoryStandardsSelection.update({
      where: { id: saved.body.id },
      data: {
        packs: [
          {
            id: 'baseline-engineering',
            version: '1.0.0',
            digest: 'mismatched',
          },
        ],
      },
    })
    const mismatch = await get()
    expect(mismatch.body.selectionIntegrity).toBe(false)
    expect(mismatch.body.controls).toEqual([])
    expect(mismatch.body.qualityGate).toBeNull()
  })
  it('preserves selection when audit storage fails and never upgrades it on profile refresh', async () => {
    const repo = await prisma.gitHubRepository.findUniqueOrThrow({
      where: { githubId: 501n },
    })
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
      new StandardsService(broken).assign('501', body() as any, actorId),
    ).rejects.toThrow('storage unavailable')
    expect(await prisma.repositoryStandardsSelection.count()).toBe(0)
    const saved = await post()
    await prisma.repositoryProfile.create({
      data: {
        repositoryId: repo.id,
        sourceSha: 'd'.repeat(40),
        treeSha: 'e'.repeat(40),
        branch: 'main',
        fullName: 'fixture/app',
        version: 1,
        complete: false,
        report: { signals: [] },
      },
    })
    const current = await get()
    expect(current.body.selection.sourceSha).toBe('a'.repeat(40))
    expect(current.body.profileSnapshot.sourceSha).toBe('d'.repeat(40))
    expect(current.body.selection.id).toBe(saved.body.id)
    expect(
      current.body.controls.every(
        (r: { assessmentResult: unknown }) => r.assessmentResult === null,
      ),
    ).toBe(true)
  })
})
