import {disposableDatabase} from './disposable-database.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import 'reflect-metadata'
import { ForbiddenException, ValidationPipe } from '@nestjs/common'
import { CiArtifactController } from '../src/github-events/ci-artifact.controller.js'
import { CiArtifactService } from '../src/github-events/ci-artifact.service.js'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { OwnerAdminGuard, SessionGuard } from '../src/auth/session.guard.js'
import { GitHubWebhookController } from '../src/github-events/github-webhook.controller.js'
import * as telemetry from '../src/telemetry.js'
import { GitHubWebhookService } from '../src/github-events/github-webhook.service.js'
import { GitHubEventProcessor } from '../src/github-events/github-event-processor.js'

const secret = 'test-webhook-secret-0000000000000000000000000000'
const originals = { enabled: process.env.GITHUB_EVENTS_ENABLED, secret: process.env.GITHUB_WEBHOOK_SECRET }
let app: NestExpressApplication
let prisma: PrismaService
let identityId: string
let organizationId: string
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
const payload = (sha = 'a'.repeat(40)) => ({
  action: 'synchronize', installation: { id: 77 }, repository: { id: 501 },
  pull_request: { id: 1001, number: 3, head: { sha, repo: { id: 999 } }, base: { repo: { id: 501 } },
    state: 'open', updated_at: '2026-10-08T16:00:00Z', body: 'super-secret-never-persist-this' },
})
function send(body: unknown = payload(), deliveryId = randomUUID(), event = 'pull_request', signedBody?: string) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const signature = createHmac('sha256', secret).update(signedBody ?? raw).digest('hex')
  return request(app.getHttpServer()).post('/github/webhooks').set('Content-Type', 'application/json')
    .set('X-GitHub-Delivery', deliveryId).set('X-GitHub-Event', event).set('X-Hub-Signature-256', `sha256=${signature}`).send(raw)
}

beforeAll(async () => {
  fixture = await disposableDatabase('webhooks')
  prisma = fixture.prisma
  app = await NestFactory.create<NestExpressApplication>({
    module: class TestModule {}, controllers: [GitHubWebhookController, CiArtifactController],
    providers: [{ provide: AuthorizationService, useValue: { authorizeRequest: async () => false } }, GitHubWebhookService, CiArtifactService, OwnerAdminGuard, SessionGuard, { provide: PrismaService, useValue: prisma },
      { provide: AuthService, useValue: {
        sessionCookieName: 'test.sid', assertOrigin: (origin?: string) => { if (origin !== 'http://localhost:5173') throw new ForbiddenException() },
        currentSession: async (token?: string) => ['VIEWER', 'OWNER', 'SUPER_ADMIN'].includes(token ?? '')
          ? { authenticated: true, identityId, role: token, organizationId } : { authenticated: false },
      } }],
  }, { logger: false, rawBody: true })
  app.useBodyParser('json', { limit: '1mb' })
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  await app.init()
})
afterAll(async () => {
  await app?.close()
  await fixture?.close()
  if (originals.enabled === undefined) delete process.env.GITHUB_EVENTS_ENABLED
  else process.env.GITHUB_EVENTS_ENABLED = originals.enabled
  if (originals.secret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET
  else process.env.GITHUB_WEBHOOK_SECRET = originals.secret
})
beforeEach(async () => {
  await fixture.reset()
  process.env.GITHUB_EVENTS_ENABLED = 'true'
  process.env.GITHUB_WEBHOOK_SECRET = secret
  await prisma.gitHubWebhookDelivery.deleteMany()
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.gitHubSetupTransaction.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.identity.deleteMany()
  const identity = await prisma.identity.create({ data: { issuer: 'test', subject: randomUUID(), membership: { create: { role: 'OWNER' } } } })
  identityId = identity.id
  organizationId = (await prisma.organization.create({data: {name: 'Webhook fixture'}})).id
  await prisma.organizationMembership.create({data: {organizationId, identityId, role: 'OWNER'}})
  await prisma.gitHubInstallation.create({ data: { id: 77n, organizationId, accountLogin: 'fixture', accountType: 'Organization',
    repositorySelection: 'selected', permissions: {}, connectedById: identityId, active: true } })
  await prisma.gitHubRepository.create({ data: { githubId: 501n, installationId: 77n, name: 'app', fullName: 'fixture/app', ownerLogin: 'fixture', isPrivate: true, selected: true } })
})

describe('signed webhook durable inbox and repository history', () => {
  it('verifies original JSON bytes, persists only normalized metadata, and needs no Redis for acknowledgement', async () => {
    const id = randomUUID()
    const raw = JSON.stringify(payload(), null, 2)
    const parent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01'
    const capture = vi.spyOn(telemetry, 'currentTraceParent').mockReturnValue(parent)
    let result
    try { result = await send(raw, id) } finally { capture.mockRestore() }
    expect(result.status).toBe(202)
    expect(result.body).toMatchObject({ accepted: true, duplicate: false, deliveryId: id })
    const record = await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } })
    expect(record).toMatchObject({ state: 'RECEIVED', sourceSha: 'a'.repeat(40), repositoryGithubId: 501n, installationId: 77n, sourceNumber: 3 })
    expect(record.traceParent).toBe(parent)
    expect(record.payloadHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(record, (_, value) => typeof value === 'bigint' ? value.toString() : value)).not.toContain('super-secret')
  })

  it('rejects tampered signatures, missing signatures, missing headers and oversized bodies', async () => {
    expect((await send(payload('b'.repeat(40)), randomUUID(), 'pull_request', JSON.stringify(payload()))).status).toBe(401)
    expect((await request(app.getHttpServer()).post('/github/webhooks').send(payload())).status).toBe(401)
    expect((await send(payload(), 'invalid')).status).toBe(400)
    expect((await send({ ...payload(), padding: 'x'.repeat(1024 * 1024) })).status).toBe(413)
    expect(await prisma.gitHubWebhookDelivery.count()).toBe(0)
  })

  it('disables ingestion safely and ignores unsupported or unselected events', async () => {
    process.env.GITHUB_EVENTS_ENABLED = 'false'
    expect((await send()).status).toBe(503)
    process.env.GITHUB_EVENTS_ENABLED = 'true'
    expect((await send(payload(), randomUUID(), 'issues')).body).toMatchObject({ accepted: false, reason: 'unsupported_event' })
    expect((await send(payload(), randomUUID(), '__proto__')).body).toMatchObject({ accepted: false, reason: 'unsupported_event' })
    await prisma.gitHubRepository.update({ where: { githubId: 501n }, data: { selected: false } })
    expect((await send()).body).toMatchObject({ accepted: false, reason: 'repository_not_selected' })
    expect(await prisma.gitHubWebhookDelivery.count()).toBe(0)
  })

  it('deduplicates concurrent redeliveries and rejects delivery ID reuse with another revision', async () => {
    const id = randomUUID()
    const results = await Promise.all(Array.from({ length: 4 }, () => send(payload(), id)))
    expect(results.every(result => result.status === 202)).toBe(true)
    expect(await prisma.gitHubWebhookDelivery.count()).toBe(1)
    expect((await send(payload('b'.repeat(40)), id)).status).toBe(409)
  })

  it('rejects inconsistent repository identities and invalid revisions without retaining records', async () => {
    const badBase = payload()
    badBase.pull_request.base.repo.id = 999
    expect((await send(badBase)).status).toBe(400)
    expect((await send(payload('main'))).status).toBe(400)
    const wrongInstallation = payload()
    wrongInstallation.installation.id = 78
    expect((await send(wrongInstallation)).body.accepted).toBe(false)
    expect(await prisma.gitHubWebhookDelivery.count()).toBe(0)
  })

  it('processes exactly once, retains older revisions as history, and never overwrites newer events', async () => {
    const newer = randomUUID(), older = randomUUID()
    await send(payload('b'.repeat(40)), newer)
    const oldPayload = payload('a'.repeat(40)); oldPayload.pull_request.updated_at = '2026-10-07T12:00:00Z'
    await send(oldPayload, older)
    const processor = new GitHubEventProcessor(prisma)
    await Promise.all([processor.process(newer), processor.process(newer)])
    await processor.process(older)
    await processor.process(newer)
    expect(await prisma.auditEvent.count({ where: { event: 'github_event_processed' } })).toBe(2)
    expect((await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id: newer } })).sourceSha).toBe('b'.repeat(40))
    expect((await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id: older } })).sourceSha).toBe('a'.repeat(40))
  })

  it('requires a session for history and hides it once repository selection changes', async () => {
    await send()
    expect((await request(app.getHttpServer()).get('/github/repositories/501/events')).status).toBe(401)
    const result = await request(app.getHttpServer()).get('/github/repositories/501/events').set('Cookie', 'test.sid=VIEWER')
    expect(result.status).toBe(200)
    expect(result.body.deliveries[0]).toMatchObject({ sourceSha: 'a'.repeat(40), state: 'RECEIVED' })
    expect(JSON.stringify(result.body)).not.toContain('payloadHash')
    await prisma.gitHubRepository.update({ where: { githubId: 501n }, data: { selected: false } })
    expect((await request(app.getHttpServer()).get('/github/repositories/501/events').set('Cookie', 'test.sid=VIEWER')).status).toBe(403)
  })

  it('marks accepted events ignored if the installation is revoked before worker processing', async () => {
    const id = randomUUID()
    await send({ action: 'completed', installation: { id: 77 }, repository: { id: 501 },
      check_run: { id: 2003, head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success' } }, id, 'check_run')
    await prisma.gitHubInstallation.update({ where: { id: 77n }, data: { active: false } })
    await new GitHubEventProcessor(prisma).process(id)
    expect(await prisma.gitHubWebhookDelivery.findUnique({ where: { id } })).toMatchObject({ state: 'IGNORED', reason: 'repository_access_changed' })
    expect(await prisma.auditEvent.count()).toBe(0)
    expect(await prisma.importedCiEvidence.count()).toBe(0)
  })

  it('records workflow and check events without interpreting a successful source check as a Preflyt gate', async () => {
    for (const event of ['workflow_run', 'check_run']) {
      const result = await send({ action: 'completed', installation: { id: 77 }, repository: { id: 501 },
        [event]: { id: 2001, head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success', updated_at: '2026-10-08T16:00:00Z' } }, randomUUID(), event)
      expect(result.status).toBe(202)
    }
    const deliveries = await prisma.gitHubWebhookDelivery.findMany()
    expect(deliveries).toHaveLength(2)
    expect(deliveries.every(delivery => delivery.state === 'RECEIVED' && delivery.sourceConclusion === 'success')).toBe(true)
  })
  it('imports immutable CI observations transactionally, with replay safety and SHA isolation', async () => {
    const processor = new GitHubEventProcessor(prisma)
    const ids = [randomUUID(), randomUUID(), randomUUID()]
    for (const [index, sha] of ['c'.repeat(40), 'd'.repeat(40), 'c'.repeat(40)].entries()) {
      await send({ action: 'completed', installation: { id: 77 }, repository: { id: 501 },
        check_run: { id: 2001, head_sha: sha, status: 'completed', conclusion: index === 2 ? 'failure' : 'success',
          updated_at: index === 2 ? '2026-10-07T16:00:00Z' : '2026-10-08T16:00:00Z', output: { text: 'secret-not-evidence' } } }, ids[index], 'check_run')
    }
    await Promise.all([processor.process(ids[0]), processor.process(ids[0])])
    await processor.process(ids[1]); await processor.process(ids[2])
    const evidence = await prisma.importedCiEvidence.findMany()
    expect(evidence).toHaveLength(3)
    expect(evidence.find(row => row.deliveryId === ids[0])).toMatchObject({ result: 'SUCCEEDED', sourceSha: 'c'.repeat(40), version: 1 })
    expect(evidence.find(row => row.deliveryId === ids[2])?.result).toBe('FAILED')
    expect(evidence.every(row => /^[a-f0-9]{64}$/.test(row.evidenceHash))).toBe(true)
    expect(JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value)).not.toContain('secret-not-evidence')
    expect((await request(app.getHttpServer()).get('/github/repositories/501/ci-evidence')).status).toBe(401)
    const query = (path: string) => request(app.getHttpServer()).get(path).set('Cookie', 'test.sid=VIEWER')
    expect((await query('/github/repositories/501/ci-evidence?sha=main')).status).toBe(400)
    const response = await query('/github/repositories/501/ci-evidence?sha=' + 'C'.repeat(40))
    expect(response.status).toBe(200); expect(response.body.qualityGate).toBeNull()
    expect(response.body.observations).toHaveLength(2)
    expect(response.body.observations.every((row: { sourceSha: string }) => row.sourceSha === 'c'.repeat(40))).toBe(true)
    expect((await query('/github/repositories/501/ci-evidence?sha=' + 'e'.repeat(40))).body.observations).toEqual([])
    await prisma.gitHubRepository.update({ where: { githubId: 501n }, data: { selected: false } })
    expect((await query('/github/repositories/501/ci-evidence')).status).toBe(403)
  })

  it('paginates scoped CI history without truncating older results and validates page inputs', async () => {
    const processor = new GitHubEventProcessor(prisma)
    for (let index = 0; index < 12; index++) {
      const id = randomUUID()
      await send({ action: 'completed', installation: { id: 77 }, repository: { id: 501 },
        check_run: { id: 3000 + index, head_sha: (index < 10 ? 'c' : 'd').repeat(40), status: 'completed', conclusion: 'success' } }, id, 'check_run')
      await processor.process(id)
    }
    const query = (suffix: string) => request(app.getHttpServer()).get('/github/repositories/501/ci-evidence' + suffix).set('Cookie', 'test.sid=VIEWER')
    const first = await query('?page=1'), second = await query('?page=2')
    expect(first.status).toBe(200)
    expect(first.body.pagination).toEqual({ page: 1, pageSize: 10, total: 12, hasNext: true })
    expect(first.body.observations).toHaveLength(10)
    expect(second.body.pagination).toEqual({ page: 2, pageSize: 10, total: 12, hasNext: false })
    expect(second.body.observations).toHaveLength(2)
    const ids = [...first.body.observations, ...second.body.observations].map(row => row.deliveryId)
    expect(new Set(ids).size).toBe(12)
    expect((await query('?page=1')).body.observations.map(row => row.deliveryId)).toEqual(first.body.observations.map(row => row.deliveryId))
    const filtered = await query('?page=1&sha=' + 'd'.repeat(40))
    expect(filtered.body.pagination.total).toBe(2)
    expect(filtered.body.observations.every(row => row.sourceSha === 'd'.repeat(40))).toBe(true)
    expect((await query('')).body.observations).toHaveLength(12)
    for (const invalid of ['0', '-1', '1.5', 'abc', '1000000', '1&page=2'])
      expect((await query('?page=' + invalid)).status).toBe(400)
    const events = (suffix: string) => request(app.getHttpServer()).get('/github/repositories/501/events' + suffix).set('Cookie', 'test.sid=VIEWER')
    const firstEvents = await events('?page=1'), secondEvents = await events('?page=2')
    expect(firstEvents.body.pagination).toEqual({ page: 1, pageSize: 10, total: 12, hasNext: true })
    expect(firstEvents.body.deliveries).toHaveLength(10)
    expect(secondEvents.body.pagination.hasNext).toBe(false)
    expect(secondEvents.body.deliveries).toHaveLength(2)
    expect(new Set([...firstEvents.body.deliveries, ...secondEvents.body.deliveries].map(row => row.id)).size).toBe(12)
    for (const invalid of ['0', '-1', '1.5', 'abc', '1000000', '1&page=2'])
      expect((await events('?page=' + invalid)).status).toBe(400)
    expect((await events('')).body.deliveries).toHaveLength(12)
    expect((await query('?page=3')).body.observations).toEqual([])
    await prisma.gitHubRepository.update({ where: { githubId: 501n }, data: { selected: false } })
    expect((await query('?page=2')).status).toBe(403)
    expect((await events('?page=2')).status).toBe(403)
  })

  it('rolls back the event claim when evidence persistence fails', async () => {
    const id = randomUUID()
    await send({ action: 'completed', installation: { id: 77 }, repository: { id: 501 },
      workflow_run: { id: 2002, head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success' } }, id, 'workflow_run')
    // Simulate a storage constraint failure after claiming the inbox record.
    const broken = { $transaction: (callback: (tx: unknown) => Promise<unknown>) => prisma.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
      return key === 'importedCiEvidence' ? { create: async () => { throw new Error('storage unavailable') } } : Reflect.get(target, key)
    } }))) } as unknown as PrismaService
    await expect(new GitHubEventProcessor(broken).process(id)).rejects.toThrow('storage unavailable')
    expect((await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } })).state).toBe('RECEIVED')
    expect(await prisma.importedCiEvidence.count()).toBe(0)
    expect(await prisma.auditEvent.count()).toBe(0)
    await new GitHubEventProcessor(prisma).process(id)
    expect(await prisma.importedCiEvidence.count()).toBe(1)
  })

})

const report = (content = '<testsuite tests="1"><testcase name="secret-case"/></testsuite>') => ({ format: 'junit', content, sha256: createHash('sha256').update(content).digest('hex') })
async function observation(status = 'completed') {
  const id = randomUUID()
  await send({ action: status === 'completed' ? 'completed' : 'created', installation: { id: 77 }, repository: { id: 501 },
    check_run: { id: 2001, head_sha: 'c'.repeat(40), status, conclusion: status === 'completed' ? 'success' : null } }, id, 'check_run')
  await new GitHubEventProcessor(prisma).process(id)
  return id
}
const upload = (id: string, body = report(), role = 'OWNER', origin = 'http://localhost:5173', repo = '501') => request(app.getHttpServer())
  .post(`/github/repositories/${repo}/ci-evidence/${id}/artifacts`).set('Cookie', 'test.sid=' + role).set('Origin', origin).send(body)

describe('administrator-associated artifact imports', () => {
  it('retains original bytes once under concurrent replay, audits exact SHA, and exposes redacted summaries', async () => {
    const id = await observation()
    const results = await Promise.all(Array.from({ length: 4 }, () => upload(id)))
    expect(results.every(r => r.status === 201)).toBe(true)
    expect(results.filter(r => !r.body.duplicate)).toHaveLength(1)
    expect(await prisma.ciArtifactImport.count()).toBe(1)
    const stored = await prisma.ciArtifactImport.findFirstOrThrow()
    expect(Buffer.from(stored.content).toString()).toBe(report().content)
    expect(stored.uploadedById).toBe(identityId)
    expect(await prisma.auditEvent.count({ where: { event: 'ci.artifact.imported' } })).toBe(1)
    expect((await prisma.auditEvent.findFirstOrThrow({ where: { event: 'ci.artifact.imported' } })).metadata).toMatchObject({ sourceSha: 'c'.repeat(40) })
    const history = await request(app.getHttpServer()).get('/github/repositories/501/ci-evidence').set('Cookie', 'test.sid=VIEWER')
    expect(history.body.qualityGate).toBeNull()
    expect(history.body.observations[0].artifacts[0]).toMatchObject({ verification: 'ADMIN_ASSOCIATED_UNVERIFIED', summary: { tests: 1, passed: 1 } })
    expect(JSON.stringify(history.body)).not.toContain('secret-case')
    expect(JSON.stringify(results[0].body)).not.toContain('content')
  })
  it('imports schema-valid SARIF with distinct format and original-byte integrity', async () => {
    const id = await observation()
    const content = JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'secret-tool' } }, results: [{ level: 'warning', message: { text: 'secret-report' } }] }] })
    const body = { format: 'sarif', content, sha256: createHash('sha256').update(content).digest('hex') }
    const response = await upload(id, body)
    expect(response.status).toBe(201)
    expect(response.body.artifact).toMatchObject({ format: 'sarif', sha256: body.sha256, summary: { results: 1, warning: 1, partial: true, execution: 'UNKNOWN' } })
    expect(JSON.stringify(response.body)).not.toContain('secret')
    expect(Buffer.from((await prisma.ciArtifactImport.findFirstOrThrow()).content).toString()).toBe(content)
  })
  it('requires an admin session, exact origin and a completed observation in the selected repository', async () => {
    const id = await observation()
    expect((await upload(id, report(), 'invalid')).status).toBe(401)
    expect((await upload(id, report(), 'VIEWER')).status).toBe(403)
    expect((await upload(id, report(), 'OWNER', 'https://attacker.example')).status).toBe(403)
    expect((await upload(id, report(), 'OWNER', 'http://localhost:5173', '502')).status).toBe(403)
    await prisma.gitHubRepository.create({ data: { githubId: 502n, installationId: 77n, name: 'other', fullName: 'fixture/other', ownerLogin: 'fixture', isPrivate: true, selected: true } })
    expect((await upload(id, report(), 'OWNER', 'http://localhost:5173', '502')).status).toBe(404)
    expect((await upload(randomUUID())).status).toBe(404)
    expect((await upload(await observation('queued'))).status).toBe(400)
    expect((await upload(id, report(), 'SUPER_ADMIN')).status).toBe(201)
    await prisma.gitHubInstallation.update({ where: { id: 77n }, data: { active: false } })
    expect((await upload(id)).status).toBe(403)
  })
  it('rejects digest mismatches, forged revision fields and oversized reports without writes', async () => {
    const id = await observation()
    expect((await upload(id, { ...report(), sha256: '0'.repeat(64) })).status).toBe(400)
    expect((await upload(id, { ...report(), sourceSha: 'd'.repeat(40) } as ReturnType<typeof report>)).status).toBe(400)
    expect((await upload(id, report('<testsuite>' + 'x'.repeat(262144) + '</testsuite>'))).status).toBe(400)
    expect(await prisma.ciArtifactImport.count()).toBe(0)
  })
  it('enforces a serialized ten-artifact quota', async () => {
    const id = await observation()
    for (let i = 0; i < 10; i++) expect((await upload(id, report(`<testsuite name="${i}"/>`))).status).toBe(201)
    expect((await upload(id, report('<testsuite name="extra"/>'))).status).toBe(429)
    expect((await upload(id, report('<testsuite name="0"/>'))).body.duplicate).toBe(true)
  })
  it('rolls back original-byte storage when audit persistence fails', async () => {
    const id = await observation()
    const broken = { $transaction: (callback: (tx: unknown) => Promise<unknown>) => prisma.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
      return key === 'auditEvent' ? { create: async () => { throw new Error('storage unavailable') } } : Reflect.get(target, key)
    } }))) } as unknown as PrismaService
    await expect(new CiArtifactService(broken).import('501', id, report(), identityId)).rejects.toThrow('storage unavailable')
    expect(await prisma.ciArtifactImport.count()).toBe(0)
    expect(await prisma.auditEvent.count({ where: { event: 'ci.artifact.imported' } })).toBe(0)
  })
})

it('persists signed source identity through ingestion and CI import', async () => {
  const id = randomUUID()
  const data = {
    action: 'completed',
    installation: { id: 77 },
    repository: { id: 501 },
    check_run: {
      id: 1001,
      head_sha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'success',
      name: 'Unit tests',
      app: { id: 123, name: 'not-stored' },
      updated_at: new Date().toISOString(),
    },
  }
  expect((await send(data, id, 'check_run')).status).toBe(202)
  await new GitHubEventProcessor(prisma).process(id)
  const evidence = await prisma.importedCiEvidence.findUniqueOrThrow({
    where: { deliveryId: id },
  })
  expect(evidence.version).toBe(2)
  expect(evidence.sourceIdentity).toEqual({
    kind: 'check_run',
    appId: '123',
    checkName: 'Unit tests',
  })
})

it('persists only complete signed PR context and creates a pinned assessment',async()=>{
  const repo=await prisma.gitHubRepository.findUniqueOrThrow({where:{githubId:501n}})
  const {catalogue}=await import('../src/standards/catalogue.js');const pack=catalogue.find(p=>p.id==='baseline-engineering')!
  await prisma.repositoryStandardsSelection.create({data:{repositoryId:repo.id,selectedById:identityId,revision:1,profile:'RECOMMENDED',packs:[{id:pack.id,version:pack.version,digest:pack.digest}]}})
  const data=payload() as any;data.pull_request.head={repo:{id:501},ref:'feature/test',sha:'c'.repeat(40)};data.pull_request.base={repo:{id:501},ref:'development',sha:'a'.repeat(40)};data.pull_request.draft=false;data.pull_request.merged=false
  const id=randomUUID();expect((await send(data,id)).status).toBe(202)
  const stored=await prisma.gitHubWebhookDelivery.findUniqueOrThrow({where:{id}})
  expect(stored.pullRequestContext).toMatchObject({head:{repositoryId:'501',ref:'feature/test',sha:'c'.repeat(40)},base:{repositoryId:'501',ref:'development',sha:'a'.repeat(40)}})
  await new GitHubEventProcessor(prisma).process(id)
  const snapshot=await prisma.commitAssessment.findFirstOrThrow({where:{requestKey:'github:'+id}})
  expect(snapshot.request).toMatchObject({subjectKind:'PULL_REQUEST',trigger:'GITHUB_PR',pullRequest:{number:3}})
  expect(JSON.stringify(snapshot.request)).not.toContain('super-secret')
  const bad=structuredClone(data);bad.pull_request.base.sha='broken';expect((await send(bad)).status).toBe(400)
})
