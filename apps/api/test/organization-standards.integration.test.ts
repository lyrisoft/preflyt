import { skillTemplates, skillDigest } from '../src/intelligence/review-skills.js'
import { buildAssessment } from '../src/assessments/assessment-plan.js'
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
import http from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../src/auth/session.guard.js'
import { OrganizationStandardsController } from '../src/standards/organization-standards.controller.js'
import { OrganizationStandardsService } from '../src/standards/organization-standards.service.js'
import { StandardsController } from '../src/standards/standards.controller.js'
import { StandardsService } from '../src/standards/standards.service.js'
import { composeGatePolicy } from '../src/assessments/gate-policy.service.js'
import { resolvePacks, catalogue } from '../src/standards/catalogue.js'
import type { GitHubRepository } from '../src/generated/prisma/client.js'
let db: PrismaService,
  admin: Client,
  created = false,
  app: INestApplication,
  repo: GitHubRepository,
  org: string,
  owner: AuthenticatedSession,
  developer: AuthenticatedSession,
  outsider: AuthenticatedSession,
  service: OrganizationStandardsService
const name = 'preflyt_standard_test_' + randomUUID().replaceAll('-', '')
const root = '/standards/library'
const get = (actor = owner, path = root) =>
  http(app.getHttpServer())
    .get(path)
    .set('Cookie', `native.sid=${actor.identityId}`)
const post = (actor: AuthenticatedSession, path: string, body: unknown) =>
  http(app.getHttpServer())
    .post(path)
    .set('Cookie', `native.sid=${actor.identityId}`)
    .set('Origin', 'http://localhost:5173')
    .send(body)
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Local disposable database required')
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
  const access = new AuthorizationService(db)
  service = new OrganizationStandardsService(db, access)
  app = await NestFactory.create(
    {
      module: class NativeTest {},
      controllers: [OrganizationStandardsController, StandardsController],
      providers: [
        SessionGuard,
        { provide: OrganizationStandardsService, useValue: service },
        { provide: StandardsService, useValue: new StandardsService(db) },
        { provide: AuthorizationService, useValue: access },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: 'native.sid',
            assertOrigin: (origin: string) => {
              if (origin !== 'http://localhost:5173')
                throw new ForbiddenException('Invalid origin')
            },
            currentSession: async (id?: string) =>
              [owner, developer, outsider].find(
                (a) => a?.identityId === id,
              ) ?? { authenticated: false },
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
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin?.end()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('NATIVE_TOOL_REVIEWS', '[]')
  await db.organizationStandardVersion.deleteMany()
  await db.gitHubRepository.deleteMany()
  await db.gitHubInstallation.deleteMany()
  await db.aiReviewSkill.deleteMany()
  await db.organization.deleteMany()
  await db.identity.deleteMany()
  await db.auditEvent.deleteMany()
  org = (await db.organization.create({ data: { name: 'native fixture' } })).id
  const make = async (
    subject: string,
    role: 'OWNER' | 'DEVELOPER',
    organizationId = org,
  ) => {
    const identity = await db.identity.create({
      data: { issuer: 'fixture', subject },
    })
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId, role },
    })
    return {
      authenticated: true as const,
      identityId: identity.id,
      subject,
      email: null,
      role,
      organizationId,
    }
  }
  owner = await make('owner', 'OWNER')
  developer = await make('developer', 'DEVELOPER')
  outsider = await make(
    'outsider',
    'OWNER',
    (await db.organization.create({ data: { name: 'other fixture' } })).id,
  )
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: owner.identityId,
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      organizationId: org,
    },
  })
  repo = await db.gitHubRepository.create({
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
  const membership = await db.organizationMembership.findFirstOrThrow({
    where: { identityId: developer.identityId },
  })
  await db.repositoryGrant.create({
    data: { repositoryId: repo.id, membershipId: membership.id },
  })
  await db.repositoryProfile.create({
    data: {
      repositoryId: repo.id,
      sourceSha: 'a'.repeat(40),
      treeSha: 'b'.repeat(40),
      branch: 'main',
      fullName: repo.fullName,
      version: 1,
      complete: true,
      report: {},
    },
  })
  await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repo.id,
      revision: 1,
      profile: 'RECOMMENDED',
      packs: [{ id: 'baseline-engineering', version: '1.0.0' }],
      selectedById: owner.identityId,
    },
  })
})

const input = {
  title: 'Team baseline',
  description: 'Checks for our services',
  ruleIds: ['ci.configured', 'tests.required'],
  expectedVersionId: null,
}
it('creates organization-scoped versioned standards and audits them', async () => {
  const result = (await post(owner, root, input).expect(201)).body
  expect(result.revision).toBe(1)
  const library = (await get().expect(200)).body
  expect(library.versions[0].title).toBe(input.title)
  expect(library.versions[0].digest).toBe(result.digest)
  expect((await get(outsider).expect(200)).body.versions).toHaveLength(0)
  expect(
    await db.auditEvent.count({ where: { event: 'standards.created' } }),
  ).toBe(1)
})
it('denies developers, missing sessions and invalid origin', async () => {
  await post(developer, root, input).expect(403)
  await http(app.getHttpServer()).get(root).expect(401)
  await http(app.getHttpServer())
    .post(root)
    .set('Cookie', `native.sid=${owner.identityId}`)
    .set('Origin', 'https://attacker.invalid')
    .send(input)
    .expect(403)
})
it('rejects arbitrary check types, commands and empty or duplicate rules', async () => {
  for (const patch of [
    { ruleIds: ['shell.custom'] },
    { command: 'sh' },
    { ruleIds: [] },
    { ruleIds: ['ci.configured', 'ci.configured'] },
    { title: '   ' },
  ])
    await post(owner, root, { ...input, ...patch }).expect(400)
  expect(await db.organizationStandardVersion.count()).toBe(0)
})
it('edits by adding a version without changing previous definitions or policies', async () => {
  const first = (await post(owner, root, input).expect(201)).body
  const second = (
    await post(owner, `${root}/${first.packId}/versions`, {
      ...input,
      title: 'Updated baseline',
      ruleIds: ['ci.configured'],
      expectedVersionId: first.id,
    }).expect(201)
  ).body
  expect(second.revision).toBe(2)
  expect(
    (
      await db.organizationStandardVersion.findUniqueOrThrow({
        where: { id: first.id },
      })
    ).digest,
  ).toBe(first.digest)
  await post(owner, `${root}/${first.packId}/versions`, {
    ...input,
    expectedVersionId: first.id,
  }).expect(409)
  await post(outsider, `${root}/${first.packId}/versions`, {
    ...input,
    expectedVersionId: second.id,
  }).expect(409)
})
it('serializes conflicting edits and returns a useful conflict', async () => {
  const first = (await post(owner, root, input).expect(201)).body
  const responses = await Promise.all([
    post(owner, `${root}/${first.packId}/versions`, {
      ...input,
      title: 'A',
      expectedVersionId: first.id,
    }),
    post(owner, `${root}/${first.packId}/versions`, {
      ...input,
      title: 'B',
      expectedVersionId: first.id,
    }),
  ])
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
  expect(await db.organizationStandardVersion.count()).toBe(2)
})
it('adopts a verified complete definition and preserves it after library edits', async () => {
  const first = (await post(owner, root, input).expect(201)).body
  const previous = await db.repositoryStandardsSelection.findFirstOrThrow({
    where: { repositoryId: repo.id },
  })
  const selected = (
    await post(owner, '/github/repositories/51/standards', {
      profile: 'RECOMMENDED',
      packs: [{ id: first.packId, version: '1.0.1' }],
      expectedSelectionId: previous.id,
    }).expect(201)
  ).body
  const resolved = resolvePacks(selected.packs)
  expect(resolved[0]?.title).toBe(input.title)
  const frozen = composeGatePolicy(selected, 'refs/heads/main', [])
  const assessmentInput = {
    sourceSha: 'a'.repeat(40),
    profile: 'RECOMMENDED' as const,
    packs: selected.packs,
    signals: [],
    profileCreatedAt: null,
    mappings: [],
    observations: [],
    at: new Date('2026-10-09T00:00:00Z'),
    truncated: false,
  }
  const assessed = buildAssessment(assessmentInput)
  expect(JSON.stringify(assessed)).not.toContain('PASS')
  await post(owner, `${root}/${first.packId}/versions`, {
    ...input,
    title: 'Updated',
    ruleIds: ['ci.configured'],
    expectedVersionId: first.id,
  }).expect(201)
  expect(composeGatePolicy(selected, 'refs/heads/main', [])).toEqual(frozen)
  expect(buildAssessment(assessmentInput)).toEqual(assessed)
  const view = (
    await get(owner, '/github/repositories/51/standards').expect(200)
  ).body
  expect(view.selectionIntegrity).toBe(true)
  expect(view.controls).toHaveLength(2)
  expect(view.catalogue.filter((p: any) => p.id === first.packId)).toHaveLength(
    2,
  )
})
it('rejects adoption from another tenant and detects changed stored definitions', async () => {
  const first = (await post(outsider, root, input).expect(201)).body
  const previous = await db.repositoryStandardsSelection.findFirstOrThrow({
    where: { repositoryId: repo.id },
  })
  await post(owner, '/github/repositories/51/standards', {
    profile: 'RECOMMENDED',
    packs: [{ id: first.packId, version: '1.0.1' }],
    expectedSelectionId: previous.id,
  }).expect(400)
  await db.organizationStandardVersion.update({
    where: { id: first.id },
    data: { definition: { tampered: true } },
  })
  await get(outsider).expect(409)
})
it('keeps built-in definitions immutable and fails embedded command tampering', () => {
  expect(Object.isFrozen(catalogue[0])).toBe(true)
  const builtin = catalogue[0]
  expect(resolvePacks([{ id: builtin.id, version: builtin.version }])[0]).toBe(
    builtin,
  )
  expect(
    resolvePacks([
      {
        id: 'org-standard-' + randomUUID(),
        version: '1.0.1',
        definition: { ...builtin, id: 'org-standard-' + randomUUID() } as any,
      },
    ])[0],
  ).toBeUndefined()
})

it('pins approved skills to advisory checks and freezes them in adopted policies', async () => {
  const skill = await db.aiReviewSkill.create({ data: { ...skillTemplates[0]!, organizationId: org, skillKey: randomUUID(), version: 1, contentDigest: skillDigest(skillTemplates[0]!), status: 'APPROVED', enabled: true, createdById: owner.identityId } })
  const check = { id: `ai-review-${randomUUID()}`, title: 'Security evidence review', skillId: skill.id, stages: ['pull_request'] }
  const first = (await post(owner, root, { ...input, aiChecks: [check] }).expect(201)).body
  const previous = await db.repositoryStandardsSelection.findFirstOrThrow({ where: { repositoryId: repo.id } })
  const selected = (await post(owner, '/github/repositories/51/standards', { profile: 'RECOMMENDED', packs: [{ id: first.packId, version: '1.0.1' }], expectedSelectionId: previous.id }).expect(201)).body
  const policy = composeGatePolicy(selected, 'refs/heads/main', [])
  expect(policy.aiChecks).toEqual([expect.objectContaining({ ...check, skillVersion: 1, skillDigest: skill.contentDigest, mode: 'ADVISORY' })])
  expect(policy.rules.some(r => r.id === check.id)).toBe(false)
  const library = (await get().expect(200)).body
  expect(library.reviewSkills.some((s: { id: string }) => s.id === skill.id)).toBe(true)
  await post(owner, `${root}/${first.packId}/versions`, { ...input, expectedVersionId: first.id }).expect(201)
  expect(composeGatePolicy(selected, 'refs/heads/main', [])).toEqual(policy)
  await db.aiReviewSkill.update({ where: { id: skill.id }, data: { enabled: false } })
  await post(owner, root, { ...input, aiChecks: [check] }).expect(400)
})
it('rejects foreign skills, unapproved versions and executable or mandatory AI definitions', async () => {
  const skill = await db.aiReviewSkill.create({ data: { ...skillTemplates[0]!, organizationId: org, skillKey: randomUUID(), version: 1, contentDigest: skillDigest(skillTemplates[0]!), createdById: owner.identityId } })
  const check = { id: `ai-review-${randomUUID()}`, title: 'Review', skillId: skill.id, stages: ['repository'] }
  await post(owner, root, { ...input, aiChecks: [check] }).expect(400)
  await db.aiReviewSkill.update({ where: { id: skill.id }, data: { status: 'APPROVED', enabled: true } })
  await post(outsider, root, { ...input, aiChecks: [check] }).expect(400)
  for (const patch of [{ mode: 'REQUIRED' }, { command: 'sh' }, { skillVersion: 99 }, { stages: [] }, { title: '   ' }]) await post(owner, root, { ...input, aiChecks: [{ ...check, ...patch }] }).expect(400)
})
