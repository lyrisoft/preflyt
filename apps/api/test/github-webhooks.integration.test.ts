import 'reflect-metadata'
import { createHmac, randomUUID } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard } from '../src/auth/session.guard.js'
import { GitHubWebhookController } from '../src/github-events/github-webhook.controller.js'
import * as telemetry from '../src/telemetry.js'
import { GitHubWebhookService } from '../src/github-events/github-webhook.service.js'
import { GitHubEventProcessor } from '../src/github-events/github-event-processor.js'

const secret = 'test-webhook-secret-0000000000000000000000000000'
const originals = { enabled: process.env.GITHUB_EVENTS_ENABLED, secret: process.env.GITHUB_WEBHOOK_SECRET }
let app: NestExpressApplication
let prisma: PrismaService
let identityId: string
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
  prisma = new PrismaService()
  await prisma.$connect()
  app = await NestFactory.create<NestExpressApplication>({
    module: class TestModule {}, controllers: [GitHubWebhookController],
    providers: [GitHubWebhookService, SessionGuard, { provide: PrismaService, useValue: prisma },
      { provide: AuthService, useValue: {
        sessionCookieName: 'test.sid', currentSession: async (token?: string) => token === 'VIEWER'
          ? { authenticated: true, identityId, role: 'VIEWER' } : { authenticated: false },
      } }],
  }, { logger: false, rawBody: true })
  app.useBodyParser('json', { limit: '1mb' })
  app.use(cookieParser())
  await app.init()
})
afterAll(async () => {
  await app?.close()
  await prisma?.$disconnect()
  if (originals.enabled === undefined) delete process.env.GITHUB_EVENTS_ENABLED
  else process.env.GITHUB_EVENTS_ENABLED = originals.enabled
  if (originals.secret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET
  else process.env.GITHUB_WEBHOOK_SECRET = originals.secret
})
beforeEach(async () => {
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
  await prisma.gitHubInstallation.create({ data: { id: 77n, accountLogin: 'fixture', accountType: 'Organization',
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
    await send(payload(), id)
    await prisma.gitHubInstallation.update({ where: { id: 77n }, data: { active: false } })
    await new GitHubEventProcessor(prisma).process(id)
    expect(await prisma.gitHubWebhookDelivery.findUnique({ where: { id } })).toMatchObject({ state: 'IGNORED', reason: 'repository_access_changed' })
    expect(await prisma.auditEvent.count()).toBe(0)
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
})
