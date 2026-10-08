import 'reflect-metadata'
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { RedisCacheService } from '../src/cache/redis-cache.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard } from '../src/auth/session.guard.js'
import { DashboardController } from '../src/dashboard/dashboard.controller.js'
import { DashboardService } from '../src/dashboard/dashboard.service.js'

let prisma: PrismaService
let app: INestApplication
let actorId: string
let repoId: string
const entries = new Map<string, string>()
let builds = 0
const cache = {
  get: async (key: string) => entries.get(key) ?? null,
  set: async (key: string, value: string) => {
    builds++
    entries.set(key, value)
  },
}
const get = (query = '') =>
  request(app.getHttpServer())
    .get('/github/dashboard' + query)
    .set('Cookie', 'test.sid=VIEWER')

beforeAll(async () => {
  if (
    !new URL(process.env.DATABASE_URL!).pathname.startsWith(
      '/preflyt_dashboard_test_',
    )
  )
    throw new Error(
      'Dashboard integration tests require a dedicated disposable database',
    )
  prisma = new PrismaService()
  await prisma.$connect()
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [DashboardController],
      providers: [
        DashboardService,
        SessionGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: cache },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: 'test.sid',
            currentSession: async (token?: string) =>
              token === 'VIEWER'
                ? { authenticated: true, identityId: actorId, role: 'VIEWER' }
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
  entries.clear()
  builds = 0
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.identity.deleteMany()
  actorId = (
    await prisma.identity.create({
      data: { issuer: 'dashboard-fixture', subject: 'viewer' },
    })
  ).id
  await prisma.gitHubInstallation.create({
    data: {
      id: 501n,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      connectedById: actorId,
    },
  })
  repoId = (
    await prisma.gitHubRepository.create({
      data: {
        githubId: 502n,
        installationId: 501n,
        name: 'app',
        fullName: 'fixture/app',
        ownerLogin: 'fixture',
        isPrivate: true,
        selected: true,
      },
    })
  ).id
})
async function snapshot(
  number?: number,
  createdAt = new Date(),
  repositoryId = repoId,
) {
  return prisma.commitAssessment.create({
    data: {
      repositoryId,
      sourceSha: 'a'.repeat(40),
      selectionId: 'fixture-selection',
      requestKey: `fixture-${Math.random()}`,
      inputHash: 'b'.repeat(64),
      assessmentHash: 'c'.repeat(64),
      request: number
        ? { subjectKind: 'PULL_REQUEST', pullRequest: { number } }
        : { subjectKind: 'COMMIT' },
      plan: {},
      report: { qualityGate: 'PASSED' },
      createdAt,
    },
  })
}
it('requires a session and permits read-only viewers without invoking GitHub', async () => {
  await request(app.getHttpServer()).get('/github/dashboard').expect(401)
  const response = await get().expect(200)
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.body.metrics).toMatchObject({
    repositories: 1,
    snapshots: 0,
    prsAssessed: 0,
    blockedPrs: null,
    openFindings: null,
    verifiedPolicyCoverage: null,
  })
  expect(response.body.repositories[0].readiness).toBe('NOT_EVALUATED')
})
it('counts distinct PRs and snapshots in the period, including same-number PRs in different repositories', async () => {
  const second = await prisma.gitHubRepository.create({
    data: {
      githubId: 503n,
      installationId: 501n,
      name: 'other',
      fullName: 'fixture/other',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: true,
    },
  })
  await snapshot(1)
  await snapshot(1)
  await snapshot(1, new Date(), second.id)
  await snapshot()
  await snapshot(2, new Date(Date.now() - 120 * 86400000))
  await snapshot(3, new Date(Date.now() + 86400000))
  const response = await get('?days=30').expect(200)
  expect(response.body.metrics).toMatchObject({
    repositories: 2,
    snapshots: 4,
    prsAssessed: 2,
    repositoriesWithSnapshots: 2,
  })
  expect(
    response.body.activity.reduce(
      (sum: number, day: { count: number }) => sum + day.count,
      0,
    ),
  ).toBe(4)
  expect(response.body.period.timezone).toBe('UTC')
  expect(response.body.metrics.blockedPrs).toBeNull()
})
it('filters to a selected repository and never counts deselected or revoked repositories', async () => {
  const other = await prisma.gitHubRepository.create({
    data: {
      githubId: 503n,
      installationId: 501n,
      name: 'other',
      fullName: 'fixture/other',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: false,
    },
  })
  await snapshot(1)
  await snapshot(2, new Date(), other.id)
  expect(
    (await get('?repository=502').expect(200)).body.metrics.snapshots,
  ).toBe(1)
  await get('?repository=503').expect(403)
  await prisma.gitHubInstallation.update({
    where: { id: 501n },
    data: { active: false, accessRevision: { increment: 1 } },
  })
  const response = await get().expect(200)
  expect(response.body.metrics.repositories).toBe(0)
  expect(response.body.activity).toEqual([])
  expect(response.body.choices).toEqual([])
})
it('serves cached summaries and invalidates their scope immediately after deselection', async () => {
  await snapshot()
  expect((await get().expect(200)).body.metrics.snapshots).toBe(1)
  await snapshot()
  expect((await get().expect(200)).body.metrics.snapshots).toBe(1)
  expect(builds).toBe(1)
  await prisma.gitHubRepository.update({
    where: { id: repoId },
    data: { selected: false },
  })
  const response = await get().expect(200)
  expect(response.body.metrics.repositories).toBe(0)
  expect(response.body.repositories).toEqual([])
  expect(builds).toBe(2)
})
it('fails open on malformed or expired cached data and uses separate range keys', async () => {
  await get('?days=7').expect(200)
  const key = [...entries.keys()][0]!
  entries.set(key, '{invalid-json')
  await snapshot()
  expect((await get('?days=7').expect(200)).body.metrics.snapshots).toBe(1)
  const cached = JSON.parse(entries.get(key)!)
  cached.generatedAt = new Date(Date.now() - 31000).toISOString()
  entries.set(key, JSON.stringify(cached))
  await snapshot()
  expect((await get('?days=7').expect(200)).body.metrics.snapshots).toBe(2)
  await get('?days=90').expect(200)
  expect(builds).toBe(4)
})
it('shows missing prerequisites without converting provider state into gate outcomes', async () => {
  await prisma.repositoryPullRequest.create({
    data: {
      repositoryId: repoId,
      number: 1,
      objectId: 'pr-1',
      syncState: 'SYNCED',
      verifiedAt: new Date(),
      verifiedInstallationId: '501',
      verifiedAccessRevision: 0,
      sourceUpdatedAt: new Date(),
      context: {
        version: 1,
        state: 'open',
        merged: false,
        draft: false,
        head: { repositoryId: '502', ref: 'feature', sha: 'a'.repeat(40) },
        base: { repositoryId: '502', ref: 'main', sha: 'b'.repeat(40) },
      },
    },
  })
  await prisma.repositoryPullRequest.create({
    data: {
      repositoryId: repoId,
      number: 2,
      objectId: 'pr-2',
      context: {
        version: 1,
        state: 'open',
        merged: false,
        draft: false,
        head: { repositoryId: '502', ref: 'unknown-time', sha: 'a'.repeat(40) },
        base: { repositoryId: '502', ref: 'main', sha: 'b'.repeat(40) },
      },
    },
  })
  const response = await get().expect(200)
  expect(response.body.attention[0].number).toBe(1)
  expect(response.body.attention[0]).toMatchObject({
    reason: 'STANDARDS_NOT_ADOPTED',
    readiness: 'NOT_EVALUATED',
    headRef: 'feature',
  })
  await prisma.repositoryStandardsSelection.create({
    data: {
      repositoryId: repoId,
      revision: 1,
      profile: 'RECOMMENDED',
      packs: [],
      selectedById: actorId,
    },
  })
  entries.clear()
  const adopted = await get().expect(200)
  expect(adopted.body.attention[0].reason).toBe('EXECUTION_NOT_VERIFIED')
  expect(adopted.body.metrics.standardsAdopted).toBe(1)
})
it.each([
  '?days=365',
  '?days=7&days=30',
  '?repository=bad',
  '?repository=9007199254740993',
])('rejects unsupported or ambiguous filters %s', async (query) => {
  await get(query).expect(400)
})

it.skipIf(process.env.PREFLYT_DASHBOARD_REDIS_TEST !== 'true')(
  'uses the configured local Redis for a warm dashboard without rebuilding',
  async () => {
    const redis = new RedisCacheService()
    const keys: string[] = []
    const originalSet = redis.set.bind(redis)
    vi.spyOn(redis, 'set').mockImplementation(async (key, value, ttl) => {
      keys.push(key)
      await originalSet(key, value, ttl)
    })
    try {
      await redis.set('dashboard-test-probe', 'ready', 30)
      expect(await redis.get('dashboard-test-probe')).toBe('ready')
      const service = new DashboardService(prisma, redis)
      await snapshot()
      const first = (await service.overview(actorId)) as {
        metrics: { snapshots: number }
        generatedAt: string
      }
      await snapshot()
      const warm = (await service.overview(actorId)) as typeof first
      expect(warm.metrics.snapshots).toBe(1)
      expect(warm.generatedAt).toBe(first.generatedAt)
      await prisma.gitHubRepository.update({
        where: { id: repoId },
        data: { selected: false },
      })
      expect(
        ((await service.overview(actorId)) as typeof first).metrics.snapshots,
      ).toBe(0)
    } finally {
      await Promise.all([...new Set(keys)].map((key) => redis.delete(key)))
      redis.onModuleDestroy()
    }
  },
)
