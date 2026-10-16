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
import { RulesetDraftController } from '../src/github/ruleset-draft.controller.js'
import { RulesetDraftService } from '../src/github/ruleset-draft.service.js'
const name = 'preflyt_ruleset_test_' + randomUUID().replaceAll('-', '')
const origin = 'http://localhost:5173',
  base = '/github/repositories/51/ruleset-drafts'
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
const body = (extra: Record<string, unknown> = {}) => ({
  name: 'Development protection',
  profile: 'STANDARD',
  branches: ['development'],
  approvals: 1,
  requirePullRequest: true,
  resolveConversations: false,
  preventForcePush: true,
  preventDeletion: true,
  expectedSelectionId: selectionId,
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
      controllers: [RulesetDraftController],
      providers: [
        SessionGuard,
        AuthorizationService,
        RulesetDraftService,
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
  userAccess.repositoryIds.mockResolvedValue([51n])
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
})
it('persists disabled drafts, freezes pack versions, and audits edits', async () => {
  const draft = (await post(author).expect(201)).body
  expect(draft).toMatchObject({
    revision: 1,
    selectionId,
    definition: { enforcement: 'disabled' },
    packs: [{ version: '1.0.0' }],
  })
  const edited = (
    await post(
      author,
      `${base}/${draft.id}/edit`,
      body({ name: 'Updated draft', expectedHash: draft.definitionHash }),
    ).expect(201)
  ).body
  expect(edited).toMatchObject({ revision: 2, name: 'Updated draft' })
  expect(edited.options).not.toHaveProperty('expectedHash')
  expect((await get(viewer).expect(200)).body).toMatchObject({
    activationAvailable: false,
    drafts: [{ id: draft.id, revision: 2 }],
  })
  expect(
    await db.auditEvent.count({
      where: {
        event: {
          in: ['github.ruleset_draft_created', 'github.ruleset_draft_updated'],
        },
      },
    }),
  ).toBe(2)
})
it('denies anonymous, read-only, foreign and unassigned actors and revoked GitHub repository access', async () => {
  await request(app.getHttpServer()).get(base).expect(401)
  await post(viewer).expect(403)
  await post(outsider).expect(403)
  userAccess.repositoryIds.mockResolvedValue([])
  await post(author).expect(403)
  userAccess.repositoryIds.mockResolvedValue([51n])
  await db.repositoryGrant.deleteMany()
  await post(author).expect(403)
  expect(await db.gitHubRulesetDraft.count()).toBe(0)
})
it('rejects injected activation, bypass, malformed controls and foreign origins in the development runtime', async () => {
  for (const extra of [
    { enforcement: 'active' },
    { bypass_actors: [{ actor_type: 'OrganizationAdmin' }] },
    { approvals: '2' },
    { requirePullRequest: 'true' },
    { branches: ['*'] },
  ])
    await post(author, base, body(extra)).expect(400)
  await request(app.getHttpServer())
    .post(base)
    .set('Cookie', 'draft.sid=' + author)
    .set('Origin', 'https://foreign.test')
    .send(body())
    .expect(403)
  expect(await db.gitHubRulesetDraft.count()).toBe(0)
})
it('rejects stale standards and optimistic edit conflicts without losing the saved draft', async () => {
  const draft = (await post(author).expect(201)).body
  await post(
    author,
    `${base}/${draft.id}/edit`,
    body({ expectedHash: 'f'.repeat(64) }),
  ).expect(409)
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
    `${base}/${draft.id}/edit`,
    body({ expectedHash: draft.definitionHash }),
  ).expect(409)
  expect(
    await db.gitHubRulesetDraft.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ revision: 1, selectionId })
})
it('allows only one of two concurrent edits of the same version to commit', async () => {
  const draft = (await post(author).expect(201)).body
  const results = await Promise.all([
    post(
      author,
      `${base}/${draft.id}/edit`,
      body({ name: 'First', expectedHash: draft.definitionHash }),
    ),
    post(
      author,
      `${base}/${draft.id}/edit`,
      body({ name: 'Second', expectedHash: draft.definitionHash }),
    ),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([201, 409])
  expect(
    await db.gitHubRulesetDraft.findUnique({ where: { id: draft.id } }),
  ).toMatchObject({ revision: 2 })
})
it('paginates drafts and rejects a draft belonging to another repository', async () => {
  const draft = (await post(author).expect(201)).body
  const data = await db.gitHubRulesetDraft.findUniqueOrThrow({
    where: { id: draft.id },
  })
  for (let i = 0; i < 21; i++)
    await db.gitHubRulesetDraft.create({
      data: { ...data, id: undefined, name: 'Additional ' + i },
    })
  expect((await get(viewer).expect(200)).body).toMatchObject({
    hasMore: true,
    page: 1,
  })
  expect((await get(viewer).expect(200)).body.drafts).toHaveLength(10)
  expect((await get(viewer, base + '?page=3').expect(200)).body).toMatchObject({
    hasMore: false,
    page: 3,
    drafts: expect.any(Array),
  })
  await get(viewer, base + '?page=0').expect(400)
  const otherRepository = await db.gitHubRepository.create({
    data: {
      githubId: 52n,
      installationId: 50n,
      name: 'other',
      fullName: 'fixture/other',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: true,
    },
  })
  const foreignDraft = await db.gitHubRulesetDraft.create({
    data: { ...data, id: undefined, repositoryId: otherRepository.id },
  })
  await post(
    author,
    `${base}/${foreignDraft.id}/edit`,
    body({ expectedHash: draft.definitionHash }),
  ).expect(404)

  await post(
    author,
    `${base}/unavailable/edit`,
    body({ expectedHash: draft.definitionHash }),
  ).expect(404)
})

it('previews the exact saved definition without writing drafts or audit events', async () => {
  const preview = (await post(author, base + '/preview').expect(201)).body
  expect(preview).toMatchObject({
    activationAvailable: false,
    checkSourceVerified: false,
    selection: { id: selectionId },
  })
  expect(await db.gitHubRulesetDraft.count()).toBe(0)
  expect(await db.auditEvent.count()).toBe(0)
  const saved = (await post(author).expect(201)).body
  expect(saved.definition).toEqual(preview.definition)
  expect(saved.definitionHash).toEqual(preview.definitionHash)
})
it('protects preview scope, origin and schema and rejects outdated standards', async () => {
  await post(viewer, base + '/preview').expect(403)
  await post(outsider, base + '/preview').expect(403)
  await post(author, base + '/preview', body({ enforcement: 'active' })).expect(
    400,
  )
  await post(
    author,
    base + '/preview',
    body({ expectedSelectionId: 'outdated' }),
  ).expect(409)
  await request(app.getHttpServer())
    .post(base + '/preview')
    .set('Cookie', 'draft.sid=' + author)
    .set('Origin', 'https://foreign.test')
    .send(body())
    .expect(403)
  userAccess.repositoryIds.mockResolvedValue([])
  await post(author, base + '/preview').expect(403)
  expect(await db.gitHubRulesetDraft.count()).toBe(0)
})

it('reloads a draft by ID after its list position changes and keeps the read scoped', async () => {
  const draft = (await post(author).expect(201)).body
  const current = (await get(viewer, base + '/' + draft.id).expect(200)).body
  expect(current).toMatchObject({
    draft: { id: draft.id, revision: 1 },
    selection: { id: selectionId },
  })
  await get(outsider, base + '/' + draft.id).expect(403)
  await get(viewer, base + '/unavailable').expect(404)
  const foreignRepository = await db.gitHubRepository.create({
    data: {
      githubId: 52n,
      installationId: 50n,
      name: 'other',
      fullName: 'fixture/other',
      ownerLogin: 'fixture',
      isPrivate: true,
    },
  })
  await db.gitHubRulesetDraft.update({
    where: { id: draft.id },
    data: { repositoryId: foreignRepository.id },
  })
  await get(viewer, base + '/' + draft.id).expect(404)
})
