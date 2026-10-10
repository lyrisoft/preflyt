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
 await mutate(owner,'/contributors/repositories/11/sync',{}).expect(201)
 await mutate(owner,'/contributors/repositories/11/sync',{}).expect(429)
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
  const response = await mutate(owner, '/contributors/repositories/11/sync', {}).expect(201)
  expect(response.body.importedRecords).toBe(1)
  expect(await db.contributorObservation.count({ where: { sourceObjectId: '999' } })).toBe(1)
})
it('does not report success when upstream activity belongs to an unselected repository', async () => {
  backfillObservations = [backfillPr(99)]
  await mutate(owner, '/contributors/repositories/11/sync', {}).expect(403)
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
  await actor(developer, '/findings?page=0').expect(400)
  const report = { ...(assessment.report as any), checks: [{ ruleId: 'ci', required: true, coverage: 'MISSING' }] }
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { report, assessmentHash: digest({ request: assessment.request, plan: assessment.plan, report }) } })
  const gaps = await actor(developer, '/findings?kind=gaps').expect(200)
  expect(gaps.body.rows).toHaveLength(1)
  expect(gaps.body.rows[0]).toMatchObject({ status: 'Evidence missing', sourceSha: sha, assessmentId: assessment.id, repositoryId: '11' })
  await db.commitAssessment.update({ where: { id: assessment.id }, data: { assessmentHash: 'tampered' } })
  await actor(developer, '/findings').expect(409)
})
