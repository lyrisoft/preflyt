import { AuthorizationService } from '../src/auth/authorization.service.js'
import 'reflect-metadata'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { RepositoryProfileService } from '../src/github/repository-profile.service.js'
import { RepositoryProfileController } from '../src/github/repository-profile.controller.js'
import { SessionGuard, OwnerAdminGuard } from '../src/auth/session.guard.js'
import { ForbiddenException } from '@nestjs/common'
import type { RepositorySnapshot } from '../src/github/repository-profile.js'

let app: INestApplication
let prisma: PrismaService
let actorId: string
const snapshot = (): RepositorySnapshot => ({
  sourceSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  branch: 'main',
  fullName: 'fixture/app',
  complete: true,
  warnings: [],
  files: [{ path: 'src/main.ts', sha: 'c'.repeat(40), size: 1 }],
})
const provider = {
  verifyRepositoryAccess: vi.fn(),
  readRepositorySnapshot: vi.fn(),
}
const owner = (method: 'get' | 'post') =>
  request(app.getHttpServer())
    [method]('/github/repositories/501/profile')
    .set('Cookie', 'test.sid=OWNER')
    .set('Origin', 'http://localhost:5173')

beforeAll(async () => {
  prisma = new PrismaService()
  await prisma.$connect()
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [RepositoryProfileController],
      providers: [
        RepositoryProfileService,
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
        { provide: GitHubProviderService, useValue: provider },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: 'test.sid',
            currentSession: async (token?: string) =>
              ['OWNER', 'VIEWER'].includes(token ?? '')
                ? {
                    authenticated: true,
                    identityId: actorId,
                    subject: token,
                    email: null,
                    role: token,
                  }
                : { authenticated: false },
          },
        },
      ],
    },
    { logger: false },
  )
  app.use(cookieParser())
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
  const identity = await prisma.identity.create({
    data: { issuer: 'fixture', subject: 'profile-owner' },
  })
  actorId = identity.id
  await prisma.gitHubInstallation.create({
    data: {
      id: 500n,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: { contents: 'read' },
      connectedById: actorId,
    },
  })
  await prisma.gitHubRepository.create({
    data: {
      githubId: 501n,
      installationId: 500n,
      name: 'app',
      fullName: 'fixture/app',
      ownerLogin: 'fixture',
      defaultBranch: 'main',
      isPrivate: true,
      selected: true,
    },
  })
  provider.verifyRepositoryAccess
    .mockReset()
    .mockResolvedValue({ fullName: 'fixture/app', branch: 'main' })
  provider.readRepositorySnapshot.mockReset().mockResolvedValue(snapshot())
})

describe('profile HTTP authorization and persistence', () => {
  it('requires a session, selected repository, admin write permission and valid origin', async () => {
    await request(app.getHttpServer())
      .get('/github/repositories/501/profile')
      .expect(401)
    await request(app.getHttpServer())
      .post('/github/repositories/501/profile')
      .set('Cookie', 'test.sid=VIEWER')
      .set('Origin', 'http://localhost:5173')
      .expect(403)
    await request(app.getHttpServer())
      .post('/github/repositories/501/profile')
      .set('Cookie', 'test.sid=OWNER')
      .set('Origin', 'https://attacker.example')
      .expect(403)
    await prisma.gitHubRepository.update({
      where: { githubId: 501n },
      data: { selected: false },
    })
    await owner('get').expect(403)
    expect(provider.readRepositorySnapshot).not.toHaveBeenCalled()
  })
  it('saves pinned revision evidence and audit history and lets viewers inspect it', async () => {
    const saved = await owner('post').expect(201)
    expect(saved.body.profile).toMatchObject({
      sourceSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      branch: 'main',
      version: 1,
    })
    const viewed = await request(app.getHttpServer())
      .get('/github/repositories/501/profile')
      .set('Cookie', 'test.sid=VIEWER')
      .expect(200)
    expect(viewed.body.profile.id).toBe(saved.body.profile.id)
    expect(
      await prisma.auditEvent.count({
        where: { event: 'repository_profile_discovered' },
      }),
    ).toBe(1)
    provider.readRepositorySnapshot.mockResolvedValueOnce({
      ...snapshot(),
      sourceSha: 'd'.repeat(40),
    })
    await owner('post').expect(201)
    expect(await prisma.repositoryProfile.count()).toBe(2)
    expect((await owner('get').expect(200)).body.profile.sourceSha).toBe(
      'd'.repeat(40),
    )
  })
  it('returns saved metadata without upstream calls even when GitHub is unavailable', async () => {
    provider.verifyRepositoryAccess.mockRejectedValue(
      new Error('GitHub offline'),
    )
    const loaded = await owner('get')
    expect(loaded.status).toBe(200)
    expect(loaded.body.repository.fullName).toBe('fixture/app')
    expect(loaded.body).toHaveProperty('sync')
    expect(provider.verifyRepositoryAccess).not.toHaveBeenCalled()
    expect(provider.readRepositorySnapshot).not.toHaveBeenCalled()
    await prisma.gitHubRepository.updateMany({ data: { selected: false } })
    expect((await owner('get')).status).toBe(403)
  })
  it('preserves earlier snapshots on failure and refuses cached evidence after revocation', async () => {
    await owner('post').expect(201)
    provider.readRepositorySnapshot.mockRejectedValueOnce(
      new Error('upstream down'),
    )
    await owner('post').expect(503)
    expect(await prisma.repositoryProfile.count()).toBe(1)
    await prisma.gitHubInstallation.updateMany({ data: { active: false } })
    await owner('get').expect(403)
  })
  it('blocks a discovery if selection changes while GitHub is being read', async () => {
    provider.readRepositorySnapshot.mockImplementationOnce(async () => {
      await prisma.gitHubRepository.update({
        where: { githubId: 501n },
        data: { selected: false },
      })
      return snapshot()
    })
    await owner('post').expect(403)
    expect(await prisma.repositoryProfile.count()).toBe(0)
    expect(
      await prisma.auditEvent.count({
        where: { event: 'repository_profile_discovered' },
      }),
    ).toBe(0)
  })
})

it('persists the selected branch, retains the actual default branch, and audits the inspected branch', async () => {
  provider.readRepositorySnapshot.mockResolvedValueOnce({
    ...snapshot(),
    branch: 'development',
  })
  const response = await owner('post')
    .send({ branch: 'development' })
    .expect(201)
  expect(provider.readRepositorySnapshot).toHaveBeenCalledWith(
    500n,
    501n,
    'development',
  )
  expect(response.body.profile.branch).toBe('development')
  expect(response.body.repository.defaultBranch).toBe('main')
  const saved = await owner('get').expect(200)
  expect(saved.body.profile.branch).toBe('development')
  const audit = await prisma.auditEvent.findFirstOrThrow({
    where: { event: 'repository_profile_discovered' },
  })
  expect(audit.metadata).toMatchObject({ branch: 'development' })
})
it('rejects ambiguous branch names and preserves the previous profile when branch lookup fails', async () => {
  await owner('post').send({}).expect(201)
  await owner('post').send({ branch: 'refs/tags/v1' }).expect(400)
  expect(provider.readRepositorySnapshot).toHaveBeenCalledTimes(1)
  provider.readRepositorySnapshot.mockRejectedValueOnce(
    new Error('Branch does not exist'),
  )
  await owner('post').send({ branch: 'missing' }).expect(503)
  expect((await owner('get').expect(200)).body.profile.branch).toBe('main')
})
