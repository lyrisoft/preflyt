import { ContributorSyncService } from '../src/contributors/contributor-sync.service.js'
import { FindingSourceStore } from '../src/findings/finding-source-store.service.js'
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { ForbiddenException, ValidationPipe, type INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard, OwnerAdminGuard } from '../src/auth/session.guard.js'
import { AssessmentController } from '../src/assessments/assessment.controller.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { OrganizationController } from '../src/auth/organization.controller.js'
import { ContributorsController } from '../src/contributors/contributors.controller.js'
import { ContributorsService } from '../src/contributors/contributors.service.js'
import { captureContributors } from '../src/contributors/capture.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { GitHubService } from '../src/github/github.service.js'
import { GitHubController } from '../src/github/github.controller.js'
import { GitHubWebhookService } from '../src/github-events/github-webhook.service.js'
import { GitHubWebhookController } from '../src/github-events/github-webhook.controller.js'
import { DashboardService } from '../src/dashboard/dashboard.service.js'
import { DashboardController } from '../src/dashboard/dashboard.controller.js'
import { FindingsController } from '../src/findings/findings.controller.js'
import { FindingsService } from '../src/findings/findings.service.js'
import { digest } from '../src/assessments/assessment-digest.js'
import { RedisCacheService } from '../src/cache/redis-cache.service.js'
let db: PrismaService, app: INestApplication, access: AuthorizationService
let orgA: string,
  orgB: string,
  owner: string,
  developer: string,
  viewer: string,
  platform: string,
  memberId: string
let beforeBackfill = async () => {}
let backfillObservations: { event: string; body: any }[] = []
const readFindingSource = vi.fn()
const origin = 'http://localhost:5173',
  sha = 'a'.repeat(40)
const actor = (id: string, path: string) =>
  request(app.getHttpServer()).get(path).set('Cookie', `scope.sid=${id}`)
const mutate = (id: string, path: string, body: object) =>
  request(app.getHttpServer())
    .post(path)
    .set('Cookie', `scope.sid=${id}`)
    .set('Origin', origin)
    .send(body)
const testDatabase = 'preflyt_scope_test_' + randomUUID().replaceAll('-', '')
let databaseAdmin: Client | undefined
let databaseCreated = false
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('Local disposable database required')
  databaseAdmin = new Client({ connectionString: url.toString() })
  await databaseAdmin.connect()
  await databaseAdmin.query(`CREATE DATABASE "${testDatabase}"`)
  databaseCreated = true
  url.pathname = '/' + testDatabase
  const sql = new Client({ connectionString: url.toString() })
  await sql.connect()
  try {
    for (const entry of (await readdir('prisma/migrations')).filter((n) => /^\d/.test(n)).sort())
      await sql.query(await readFile(`prisma/migrations/${entry}/migration.sql`, 'utf8'))
  } finally { await sql.end() }
  vi.stubEnv('DATABASE_URL', url.toString())
  db = new PrismaService()
  await db.$connect()
  access = new AuthorizationService(db)
  const auth = {
    sessionCookieName: 'scope.sid',
    assertOrigin: (value: string) => {
      if (value !== origin) throw new ForbiddenException('Invalid origin')
    },
    currentSession: async (id?: string) => {
      if (!id) return { authenticated: false }
      const identity = await db.identity.findUnique({
        where: { id },
        include: { membership: true },
      })
      if (!identity) return { authenticated: false }
      const member = await db.organizationMembership.findFirst({
        where: { identityId: id, organizationId: orgA, active: true },
      })
      return {
        authenticated: true,
        identityId: id,
        subject: identity.subject,
        email: null,
        role: member?.role ?? 'SUPER_ADMIN',
        organizationId: orgA,
        platformAdmin: identity.membership?.role === 'SUPER_ADMIN',
      }
    },
  }
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [
        FindingsController,
        OrganizationController,
        AssessmentController,
        ContributorsController,
        GitHubController,
        GitHubWebhookController,
        DashboardController,
      ],
      providers: [
        SessionGuard,
        OwnerAdminGuard,
        FindingSourceStore,
        FindingsService,
        ContributorsService,
        AssessmentService,
        GitHubService,
        GitHubWebhookService,
        DashboardService,
        { provide: PrismaService, useValue: db },
        { provide: AuthorizationService, useValue: access },
        { provide: AuthService, useValue: auth },
        {
          provide: RedisCacheService,
          useValue: { get: async () => null, set: async () => {} },
        },
        {
          provide: GitHubProviderService,
          useValue: {
            readHealthSource: readFindingSource,
            verifyRepositoryAccess: vi.fn().mockResolvedValue(undefined),
            readContributorBackfill: async () => {
              await beforeBackfill()
              return {
              observations: backfillObservations,
              truncated: false,
              limits: { pullRequests: 30 },
              }
            },
          },
        },
      ],
    },
    { logger: false, rawBody: true },
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
  process.env.GITHUB_EVENTS_ENABLED = 'true'
  process.env.GITHUB_WEBHOOK_SECRET = 'x'.repeat(40)
})
afterAll(async () => {
  await app?.close()
  await db?.$disconnect()
  if (databaseCreated) await databaseAdmin?.query(`DROP DATABASE "${testDatabase}" WITH (FORCE)`)
  await databaseAdmin?.end()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  readFindingSource.mockReset()
  beforeBackfill = async () => {}
  backfillObservations = []
  await db.contributorObservation.deleteMany()
  await db.contributor.deleteMany()
  await db.contributorDelivery.deleteMany()
  await db.gitHubWebhookDelivery.deleteMany()
  await db.gitHubRepository.deleteMany()
  await db.gitHubInstallation.deleteMany()
  await db.identity.deleteMany()
  await db.organization.deleteMany()
  await db.auditEvent.deleteMany()
  await db.authThrottle.deleteMany()
  orgA = (await db.organization.create({ data: { name: 'A' } })).id
  orgB = (await db.organization.create({ data: { name: 'B' } })).id
  async function identity(
    subject: string,
    role: 'OWNER' | 'DEVELOPER' | 'VIEWER' | 'SUPER_ADMIN',
  ) {
    return (
      await db.identity.create({
        data: {
          issuer: process.env.OIDC_ISSUER + '/',
          subject,
          membership: { create: { role } },
        },
      })
    ).id
  }
  owner = await identity('owner', 'OWNER')
  developer = await identity('developer', 'DEVELOPER')
  viewer = await identity('viewer', 'VIEWER')
  platform = await identity('platform', 'SUPER_ADMIN')
  await db.organizationMembership.create({
    data: { organizationId: orgA, identityId: owner, role: 'OWNER' },
  })
  memberId = (
    await db.organizationMembership.create({
      data: { organizationId: orgA, identityId: developer, role: 'DEVELOPER' },
    })
  ).id
  const v = (
    await db.organizationMembership.create({
      data: { organizationId: orgA, identityId: viewer, role: 'VIEWER' },
    })
  ).id
  for (const [installationId, organizationId] of [
    [1n, orgA],
    [2n, orgB],
  ] as const)
    await db.gitHubInstallation.create({
      data: {
        id: installationId,
        organizationId,
        accountLogin: organizationId,
        accountType: 'Organization',
        repositorySelection: 'selected',
        permissions: {},
        connectedById: owner,
      },
    })
  for (const [githubId, installationId] of [
    [11n, 1n],
    [12n, 1n],
    [21n, 2n],
  ] as const)
    await db.gitHubRepository.create({
      data: {
        githubId,
        installationId,
        name: `repo${githubId}`,
        fullName: `fixture/repo${githubId}`,
        ownerLogin: 'fixture',
        selected: true,
        isPrivate: true,
      },
    })
  const repo = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 11n },
  })
  await db.repositoryGrant.createMany({
    data: [
      { membershipId: memberId, repositoryId: repo.id },
      { membershipId: v, repositoryId: repo.id },
    ],
  })
  const now = new Date()
  for (const repositoryGithubId of [11n, 12n, 21n])
    await captureContributors(
      db,
      randomUUID(),
      'hash-' + repositoryGithubId,
      repositoryGithubId === 21n ? 2n : 1n,
      repositoryGithubId,
      [
        {
          actor: {
            githubUserId: repositoryGithubId.toString(),
            login: `person${repositoryGithubId}`,
            kind: 'HUMAN',
          },
          relationship: 'PR_AUTHOR',
          sourceObjectId: '100' + repositoryGithubId,
          sourceSha: sha,
          pullRequestNumber: Number(repositoryGithubId),
          action: 'opened',
          state: 'open',
          merged: false,
          observedAt: now,
        },
      ],
    )
})
it('filters inventory and dashboard before returning cross-organization or unassigned data', async () => {
  const inventory = await actor(developer, '/github/repositories').expect(200)
  expect(inventory.body.repositories.map((r: any) => r.githubId)).toEqual([
    '11',
  ])
  const ownerInventory = await actor(owner, '/github/repositories').expect(200)
  expect(ownerInventory.body.repositories.map((r: any) => r.githubId)).toEqual([
    '11',
    '12',
  ])
  const dashboard = await actor(developer, '/github/dashboard').expect(200)
  expect(dashboard.body.choices.map((r: any) => r.githubId)).toEqual(['11'])
  await actor(developer, '/github/dashboard?repository=21').expect(403)
})
it('default denies unassigned and cross-organization repository evidence and contributors', async () => {
  await actor(developer, '/github/repositories/12/ci-evidence').expect(403)
  await actor(developer, '/github/repositories/21/events').expect(403)
  await actor(developer, '/contributors?repository=12').expect(403)
  const other = await db.contributor.findFirstOrThrow({
    where: { installationId: 2n },
  })
  await actor(developer, `/contributors/${other.id}`).expect(403)
  await actor('', '/contributors').expect(401)
})
it('does not grant source access merely because an identity is Super Admin', async () => {
  await actor(platform, '/github/repositories/11/events').expect(403)
  expect(
    (await actor(platform, '/github/repositories').expect(200)).body
      .repositories,
  ).toEqual([])
  await actor(platform, '/contributors').expect(403)
})
it('allows assigned Developers to run assessments but not manage repositories or policy', async () => {
  const session = {
    authenticated: true as const,
    identityId: developer,
    subject: 'developer',
    email: null,
    role: 'DEVELOPER',
    organizationId: orgA,
  }
  await expect(
    access.requireRepository(session, '11', 'assessment.run'),
  ).resolves.toBeDefined()
  await expect(
    access.requireRepository(session, '11', 'policy.draft'),
  ).rejects.toThrow()
  await expect(
    access.requireRepository(session, '12', 'assessment.run'),
  ).rejects.toThrow()
  await actor(developer, '/github/repositories/12/assessments/foreign/gate-preview').expect(403)
  await actor(developer, '/github/repositories/21/assessments/foreign/gate-preview').expect(403)
  await mutate(developer, '/contributors/repositories/11/sync', {}).expect(403)
  await mutate(viewer, '/organizations/members', {
    subject: 'new',
    role: 'ADMIN',
    active: true,
    repositoryIds: [],
  }).expect(403)
})
it('assigns/revokes repository grants and respects membership revocation on subsequent requests', async () => {
  const body = {
    subject: 'developer',
    role: 'DEVELOPER',
    active: true,
    repositoryIds: ['12'],
  }
  await request(app.getHttpServer())
    .patch(`/organizations/members/${memberId}`)
    .set('Cookie', `scope.sid=${owner}`)
    .set('Origin', origin)
    .send(body)
    .expect(200)
  await actor(developer, '/github/repositories/11/events').expect(403)
  expect(
    (
      await actor(developer, '/github/repositories').expect(200)
    ).body.repositories.map((r: any) => r.githubId),
  ).toEqual(['12'])
  await db.organizationMembership.update({
    where: { id: memberId },
    data: { active: false },
  })
  await actor(developer, '/contributors').expect(403)
  expect(
    await db.auditEvent.count({
      where: { event: 'organization_membership_changed' },
    }),
  ).toBe(1)
})
it('rejects foreign grants, forged organization context and self-escalation', async () => {
  await request(app.getHttpServer())
    .patch(`/organizations/members/${memberId}`)
    .set('Cookie', `scope.sid=${owner}`)
    .set('Origin', origin)
    .send({
      subject: 'developer',
      role: 'DEVELOPER',
      active: true,
      repositoryIds: ['21'],
    })
    .expect(403)
  await mutate(developer, `/organizations/${orgB}/activate`, {}).expect(403)
  await mutate(developer, '/organizations/members', {
    subject: 'developer',
    role: 'OWNER',
    active: true,
    repositoryIds: [],
  }).expect(403)
  const admin = await db.organizationMembership.create({
    data: { organizationId: orgA, identityId: platform, role: 'ADMIN' },
  })
  await mutate(platform, '/organizations/members', {
    subject: 'outsider',
    role: 'OWNER',
    active: true,
    repositoryIds: [],
  }).expect(403)
  await request(app.getHttpServer())
    .patch(`/organizations/members/${admin.id}`)
    .set('Cookie', `scope.sid=${platform}`)
    .set('Origin', origin)
    .send({
      subject: 'platform',
      role: 'ADMIN',
      active: true,
      repositoryIds: [],
    })
    .expect(403)
})
it('cannot overwrite an existing Owner using the member creation route', async () => {
  await db.organizationMembership.create({
    data: { organizationId: orgA, identityId: platform, role: 'ADMIN' },
  })
  await mutate(platform, '/organizations/members', {
    subject: 'owner', role: 'VIEWER', active: false, repositoryIds: [],
  }).expect(400)
  await mutate(owner, '/organizations/members', {
    subject: 'developer', role: 'VIEWER', active: false, repositoryIds: [],
  }).expect(400)
  expect(await db.organizationMembership.findFirst({ where: { organizationId: orgA, identityId: owner } }))
    .toMatchObject({ role: 'OWNER', active: true })
  expect(await db.organizationMembership.findUnique({ where: { id: memberId } }))
    .toMatchObject({ role: 'DEVELOPER', active: true })
})
it('deduplicates PR activity across deliveries and keeps unknown policy outcomes unavailable', async () => {
  const contributor = await db.contributor.findFirstOrThrow({
    where: { githubUserId: '11', installationId: 1n },
  })
  const current = await db.contributorObservation.findFirstOrThrow({
    where: { contributorId: contributor.id },
  })
  await captureContributors(db, randomUUID(), 'another', 1n, 11n, [
    {
      actor: { githubUserId: '11', login: 'person11', kind: 'HUMAN' },
      relationship: 'PR_AUTHOR',
      sourceObjectId: current.sourceObjectId,
      sourceSha: sha,
      pullRequestNumber: 11,
      action: 'closed',
      state: 'closed',
      merged: true,
      observedAt: new Date(Date.now() + 1),
    },
  ])
  const response = await actor(developer, '/contributors').expect(200)
  expect(response.body.summary.authoredPrs).toBe(1)
  expect(response.body.summary.firstPassAdherence).toBeNull()
  expect(response.body.summary.completeAssessmentCoverage).toBeNull()
  const detail = await actor(
    developer,
    `/contributors/${contributor.id}`,
  ).expect(200)
  expect(detail.body.contributors[0].mergedPrs).toBe(1)
  expect(
    detail.body.observations.every((r: any) => r.repositoryId === '11'),
  ).toBe(true)
})
it('keeps all metrics filtered consistently and protects contributor activity permissions', async () => {
  const result = await actor(
    owner,
    '/contributors?repository=12&q=person12',
  ).expect(200)
  expect(result.body.summary).toMatchObject({
    contributors: 1,
    repositories: 1,
    authoredPrs: 1,
  })
  expect(result.body.scope).toHaveLength(1)
  expect(result.body.choices).toHaveLength(2)
  const v = await actor(viewer, '/contributors').expect(200)
  expect(v.body.activity).toEqual([])
  expect(v.body.contributors[0].authoredPrs).toBeNull()
  await actor(viewer, `/contributors/${v.body.contributors[0].id}`).expect(403)
})
it('accepts only signed selected-repository events, deduplicates deliveries and rejects hash collisions', async () => {
  const id = randomUUID()
  const body = {
    installation: { id: 1 },
    repository: { id: 11 },
    action: 'submitted',
    pull_request: {
      number: 11,
      base: { repo: { id: 11 } },
      updated_at: new Date().toISOString(),
    },
    review: {
      id: 222,
      commit_id: sha,
      user: { id: 55, login: 'reviewer', type: 'User' },
      state: 'APPROVED',
      submitted_at: new Date().toISOString(),
    },
  }
  const raw = JSON.stringify(body),
    sig =
      'sha256=' +
      createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
        .update(raw)
        .digest('hex')
  const send = (signature: string) =>
    request(app.getHttpServer())
      .post('/github/webhooks')
      .set('X-GitHub-Delivery', id)
      .set('X-GitHub-Event', 'pull_request_review')
      .set('X-Hub-Signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(raw)
  await send('sha256=' + '0'.repeat(64)).expect(401)
  await send(sig).expect(202)
  expect((await send(sig).expect(202)).body.duplicate).toBe(true)
  expect(
    await db.contributorObservation.count({ where: { deliveryId: id } }),
  ).toBe(1)
  await expect(
    captureContributors(db, id, 'different', 1n, 11n, []),
  ).rejects.toThrow('reused')
  await db.gitHubRepository.update({
    where: { githubId: 11n },
    data: { selected: false },
  })
  const blocked = await captureContributors(
    db,
    randomUUID(),
    'blocked',
    1n,
    11n,
    [],
  )
  expect(blocked.accepted).toBe(false)
})

it('rechecks real persisted session permissions and honors the chosen organization after revocation', async () => {
  const raw='persisted-scope-test-token'
  await db.webSession.create({data:{tokenHash:createHash('sha256').update(raw).digest('hex'),identityId:developer,activeOrganizationId:orgA,expiresAt:new Date(Date.now()+60000)}})
  const auth=new AuthService(db)
  expect(await auth.currentSession(raw)).toMatchObject({authenticated:true,organizationId:orgA,role:'DEVELOPER',repositoryGrants:['11']})
  await db.organizationMembership.update({where:{id:memberId},data:{active:false}})
  expect(await auth.currentSession(raw)).toMatchObject({authenticated:true,organizationId:orgA,permissions:[],repositoryGrants:[]})
})
it('bounds administrative backfill with a durable cooldown',async()=>{
 const stale = await db.authThrottle.create({data:{action:'contributors-backfill',keyHash:'old-contributor-sync',windowStart:new Date(0),count:1}})
 await mutate(owner,'/contributors/repositories/11/sync',{}).expect(202)
 await mutate(owner,'/contributors/repositories/11/sync',{}).expect(429)
 expect(await db.authThrottle.findUnique({where:{id:stale.id}})).toBeNull()
 expect(await db.auditEvent.findFirst({where:{event:'contributors_sync_requested'}})).toMatchObject({metadata:expect.objectContaining({organizationId:orgA,repositoryId:'11'})})
})

it('persists an authorized organization switch on the current session',async()=>{
 await db.organizationMembership.create({data:{organizationId:orgB,identityId:owner,role:'VIEWER'}})
 await db.webSession.create({data:{tokenHash:createHash('sha256').update(owner).digest('hex'),identityId:owner,activeOrganizationId:orgA,expiresAt:new Date(Date.now()+60000)}})
 await mutate(owner,`/organizations/${orgB}/activate`,{}).expect(201)
 expect(await new AuthService(db).currentSession(owner)).toMatchObject({authenticated:true,organizationId:orgB,role:'VIEWER'})
})
it('organization creation assigns an explicit Owner without granting other organizations',async()=>{
 const created=await mutate(platform,'/organizations',{name:'New customer'}).expect(201)
 expect(await db.organizationMembership.findFirst({where:{organizationId:created.body.id,identityId:platform}})).toMatchObject({role:'OWNER',active:true})
 expect(await access.repositoryScope(platform,orgA)).toEqual([])
})

async function complianceFixture() {
  const contributor = await db.contributor.findFirstOrThrow({ where: { githubUserId: '11', installationId: 1n } })
  const observation = await db.contributorObservation.findFirstOrThrow({ where: { contributorId: contributor.id } })
  const input = {
    sourceSha: sha, selectionId: 'fixture-selection', selectionRevision: 1,
    pullRequest: { number: 11, objectId: observation.sourceObjectId, head: { sha } },
    profileSnapshot: { sourceSha: sha, complete: true },
  }
  const plan = { version: 1, sourceSha: sha, mode: 'INGEST_ONLY', stage: 'ci', enforcement: 'observe', checks: [{ id: 'ci', required: true, operator: 'configuration_hint_present', capability: 'available' }] }
  const report = { version: 1, sourceSha: sha, collectionTruncated: false, validationCollectionTruncated: false, checks: [{ ruleId: 'ci', required: true, coverage: 'CONFIGURATION_OBSERVED', configurationEvidence: [{ path: '.github/workflows/ci.yml', blobSha: 'b'.repeat(40) }] }] }
  const assessment = await db.commitAssessment.create({ data: { repositoryId: observation.repositoryId, sourceSha: sha, selectionId: input.selectionId, requestKey: randomUUID(), inputHash: 'fixture', request: input, plan, report, assessmentHash: digest({ request: input, plan, report }) } })
  return { contributor, observation, assessment }
}
it('returns authorized contributor compliance with exact PR evidence and preserves filters', async () => {
  const { contributor, assessment } = await complianceFixture()
  const profile = await actor(developer, `/contributors/${contributor.id}`).expect(200)
  expect(profile.body.policyCompliance).toMatchObject({ eligiblePrs: 1, completePrs: 1, passingPrs: 1, passRate: 100, coverage: 100, rows: [{ assessmentId: assessment.id, number: 11 }] })
  expect(profile.body.policyCompliance.repositories.map((r: any) => r.githubId)).toEqual(['11'])
  expect(profile.body.contributionActivity.reduce((total: number, day: any) => total + day.authoredPrs, 0)).toBe(profile.body.contributors[0].authoredPrs)
  expect(profile.body.contributionActivity.reduce((total: number, day: any) => total + day.mergedPrs, 0)).toBe(profile.body.contributors[0].mergedPrs)
  expect(profile.body.contributionActivity).toHaveLength(30)
  const empty = await actor(developer, `/contributors/${contributor.id}?relationship=REVIEWER`).expect(200)
  expect(empty.body.emptyActivity).toBe(true)
  expect(empty.body.contributors[0]).toMatchObject({ id: contributor.id, authoredPrs: 0, reviews: 0 })
  expect(empty.body.observations).toEqual([])
  await actor(developer, `/contributors/${contributor.id}?repository=12`).expect(403)
})
it('hides compliance after permission/grant revocation and excludes tampered evidence', async () => {
  const { contributor, assessment } = await complianceFixture()
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { assessmentHash: 'changed' } })
  const profile = await actor(developer, `/contributors/${contributor.id}`).expect(200)
  expect(profile.body.policyCompliance).toMatchObject({ completePrs: 0, passRate: null, rows: [{ status: 'INVALID' }] })
  await db.repositoryGrant.deleteMany({ where: { membershipId: memberId } })
  await actor(developer, `/contributors/${contributor.id}`).expect(403)
})

it('returns an empty profile for another authorized repository while hiding unknown and inaccessible contributors', async () => {
  const { contributor } = await complianceFixture()
  const empty = await actor(owner, `/contributors/${contributor.id}?repository=12`).expect(200)
  expect(empty.body.emptyActivity).toBe(true)
  expect(empty.body.contributors[0]).toMatchObject({ id: contributor.id, repositoryCount: 0 })
  expect(empty.body.observations).toEqual([])
  await actor(owner, '/contributors/unknown-person?repository=12').expect(403)
  await actor(developer, `/contributors/${contributor.id}?repository=12`).expect(403)
})

const backfillPr = (repositoryId: number) => ({
  event: 'pull_request',
  body: {
    installation: { id: 1 }, repository: { id: repositoryId }, action: 'edited',
    pull_request: {
      id: 999, number: 999, base: { repo: { id: repositoryId } }, head: { sha },
      user: { id: 999, login: 'imported-person', type: 'User' },
      state: 'open', merged: false, updated_at: new Date().toISOString(),
    },
  },
})
it('persists upstream contributor activity and reports verified capture counts', async () => {
  backfillObservations = [backfillPr(11)]
  const response = await mutate(owner, '/contributors/repositories/11/sync', {}).expect(202)
  expect(response.body.state).toBe('QUEUED')
  await new ContributorSyncService(db, app.get(GitHubProviderService)).reconcile()
  expect(await db.contributorObservation.count({ where: { sourceObjectId: '999' } })).toBe(1)
})
it('does not report success when upstream activity belongs to an unselected repository', async () => {
  backfillObservations = [backfillPr(99)]
  await mutate(owner, '/contributors/repositories/11/sync', {}).expect(202)
  await new ContributorSyncService(db, app.get(GitHubProviderService)).reconcile()
  expect((await db.contributorSyncState.findFirstOrThrow()).state).toBe('RETRY')
  expect(await db.auditEvent.count({ where: { event: 'contributors_backfilled' } })).toBe(0)
})

it('recovers activity after reconnecting a repository with retained duplicate receipts', async () => {
  const oldRepo = await db.gitHubRepository.findUniqueOrThrow({ where: { githubId: 11n } })
  const deliveryId = randomUUID()
  const activity = {
    actor: { githubUserId: '999', login: 'recovered-person', kind: 'HUMAN' as const },
    relationship: 'PR_AUTHOR', sourceObjectId: '999', sourceSha: sha,
    pullRequestNumber: 999, action: 'edited', state: 'open', merged: false,
    observedAt: new Date(),
  }
  await captureContributors(db, deliveryId, 'same-payload', 1n, 11n, [activity])
  await db.gitHubRepository.delete({ where: { id: oldRepo.id } })
  const { id, ...fields } = oldRepo
  const reconnected = await db.gitHubRepository.create({ data: fields })
  const recovered = await captureContributors(db, deliveryId, 'same-payload', 1n, 11n, [activity])
  expect(recovered).toMatchObject({ accepted: true, duplicate: false })
  expect(await db.contributorObservation.count({ where: { repositoryId: reconnected.id, sourceObjectId: '999' } })).toBe(1)
  expect(await captureContributors(db, deliveryId, 'same-payload', 1n, 11n, [activity])).toMatchObject({ duplicate: true })
})

it('reads scoped settings and audits Owner updates without exposing session secrets', async () => {
  const settings = await actor(owner, '/organizations/settings').expect(200)
  expect(settings.body).toMatchObject({ id: orgA, name: 'A', canUpdate: true })
  expect(settings.body).not.toHaveProperty('authentication')
  await request(app.getHttpServer()).patch('/organizations/settings').set('Cookie', `scope.sid=${owner}`).set('Origin', origin).send({ name: 'Updated workspace' }).expect(200)
  expect((await db.organization.findUniqueOrThrow({ where: { id: orgA } })).name).toBe('Updated workspace')
  expect((await db.organization.findUniqueOrThrow({ where: { id: orgB } })).name).toBe('B')
  expect(await db.auditEvent.count({ where: { event: 'organization.settings.updated', actorId: owner } })).toBe(1)
  await actor(developer, '/organizations/settings').expect(403)
  await request(app.getHttpServer()).patch('/organizations/settings').set('Cookie', `scope.sid=${developer}`).set('Origin', origin).send({ name: 'Denied' }).expect(403)
  await request(app.getHttpServer()).patch('/organizations/settings').set('Cookie', `scope.sid=${owner}`).set('Origin', 'https://foreign.example').send({ name: 'Denied' }).expect(403)
})

it('findings uses authorized saved commits and rejects invalid filters, foreign repositories and tampering', async () => {
  const { assessment } = await complianceFixture()
  const response = await actor(developer, '/findings').expect(200)
  expect(response.body).toMatchObject({ rows: [], total: 0, assessedRevisions: 1, truncated: false })
  expect(response.body.repositories.map((r: any) => r.githubId)).toEqual(['11'])
  await actor(developer, '/findings?repository=12').expect(403)
  await actor(developer, '/findings?severity=invalid').expect(400)
  await actor(developer, '/findings?category=invalid').expect(400)
  const filteredCategory=await actor(developer, '/findings?category=reliability').expect(200)
  expect(filteredCategory.body.rows.every((row:any)=>row.category==='reliability'||row.ruleId==='quality.reliability')).toBe(true)
  await actor(developer, '/findings?page=0').expect(400)
  const report = { ...(assessment.report as any), checks: [{ ruleId: 'ci', required: true, coverage: 'MISSING' }] }
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { report, assessmentHash: digest({ request: assessment.request, plan: assessment.plan, report }) } })
  const gaps = await actor(developer, '/findings?kind=gaps').expect(200)
  expect(gaps.body.rows).toHaveLength(1)
  expect(gaps.body.rows[0]).toMatchObject({ status: 'Evidence missing', sourceSha: sha, assessmentId: assessment.id, repositoryId: '11' })
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { assessmentHash: 'tampered' } })
  await actor(developer, '/findings').expect(409)
})

it('aggregates findings before pagination with matching filters and repository authorization', async () => {
  const { assessment } = await complianceFixture()
  const checks = Array.from({ length: 60 }, (_, index) => ({ id: `check-${index}`, title: `Check ${index}`, required: true, operator: 'configuration_hint_present', capability: 'available', severity: index % 2 ? 'high' : 'medium' }))
  const plan = { ...(assessment.plan as any), checks }
  const report = { ...(assessment.report as any), checks: checks.map((check) => ({ ruleId: check.id, title: check.title, required: true, coverage: 'MISSING' })) }
  const assessmentHash = digest({ request: assessment.request, plan, report })
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { plan, report, assessmentHash } })
  const foreign = await db.gitHubRepository.findFirstOrThrow({ where: { githubId: 12n } })
  await db.commitAssessment.create({ data: { repositoryId: foreign.id, sourceSha: sha, selectionId: assessment.selectionId, requestKey: randomUUID(), inputHash: 'fixture', request: assessment.request as any, plan, report, assessmentHash } })
  const first = await actor(developer, '/findings?kind=gaps').expect(200)
  const next = await actor(developer, '/findings?kind=gaps&page=2').expect(200)
  expect(first.body.rows).toHaveLength(10)
  expect((await actor(developer, '/findings?kind=gaps&pageSize=25').expect(200)).body.rows).toHaveLength(25)
  const final = (await actor(developer, '/findings?kind=gaps&page=3&pageSize=25').expect(200)).body
  expect(final.rows).toHaveLength(10)
  await actor(developer, '/findings?pageSize=1000').expect(400)
  expect(next.body.rows).toHaveLength(10)
  expect(first.body.summary).toEqual(next.body.summary)
  expect(first.body.summary).toMatchObject({ reportedIssues: 0, affectedRepositories: 1, criticalHigh: 0, evidenceGaps: 60, chartTotal: 60 })
  expect(first.body.summary.byCheck.reduce((sum: number, item: any) => sum + item.count, 0)).toBe(60)
  const high = await actor(developer, '/findings?kind=gaps&severity=high').expect(200)
  expect(high.body.summary.evidenceGaps).toBe(30)
  const search = await actor(developer, '/findings?kind=gaps&q=Check%2059').expect(200)
  expect(search.body.summary.evidenceGaps).toBe(1)
  const issues = await actor(developer, '/findings?kind=findings').expect(200)
  expect(issues.body.summary.evidenceGaps).toBe(60)
  expect(issues.body.summary.chartTotal).toBe(0)
})

it('assigns and resolves finding triage without changing evidence, rejects unauthorized updates and stale revisions', async () => {
  const { assessment } = await complianceFixture()
  const report = { ...(assessment.report as any), checks: [{ ruleId: 'ci', required: true, coverage: 'MISSING' }] }
  const hash = digest({ request: assessment.request, plan: assessment.plan, report })
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { report, assessmentHash: hash } })
  const list = await actor(owner, '/findings?kind=gaps').expect(200)
  const finding = list.body.rows[0]
  expect(list.body.canManage).toBe(true)
  const input = { state: 'IN_REVIEW', assigneeId: developer, note: 'Investigating CI evidence', expectedRevision: 0 }
  await mutate(developer, `/findings/${finding.id}/triage`, input).expect(403)
  await request(app.getHttpServer()).post(`/findings/${finding.id}/triage`).set('Cookie', `scope.sid=${owner}`).set('Origin', 'https://bad.invalid').send(input).expect(403)
  await mutate(owner, `/findings/${finding.id}/triage`, { ...input, assigneeId: platform }).expect(400)
  const created = await mutate(owner, `/findings/${finding.id}/triage`, input).expect(201)
  expect(created.body).toMatchObject({ state: 'IN_REVIEW', assigneeId: developer, revision: 1 })
  await mutate(owner, `/findings/${finding.id}/triage`, input).expect(409)
  await mutate(owner, `/findings/${finding.id}/triage`, { ...input, state: 'RESOLVED', note: '', expectedRevision: 1 }).expect(400)
  const attempts = await Promise.all([mutate(owner, `/findings/${finding.id}/triage`, { ...input, state: 'RESOLVED', note: 'Reviewed and fixed in a follow-up commit; historical evidence retained', expectedRevision: 1 }),
    mutate(owner, `/findings/${finding.id}/triage`, { ...input, note: 'Second reviewer', expectedRevision: 1 })])
  expect(attempts.map(r => r.status).sort()).toEqual([201, 409])
  const updated = (await actor(owner, '/findings?kind=gaps').expect(200)).body.rows[0]
  expect(updated.triage.revision).toBe(2)
  expect((await db.commitAssessment.findUniqueOrThrow({ where: { id: assessment.id } })).assessmentHash).toBe(hash)
  expect(await db.auditEvent.count({ where: { event: 'finding.triage_updated' } })).toBe(2)
})

it('opens pinned finding details without inferring a source location for check evidence', async () => {
 const {assessment}=await complianceFixture()
 const report={...(assessment.report as any),checks:[{ruleId:'ci',required:true,coverage:'MISSING'}]}
 await db.commitAssessment.update({where:{id:assessment.id},data:{report,assessmentHash:digest({request:assessment.request,plan:assessment.plan,report})}})
 const row=(await actor(developer,'/findings?kind=gaps').expect(200)).body.rows[0]
 await request(app.getHttpServer()).get('/findings/'+row.id).expect(401)
 const details=await actor(developer,`/findings/${row.id}?assessment=${assessment.id}`).expect(200)
 expect(details.headers['cache-control']).toBe('no-store')
 expect(details.body).toMatchObject({canManage:false,finding:{id:row.id,sourceSha:sha,assessmentId:assessment.id}})
 const source=await actor(developer,`/findings/${row.id}/source?assessment=${assessment.id}`).expect(200)
 expect(source.body).toMatchObject({sourceSha:sha,path:null,line:null,lines:[]})
 expect(source.body.reason).toContain('not a finding at a code location')
 expect(readFindingSource).not.toHaveBeenCalled()
 await actor(developer,`/findings/${row.id}?assessment=../invalid`).expect(400)
 await db.repositoryGrant.deleteMany({where:{membershipId:memberId}})
 await actor(developer,`/findings/${row.id}`).expect(404)
 await actor(developer,`/findings/${row.id}/source`).expect(404)
})

async function savedHealthFixture(githubId=11n, count=3, sourceSha=sha, createdAt=new Date()) {
  const repo=await db.gitHubRepository.findUniqueOrThrow({where:{githubId}})
  const report={version:1,mode:'EXECUTED',completeness:'PARTIAL',inspection:{complete:true,fileCount:5,languages:['typescript']},comparisonKey:'fixture',limits:[],analyses:[],findings:Array.from({length:count},(_,index)=>({
    fingerprint:digest(['fixture',index]), category:index%2?'reliability':'security',severity:index%2?'medium':'high',title:`Health issue ${index}`,ruleId:`rule-${index}`,checkId:index%2?'quality.reliability':'security.sast',path:'src/app.ts',line:index+1,endLine:index+1,suppressed:false,evidence:'ANALYZER_REPORTED'
  }))}
  return db.repositoryHealthAssessment.create({data:{repositoryId:repo.id,organizationId:githubId===21n?orgB:orgA,branch:'main',targetRevision:1,requestKey:randomUUID(),actorId:owner,state:'COMPLETED',sourceSha,report,createdAt,finishedAt:createdAt}})
}
it('unifies CI and Health results while keeping scoped source identities and filtered metrics',async()=>{
  const {assessment}=await complianceFixture()
  const plan={...(assessment.plan as any),checks:[...(assessment.plan as any).checks,{id:'security.sast',title:'CI security check',required:true,severity:'high',operator:'verified_check_succeeded',capability:'import_only',allowedSources:['verified_imported_ci']}]}
  const report={...(assessment.report as any),checks:[{ruleId:'ci',required:true,coverage:'MISSING'},{ruleId:'security.sast',title:'CI security check',required:true,providerResult:'FAILED',mappingTrust:'APPROVED_SOURCE_BINDING',freshness:'FRESH_AT_COLLECTION',ambiguous:false,superseded:false,deliveryId:'fixture-delivery',evidenceValidation:{version:2,observationIntegrity:true,sourceApproved:true}}],observations:[{deliveryId:'fixture-delivery',sourceSha:sha,result:'FAILED',sourceStatus:'completed',sourceKind:'check_run'}]}
  await db.commitAssessment.update({where:{id:assessment.id},data:{plan,report,assessmentHash:digest({request:assessment.request,plan,report})}})
  const health=await savedHealthFixture()
  await savedHealthFixture(12n,9)
  await savedHealthFixture(21n,9)
  const result=(await actor(developer,'/findings').expect(200)).body
  expect(result.rows).toHaveLength(4)
  expect(result.summary).toMatchObject({reportedIssues:4,evidenceGaps:1,affectedRepositories:1,criticalHigh:3})
  expect(result.assessedRevisions).toBe(1)
  expect(result.incompleteHealth).toBe(true)
  expect(result.rows.every((r:any)=>r.repositoryId==='11')).toBe(true)
  expect(new Set(result.rows.map((r:any)=>r.origin))).toEqual(new Set(['ci','health']))
  const row=result.rows.find((r:any)=>r.origin==='health')
  expect(row).toMatchObject({health:health.id,assessmentId:health.id,sourceSha:sha,path:'src/app.ts'})
  expect(row.id).not.toBe(row.healthFingerprint)
  expect((await actor(developer,'/findings?source=ci&kind=gaps').expect(200)).body).toMatchObject({total:1,summary:{reportedIssues:1,evidenceGaps:1}})
  const filtered=(await actor(developer,'/findings?source=health&category=reliability').expect(200)).body
  expect(filtered).toMatchObject({total:1,summary:{reportedIssues:1,criticalHigh:0,evidenceGaps:0}})
  expect(filtered.rows[0].category).toBe('reliability')
  expect((await actor(developer,'/findings?source=health&severity=high&q=issue%202').expect(200)).body.total).toBe(1)
  expect((await actor(developer,'/findings?source=health&triage=RESOLVED').expect(200)).body.total).toBe(0)
  await actor(developer,'/findings?source=invalid').expect(400)
  await actor(developer,'/findings?source=health&health=invalid&repository=11').expect(400)
  await actor(developer,`/findings?source=ci&health=${health.id}&repository=11`).expect(400)
  await actor(developer,'/findings?source=health&repository=12').expect(403)
  // The CI-specific mutation/details API cannot accept a Health list identity.
  await actor(owner,`/findings/${row.id}`).expect(404)
  await mutate(owner,`/findings/${row.id}/triage`,{state:'REPORTED',note:'',expectedRevision:0}).expect(404)
})
it('keeps the latest Health report per commit and supports exact-report links and pagination',async()=>{
  const prior=await savedHealthFixture(11n,2,sha,new Date('2026-10-01'))
  const latest=await savedHealthFixture(11n,60,sha,new Date('2026-10-02'))
  const other=await savedHealthFixture(11n,2,'b'.repeat(40),new Date('2026-10-03'))
  const denied=await savedHealthFixture(12n)
  const first=(await actor(developer,'/findings?source=health').expect(200)).body
  const next=(await actor(developer,'/findings?source=health&page=2').expect(200)).body
  expect(first.total).toBe(62)
  expect(first.rows).toHaveLength(10)
  expect(next.rows).toHaveLength(10)
  expect(first.summary).toEqual(next.summary)
  expect(first.summary.reportedIssues).toBe(62)
  expect(first.assessedRevisions).toBe(2)
  expect(first.rows[0].health).toBe(other.id)
  expect(first.rows.some((r:any)=>r.health===prior.id)).toBe(false)
  expect(first.rows.some((r:any)=>r.health===latest.id)).toBe(true)
  const exact=(await actor(developer,`/findings?origin=health&repository=11&health=${prior.id}`).expect(200)).body
  expect(exact.total).toBe(2)
  expect(exact.rows.every((r:any)=>r.health===prior.id)).toBe(true)
  await actor(developer,`/findings?source=health&repository=11&health=${denied.id}`).expect(404)
  // Revoking the repository grant removes both sources from the shared endpoint.
  await db.repositoryGrant.deleteMany({where:{membershipId:memberId}})
  expect((await actor(developer,'/findings').expect(200)).body.rows).toEqual([])
})
it('shows inspection-only exact reports without inventing findings or coverage',async()=>{
  const health=await savedHealthFixture(11n,0)
  await db.repositoryHealthAssessment.update({where:{id:health.id},data:{report:{...(health.report as any),mode:'INSPECTION_ONLY'}}})
  const exact=(await actor(developer,`/findings?source=health&repository=11&health=${health.id}&category=coverage&kind=gaps`).expect(200)).body
  expect(exact).toMatchObject({rows:[],total:0,inspectionOnly:true,incompleteHealth:true,truncated:false})
})

it('returns directory sparklines only from authorized scoped activity',async()=>{
 const response=await actor(developer,'/contributors?days=7').expect(200)
 expect(response.body.contributors).toHaveLength(1)
 const series=response.body.contributors[0].dailyActivity
 expect(series).toHaveLength(7)
 expect(series.reduce((sum:number,day:any)=>sum+day.count,0)).toBe(1)
 await actor(developer,'/contributors?repository=12').expect(403)
 const viewerResult=await actor(viewer,'/contributors?days=7').expect(200)
 if(!viewerResult.body.permissions.activity) expect(viewerResult.body.contributors.every((c:any)=>c.dailyActivity===null)).toBe(true)
})

it('includes committer-only activity in profile counts and chart without double-counting author/committer roles',async()=>{
 const contributor=await db.contributor.findFirstOrThrow({where:{githubUserId:'11',installationId:1n}})
 const observedAt=new Date()
 const observed=(relationship:'COMMIT_AUTHOR'|'COMMITTER',sourceObjectId:string)=>({actor:{githubUserId:'11',login:'person11',kind:'HUMAN' as const},relationship,sourceObjectId,sourceSha:sha,pullRequestNumber:null,action:'pushed',state:null,merged:false,observedAt})
 await captureContributors(db,randomUUID(),'committer-fixture',1n,11n,[observed('COMMITTER','commit-one'),observed('COMMITTER','commit-two')])
 const path=`/contributors/${contributor.id}?repository=11&days=30`
 const first=(await actor(developer,path).expect(200)).body
 expect(first.contributors[0].commits).toBe(2)
 expect(first.contributionActivity.reduce((total:number,day:any)=>total+day.commits,0)).toBe(2)
 expect(first.observations.filter((o:any)=>o.relationship==='COMMITTER')).toHaveLength(2)
 await captureContributors(db,randomUUID(),'author-fixture',1n,11n,[observed('COMMIT_AUTHOR','commit-one'),observed('COMMITTER','commit-one')])
 const both=(await actor(developer,path).expect(200)).body
 expect(both.contributors[0].commits).toBe(2)
 expect(both.contributionActivity.reduce((total:number,day:any)=>total+day.commits,0)).toBe(2)
 const onlyAuthor=(await actor(developer,path+'&relationship=COMMIT_AUTHOR').expect(200)).body
 expect(onlyAuthor.contributors[0].commits).toBe(1)
 const onlyCommitter=(await actor(developer,path+'&relationship=COMMITTER').expect(200)).body
 expect(onlyCommitter.contributors[0].commits).toBe(2)
 await actor(developer,`/contributors/${contributor.id}?repository=12`).expect(403)
})

it('automatically imports selected repositories without a browser request and exposes scoped progress', async () => {
  backfillObservations = [backfillPr(11)]
  const before = await actor(owner, '/contributors').expect(200)
  expect(before.body.sync.pending).toBeGreaterThan(0)
  await new ContributorSyncService(db, app.get(GitHubProviderService)).reconcile()
  expect(await db.contributorObservation.count({ where: { sourceObjectId: '999' } })).toBe(1)
  const repo = await db.gitHubRepository.findUniqueOrThrow({ where: { githubId: 11n } })
  expect(await db.contributorSyncState.findUnique({ where: { repositoryId: repo.id } })).toMatchObject({ state: 'SYNCED', leaseToken: null })
  const after = await actor(owner, '/contributors').expect(200)
  expect(after.body.sync.completed).toBe(1)
  expect(after.body.sync.items.every((item: {repositoryId: string}) => after.body.scope.some((repo: {githubId: string}) => repo.githubId === item.repositoryId))).toBe(true)
})
it('fences concurrent workers, retries upstream failures and avoids duplicate activity', async () => {
  backfillObservations = [backfillPr(11)]
  const sync = new ContributorSyncService(db, app.get(GitHubProviderService))
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  let started!: () => void
  const beginning = new Promise<void>(resolve => { started = resolve })
  beforeBackfill = async () => { started(); await blocked }
  const first = sync.reconcile()
  await beginning
  const held = await db.contributorSyncState.findFirstOrThrow({where:{state:'RUNNING'}})
  // A competing tick may work on another selected repository; it cannot steal this lease.
  const candidate = new ContributorSyncService(db, {readContributorBackfill: async () => ({observations:[],truncated:false,limits:{}})} as never)
  await candidate.reconcile()
  expect((await db.contributorSyncState.findUniqueOrThrow({where:{repositoryId:held.repositoryId}})).leaseToken).toBe(held.leaseToken)
  release(); await first
  const count=await db.contributorObservation.count({where:{sourceObjectId:'999'}})
  await db.contributorSyncState.update({where:{repositoryId:held.repositoryId},data:{state:'QUEUED',nextAttemptAt:new Date(0)}})
  await sync.reconcile()
  expect(await db.contributorObservation.count({where:{sourceObjectId:'999'}})).toBe(count)
})
it('does not ingest when selection is revoked during an automatic import', async () => {
  backfillObservations = [backfillPr(11)]
  beforeBackfill = async () => { await db.gitHubRepository.updateMany({where:{githubId:11n},data:{selected:false}}) }
  await new ContributorSyncService(db, app.get(GitHubProviderService)).reconcile()
  expect(await db.contributorObservation.count({where:{sourceObjectId:'999'}})).toBe(0)
  expect(await db.contributorSyncState.findFirst({where:{failureCode:'ACCESS_CHANGED'}})).toBeTruthy()
})
it('persists retry timing and recovers expired leases after worker interruption', async () => {
  const github = {readContributorBackfill: async () => { throw new Error('unavailable') }}
  const sync = new ContributorSyncService(db, github as never)
  await sync.reconcile()
  const job=await db.contributorSyncState.findFirstOrThrow({where:{state:'RETRY'}})
  expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  await db.contributorSyncState.update({where:{repositoryId:job.repositoryId},data:{state:'RUNNING',leaseToken:'old',leaseUntil:new Date(0),nextAttemptAt:new Date(0)}})
  await new ContributorSyncService(db,{readContributorBackfill:async()=>({observations:[],truncated:true,limits:{}})} as never).reconcile()
  expect(await db.contributorSyncState.findUnique({where:{repositoryId:job.repositoryId}})).toMatchObject({state:'PARTIAL',truncated:true,leaseToken:null})
})

it('honors GitHub retry timing and stops repeated non-rate-limit failures', async () => {
 const { GitHubRateLimitError }=await import('../src/github/github-rate-limit.js')
 const limited=new ContributorSyncService(db,{readContributorBackfill:async()=>{throw new GitHubRateLimitError(120000)}} as never)
 await limited.reconcile()
 const job=await db.contributorSyncState.findFirstOrThrow({where:{state:'RETRY'}})
 expect(job.failureCode).toBe('GITHUB_RATE_LIMITED')
 expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now()+110000)
 await db.contributorSyncState.update({where:{repositoryId:job.repositoryId},data:{state:'QUEUED',attempts:4,nextAttemptAt:new Date(0)}})
 await new ContributorSyncService(db,{readContributorBackfill:async()=>{throw new Error('offline')}} as never).reconcile()
 expect(await db.contributorSyncState.findUnique({where:{repositoryId:job.repositoryId}})).toMatchObject({state:'FAILED',attempts:5,failureCode:'IMPORT_FAILED'})
})

it('authorizes finding ignore HTTP routes, preserves read-only access and enforces mutation scope',async()=>{
 const health=await savedHealthFixture()
 const fingerprint=(health.report as any).findings[0].fingerprint
 const path=`/findings/${fingerprint}/ignore?origin=health&repository=11&assessment=${health.id}`
 await request(app.getHttpServer()).get(path).expect(401)
 const read=await actor(developer,path).expect(200)
 expect(read.body).toMatchObject({state:'OPEN',canManage:false,eligible:true})
 await mutate(developer,path,{state:'IGNORED',reason:'Reviewed',expectedRevision:0}).expect(403)
 await request(app.getHttpServer()).post(path).set('Cookie',`scope.sid=${owner}`).set('Origin','https://untrusted.example').send({state:'IGNORED',reason:'Reviewed',expectedRevision:0}).expect(403)
 await mutate(owner,path,{state:'IGNORED',reason:'Intentional duplication',expectedRevision:0}).expect(201)
 expect((await actor(developer,path).expect(200)).body.state).toBe('IGNORED')
 await mutate(owner,path,{state:'OPEN',reason:'Review again',expectedRevision:1}).expect(201)
 expect((await actor(owner,path).expect(200)).body.state).toBe('OPEN')
 const other=await savedHealthFixture(21n)
 await actor(owner,`/findings/${fingerprint}/ignore?origin=health&repository=21&assessment=${other.id}`).expect(403)
 await db.gitHubRepository.update({where:{githubId:11n},data:{selected:false}})
 await actor(owner,path).expect(403)
})

it('allows an admin to preserve or remove existing unavailable assignments while rejecting new unavailable grants', async () => {
  await db.organizationMembership.create({data:{organizationId:orgA,identityId:platform,role:'ADMIN'}})
  await db.gitHubRepository.updateMany({where:{githubId:{in:[11n,12n]}},data:{available:false}})
  const edit = (repositoryIds:string[]) => request(app.getHttpServer()).patch(`/organizations/members/${memberId}`)
    .set('Cookie',`scope.sid=${platform}`).set('Origin',origin)
    .send({subject:'developer',role:'DEVELOPER',active:true,repositoryIds})
  await edit(['11']).expect(200)
  await edit(['11','12']).expect(403)
  expect(await db.repositoryGrant.count({where:{membershipId:memberId}})).toBe(1)
  await edit([]).expect(200)
  expect(await db.repositoryGrant.count({where:{membershipId:memberId}})).toBe(0)
  await edit(['11']).expect(403)
})
it('lets Engineering Lead add repositories and author skills/standards without admin, approval or unassigned evidence rights', async () => {
  await db.organizationMembership.update({where:{id:memberId},data:{role:'ENGINEERING_LEAD'}})
  const session = {authenticated:true,identityId:developer,organizationId:orgA,role:'ENGINEERING_LEAD'} as any
  const context = (await actor(developer,'/organizations/access').expect(200)).body
  expect(context.permissions).toEqual(expect.arrayContaining(['repository.connect','repository.manage','ai.skills.manage','standards.manage','policy.draft']))
  for(const permission of ['organization.members.manage','ai.skills.approve','policy.publish','ai.provider.manage'])
    expect(context.permissions).not.toContain(permission)
  for(const path of ['/ai/skills','/standards/library'])
    await expect(access.authorizeRequest({method:'POST',path} as any,session)).resolves.toBe(true)
  await actor(developer,'/github/repositories/12/events').expect(403)
  expect((await actor(developer,'/github/repositories').expect(200)).body.repositories.map((r:any)=>r.githubId)).toEqual(['11'])
  expect((await actor(developer,'/github/repositories/overview').expect(200)).body.repositories.map((r:any)=>r.githubId)).toEqual(['11'])
  const available=(await actor(developer,'/github/repositories/available').expect(200)).body.repositories
  expect(available).toEqual([{githubId:'12',fullName:'fixture/repo12'}])
  await request(app.getHttpServer()).patch('/github/repositories/12/selection')
    .set('Cookie',`scope.sid=${developer}`).set('Origin',origin).send({selected:true}).expect(200)
  await actor(developer,'/github/repositories/12/events').expect(200)
  expect((await actor(developer,'/github/repositories').expect(200)).body.repositories.map((r:any)=>r.githubId)).toEqual(['11','12'])
  await request(app.getHttpServer()).patch('/github/repositories/21/selection')
    .set('Cookie',`scope.sid=${developer}`).set('Origin',origin).send({selected:true}).expect(403)
  expect(await db.auditEvent.count({where:{event:'repository_selection_access_granted'}})).toBe(1)
  await db.organizationMembership.update({where:{id:memberId},data:{role:'DEVELOPER'}})
  await actor(developer,'/github/repositories/available').expect(403)
  await request(app.getHttpServer()).patch('/github/repositories/12/selection')
    .set('Cookie',`scope.sid=${developer}`).set('Origin',origin).send({selected:false}).expect(403)
})
