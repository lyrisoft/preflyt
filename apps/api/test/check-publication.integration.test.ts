import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { NestFactory } from '@nestjs/core'
import {
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { GitHubUserAccessService } from '../src/auth/github-user-access.service.js'
import { SessionGuard } from '../src/auth/session.guard.js'
import { CheckPublicationController } from '../src/assessments/check-publication.controller.js'
import { CheckPublicationService } from '../src/assessments/check-publication.service.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { digest } from '../src/assessments/assessment-digest.js'
const name = 'preflyt_publication_test_' + randomUUID().replaceAll('-', '')
const origin = 'http://localhost:5173',
  base = '/github/repositories/51/check-publications'
let admin: Client,
  db: PrismaService,
  app: INestApplication,
  created = false
let organizationId: string,
  repositoryId: string,
  selectionId: string,
  author: string,
  viewer: string,
  outsider: string
const userAccess = { repositoryIds: vi.fn(async () => [51n]) }
const sha = 'a'.repeat(40)
const context = {
  version: 1,
  head: { repositoryId: '51', ref: 'feature', sha },
  base: { repositoryId: '51', ref: 'development', sha: 'b'.repeat(40) },
  state: 'open',
  draft: false,
  merged: false,
}
const github = {
  readPullRequest: vi.fn(),
  checkPublicationAccess: vi.fn(),
  publishReadinessCheck: vi.fn(),
}
let assessmentId: string
const receipt = {
  checkRunId: '123',
  appId: '999',
  htmlUrl: 'https://github.com/fixture/repo/runs/123',
}
const body = (extra: Record<string, unknown> = {}) => ({
  prNumber: 7,
  assessmentId,
  expectedPreviewHash: '0'.repeat(64),
  ...extra,
})
const post = (actor: string, path = base, value = body()) =>
  request(app.getHttpServer())
    .post(path)
    .set('Cookie', 'draft.sid=' + actor)
    .set('Origin', origin)
    .send(value)
const get = (actor: string, path = base) =>
  request(app.getHttpServer())
    .get(path)
    .set('Cookie', 'draft.sid=' + actor)
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Local PostgreSQL required')
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
  app = await NestFactory.create(
    {
      module: class DraftTest {},
      controllers: [CheckPublicationController],
      providers: [
        SessionGuard,
        AuthorizationService,
        CheckPublicationService,
        AssessmentService,
        { provide: GitHubProviderService, useValue: github },
        { provide: PrismaService, useValue: db },
        { provide: GitHubUserAccessService, useValue: userAccess },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: 'draft.sid',
            assertOrigin: (value: string) => {
              if (value !== origin) throw new ForbiddenException()
            },
            currentSession: async (identityId?: string) =>
              identityId
                ? {
                    authenticated: true,
                    identityId,
                    subject: 'fixture',
                    email: null,
                    role: 'SUPER_ADMIN',
                    organizationId,
                  }
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
}, 30000)
afterAll(async () => {
  await app?.close()
  await db?.$disconnect()
  if (created) await admin?.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin?.end()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  await db.gitHubRepository.deleteMany()
  await db.gitHubInstallation.deleteMany()
  await db.organization.deleteMany()
  await db.identity.deleteMany()
  await db.auditEvent.deleteMany()
  vi.stubEnv('GITHUB_CHECK_PUBLICATION_ENABLED', 'true')
  userAccess.repositoryIds.mockResolvedValue([51n])
  github.readPullRequest.mockResolvedValue({
    context: structuredClone(context),
    sourceObjectId: '99',
  })
  github.checkPublicationAccess.mockResolvedValue({ appId: '999' })
  github.publishReadinessCheck.mockReset().mockResolvedValue(receipt)
  organizationId = (await db.organization.create({ data: { name: 'fixture' } }))
    .id
  const foreignOrg = (
    await db.organization.create({ data: { name: 'foreign' } })
  ).id
  const actors = []
  for (const [subject, role, org] of [
    ['author', 'POLICY_MANAGER', organizationId],
    ['viewer', 'VIEWER', organizationId],
    ['outsider', 'OWNER', foreignOrg],
  ] as const) {
    const identity = await db.identity.create({
      data: { issuer: 'fixture', subject },
    })
    actors.push(identity.id)
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId: org, role },
    })
  }
  ;[author, viewer, outsider] = actors
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: author,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      organizationId,
    },
  })
  repositoryId = (
    await db.gitHubRepository.create({
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
  ).id
  for (const identityId of [author, viewer]) {
    const member = await db.organizationMembership.findUniqueOrThrow({
      where: { organizationId_identityId: { organizationId, identityId } },
    })
    await db.repositoryGrant.create({
      data: { membershipId: member.id, repositoryId },
    })
  }
  selectionId = (
    await db.repositoryStandardsSelection.create({
      data: {
        repositoryId,
        revision: 1,
        profile: 'RECOMMENDED',
        packs: [{ id: 'baseline', version: '1.0.0', digest: 'fixture' }],
        selectedById: author,
      },
    })
  ).id
  const requestData = {
    sourceSha: sha,
    installationId: '50',
    subjectKind: 'COMMIT',
    profileSnapshot: { sourceSha: sha, complete: true },
    sourceBindings: null,
  }
  const plan = {
    version: 1,
    sourceSha: sha,
    enforcement: 'observe',
    mode: 'INGEST_ONLY',
    stage: 'ci',
    checks: [
      {
        id: 'ci.configured',
        required: true,
        operator: 'configuration_hint_present',
        capability: 'available',
      },
    ],
  }
  const report = {
    version: 1,
    sourceSha: sha,
    collectionTruncated: false,
    validationCollectionTruncated: false,
    checks: [
      {
        ruleId: 'ci.configured',
        title: 'CI configuration',
        required: true,
        coverage: 'CONFIGURATION_OBSERVED',
        configurationEvidence: [
          { path: '.github/workflows/ci.yml', blobSha: 'c'.repeat(40) },
        ],
      },
    ],
  }
  assessmentId = (
    await db.commitAssessment.create({
      data: {
        repositoryId,
        sourceSha: sha,
        selectionId,
        requestKey: randomUUID(),
        inputHash: 'd'.repeat(64),
        request: requestData,
        plan,
        report,
        assessmentHash: digest({ request: requestData, plan, report }),
      },
    })
  ).id
})
const preview = async () =>
  (
    await get(
      author,
      `${base}/preview?pr=7&assessmentId=${assessmentId}`,
    ).expect(200)
  ).body
it('publishes only the reviewed non-passing conclusion, audits and deduplicates repeated requests', async () => {
  const view = await preview()
  expect(view).toMatchObject({
    conclusion: 'action_required',
    gateStatus: 'PASS',
    appId: '999',
    activationAvailable: false,
  })
  expect(await db.gitHubCheckPublication.count()).toBe(0)
  const published = (
    await post(
      author,
      base,
      body({ expectedPreviewHash: view.previewHash }),
    ).expect(201)
  ).body
  expect(published).toMatchObject({ state: 'PUBLISHED', ...receipt })
  expect(published).not.toHaveProperty('leaseToken')
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(201)
  expect(github.publishReadinessCheck).toHaveBeenCalledTimes(1)
  expect(github.publishReadinessCheck.mock.calls[0][2]).toMatchObject({
    head_sha: sha,
    conclusion: 'action_required',
  })
  expect(
    await db.auditEvent.count({
      where: { event: { startsWith: 'github.check_publication_' } },
    }),
  ).toBe(2)
})
it('enforces origin, scoped publishing roles, upstream access and DTO allowlisting', async () => {
  const view = await preview()
  await post(
    viewer,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(403)
  await post(
    outsider,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(403)
  await post(author, base, body({ conclusion: 'success' })).expect(400)
  await request(app.getHttpServer())
    .post(base)
    .set('Cookie', 'draft.sid=' + author)
    .set('Origin', 'https://foreign.test')
    .send(body())
    .expect(403)
  userAccess.repositoryIds.mockResolvedValue([])
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(403)
  expect(github.publishReadinessCheck).not.toHaveBeenCalled()
})
it('rejects disabled publishing, outdated previews, changed PR heads and obsolete assessments', async () => {
  const view = await preview()
  vi.stubEnv('GITHUB_CHECK_PUBLICATION_ENABLED', 'false')
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(503)
  vi.stubEnv('GITHUB_CHECK_PUBLICATION_ENABLED', 'true')
  await post(author).expect(409)
  github.readPullRequest.mockResolvedValue({
    context: { ...context, head: { ...context.head, sha: 'f'.repeat(40) } },
    sourceObjectId: '99',
  })
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(409)
  github.readPullRequest.mockResolvedValue({ context, sourceObjectId: '99' })
  await db.repositoryStandardsSelection.create({
    data: {
      repositoryId,
      revision: 2,
      profile: 'STRICT',
      packs: [],
      selectedById: author,
    },
  })
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(409)
  expect(github.publishReadinessCheck).not.toHaveBeenCalled()
})
it.each(['closed', 'draft', 'fork'])(
  'rejects %s PR context before requesting a check',
  async (kind) => {
    github.readPullRequest.mockResolvedValue({
      context: {
        ...context,
        ...(kind === 'closed'
          ? { state: 'closed' }
          : kind === 'draft'
            ? { draft: true }
            : { head: { ...context.head, repositoryId: '52' } }),
      },
      sourceObjectId: '99',
    })
    await get(
      author,
      `${base}/preview?pr=7&assessmentId=${assessmentId}`,
    ).expect(409)
    expect(github.publishReadinessCheck).not.toHaveBeenCalled()
  },
)
it('keeps ambiguous outcomes recoverable without recording them as verified', async () => {
  const view = await preview()
  github.publishReadinessCheck.mockRejectedValueOnce(
    new Error('timeout after create'),
  )
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(503)
  const rows = (await get(viewer).expect(200)).body.publications
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ state: 'UNKNOWN', verifiedAt: null })
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(201)
  expect(await db.gitHubCheckPublication.count()).toBe(1)
})
it('serializes simultaneous publication requests across durable leases', async () => {
  const view = await preview()
  let complete!: (value: typeof receipt) => void
  github.publishReadinessCheck.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const first = post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).then((result) => result)
  for (let i = 0; i < 100 && !complete; i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  expect(complete).toBeTypeOf('function')
  await post(
    author,
    base,
    body({ expectedPreviewHash: view.previewHash }),
  ).expect(409)
  complete(receipt)
  expect((await first).status).toBe(201)
  expect(github.publishReadinessCheck).toHaveBeenCalledTimes(1)
})

it('combines manual and automatic checks into the latest row per PR with scoped pagination', async () => {
  await db.gitHubCheckPublication.create({ data: {
    id: 'older-manual', repositoryId, organizationId, assessmentId,
    prNumber: 7, sourceSha: sha, installationId: '50', previewHash: 'a'.repeat(64),
    conclusion: 'success', state: 'PUBLISHED', leaseToken: 'private-lease', actorId: author,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } })
  await db.readinessTask.createMany({ data: Array.from({ length: 21 }, (_, index) => ({
    id: `automatic-${index}`, repositoryId, prNumber: index + 7,
    assessmentId, sourceSha: sha, branchRef: 'refs/heads/development',
    state: index === 0 ? 'UNKNOWN' : 'PUBLISHED', conclusion: 'success',
    leaseToken: 'private-automation-lease',
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  })) })
  const first = (await get(viewer, `${base}/results?page=1`).expect(200)).body
  expect(first.publications).toHaveLength(20)
  expect(first.hasMore).toBe(true)
  const second = (await get(viewer, `${base}/results?page=2`).expect(200)).body
  expect(second.publications).toHaveLength(1)
  expect(second.hasMore).toBe(false)
  const rows = [...first.publications, ...second.publications]
  expect(new Set(rows.map((row: any) => row.prNumber)).size).toBe(21)
  expect(rows.find((row: any) => row.prNumber === 7)).toMatchObject({ id: 'automatic-0', state: 'UNKNOWN', branchRef: 'refs/heads/development' })
  expect(JSON.stringify(rows)).not.toContain('private-')
  expect(rows.some((row: any) => row.id === 'older-manual')).toBe(false)
  await get(outsider, `${base}/results`).expect(403)
  await get(viewer, `${base}/results?page=0`).expect(400)
})
