import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { queueConfig } from '../src/github-events/github-event-queue.js'
import { AssessmentService } from '../src/assessments/assessment.service.js'
import { StandardsService } from '../src/standards/standards.service.js'
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard, type AuthenticatedSession } from '../src/auth/session.guard.js'
import { NotificationsService } from '../src/notifications/notifications.service.js'
import { NotificationsController } from '../src/notifications/notifications.controller.js'
import { recordAssessmentNotification, assessmentNotification } from '../src/notifications/notification-event.js'
import { dispatchNotifications, recordDeliveryFailure, notificationJobOptions } from '../src/notifications/notification-queue.js'
import { deliverNotification } from '../src/notifications/notification-delivery.js'
let db: PrismaService, service: NotificationsService, app: INestApplication
const org = 'notifications-org', repoId = 'notification-repo', owner = 'notification-owner', developer = 'notification-dev'
const session = (identityId = owner): AuthenticatedSession => ({ authenticated: true, identityId, subject: identityId, email: null, role: 'OWNER', organizationId: org })
const repo = { id: repoId, installationId: 99901n, githubId: 99902n, fullName: 'fixture/repo' }
const create = async (report: unknown = { coverage: 'INCOMPLETE' }) => {
  const assessment = { id: randomUUID(), sourceSha: 'a'.repeat(40), report }
  await db.$transaction((tx) => recordAssessmentNotification(tx, assessment, repo, developer))
  return db.notificationEvent.findUniqueOrThrow({ where: { assessmentId: assessment.id } })
}
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/preflyt_notifications_test_')) throw new Error('Use a disposable notification test database')
  db = new PrismaService(); await db.$connect()
  const authz = new AuthorizationService(db)
  service = new NotificationsService(db, authz)
  app = await NestFactory.create({ module: class TestModule {}, controllers: [NotificationsController], providers: [
    SessionGuard, { provide: NotificationsService, useValue: service }, { provide: AuthorizationService, useValue: authz },
    { provide: AuthService, useValue: { sessionCookieName: 'test.sid', currentSession: async (token: string) => token === 'owner' ? session() : { authenticated: false }, assertOrigin: (origin: string) => { if (origin !== 'http://localhost:5173') throw new ForbiddenException() } } },
  ] }, { logger: false })
  app.use(cookieParser()); await app.init()
})
afterAll(async () => { await app?.close(); await db?.$disconnect(); vi.unstubAllEnvs() })
beforeEach(async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  await db.notificationPreference.deleteMany(); await db.auditEvent.deleteMany();
  await db.inboxNotification.deleteMany(); await db.notificationEvent.deleteMany()
  await db.gitHubRepository.deleteMany(); await db.gitHubInstallation.deleteMany()
  await db.organizationMembership.deleteMany(); await db.organization.deleteMany(); await db.identity.deleteMany()
  await db.organization.create({ data: { id: org, name: 'Fixture' } })
  for (const id of [owner, developer]) await db.identity.create({ data: { id, issuer: 'fixture', subject: id } })
  await db.organizationMembership.create({ data: { organizationId: org, identityId: owner, role: 'OWNER' } })
  const dev = await db.organizationMembership.create({ data: { organizationId: org, identityId: developer, role: 'DEVELOPER' } })
  await db.gitHubInstallation.create({ data: { id: repo.installationId, organizationId: org, accountLogin: 'fixture', accountType: 'Organization', repositorySelection: 'selected', permissions: {}, connectedById: owner } })
  await db.gitHubRepository.create({ data: { ...repo, name: 'repo', ownerLogin: 'fixture', isPrivate: true, selected: true } })
  await db.repositoryGrant.create({ data: { membershipId: dev.id, repositoryId: repoId } })
})
it('classifies missing evidence and imported failure without inventing a passing gate', () => {
  expect(assessmentNotification({ coverage: 'INCOMPLETE' }).type).toBe('ASSESSMENT_INCOMPLETE')
  expect(assessmentNotification({ observations: [{ result: 'FAILED' }] }).type).toBe('ASSESSMENT_FAILED')
  expect(assessmentNotification({ coverage: 'NOT_EVALUATED' }).type).toBe('ASSESSMENT_COMPLETED')
})
it('creates durable events and deduplicates concurrent delivery per recipient', async () => {
  const event = await create()
  await Promise.all([deliverNotification(db, event.id), deliverNotification(db, event.id)])
  expect(await db.inboxNotification.count()).toBe(2)
  expect((await service.list(session(), {})).unreadCount).toBe(1)
  expect((await db.notificationEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveredAt).not.toBeNull()
})
it('rolls back the event with its source transaction', async () => {
  await expect(db.$transaction(async (tx) => {
    await recordAssessmentNotification(tx, { id: 'rollback', report: {}, sourceSha: 'b'.repeat(40) }, repo, owner)
    throw new Error('source failure')
  })).rejects.toThrow('source failure')
  expect(await db.notificationEvent.count()).toBe(0)
})
it('persists read status and restricts individual and bulk reads to the current recipient', async () => {
  const event = await create(); await deliverNotification(db, event.id)
  const first = (await service.list(session(), {})).items[0]
  await service.read(session(developer), first.id)
  expect((await service.list(session(), {})).unreadCount).toBe(1)
  await service.read(session(), first.id)
  expect((await new NotificationsService(db, new AuthorizationService(db)).list(session(), {})).unreadCount).toBe(0)
  expect((await service.list(session(developer), {})).unreadCount).toBe(1)
  await service.read(session(developer)); expect((await service.list(session(developer), {})).unreadCount).toBe(0)
})
it('hides historical alerts immediately after repository-grant revocation', async () => {
  const event = await create(); await deliverNotification(db, event.id)
  await db.repositoryGrant.deleteMany()
  expect((await service.list(session(developer), {})).items).toEqual([])
  expect((await service.read(session(developer))).updated).toBe(0)
})
it('denies cross-organization inbox access', async () => {
  const event = await create(); await deliverNotification(db, event.id)
  expect((await service.list({ ...session(), organizationId: 'another-org' }, {})).items).toEqual([])
})
it('does not deliver to revoked members or deselected repositories', async () => {
  const event = await create()
  await db.organizationMembership.updateMany({ where: { identityId: developer }, data: { active: false } })
  await deliverNotification(db, event.id); expect(await db.inboxNotification.count()).toBe(1)
  const other = await create()
  await db.gitHubRepository.update({ where: { id: repoId }, data: { selected: false } })
  await deliverNotification(db, other.id); expect(await db.inboxNotification.count()).toBe(1)
})
it('filters unread, severity, event, date and repository, with bounded pagination', async () => {
  const event = await create(); await deliverNotification(db, event.id)
  expect((await service.list(session(), { severity: 'error' })).total).toBe(0)
  expect((await service.list(session(), { severity: 'warning', repository: '99902', type: 'ASSESSMENT_INCOMPLETE', unread: 'true' })).total).toBe(1)
  expect((await service.list(session(), { to: '2000-01-01' })).total).toBe(0)
  expect((await service.list(session(), { page: '2' })).items).toEqual([])
  await expect(service.list(session(), { page: '0' })).rejects.toThrow()
  await expect(service.list(session(), { severity: 'critical' })).rejects.toThrow()
  await expect(service.list(session(), { from: 'invalid' })).rejects.toThrow()
})
it('does not emit or expose alerts when disabled', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'false')
  await db.$transaction((tx) => recordAssessmentNotification(tx, { id: 'disabled', report: {}, sourceSha: 'a'.repeat(40) }, repo, owner))
  expect(await db.notificationEvent.count()).toBe(0)
  expect((await service.list(session(), {})).enabled).toBe(false)
})
it('enforces active sessions and write-origin validation at the HTTP boundary', async () => {
  await request(app.getHttpServer()).get('/notifications').expect(401)
  await request(app.getHttpServer()).get('/notifications').set('Cookie', 'test.sid=owner').expect(200)
  await request(app.getHttpServer()).post('/notifications/read-all').set('Cookie', 'test.sid=owner').set('Origin', 'https://evil.example').expect(403)
})

it('keeps the durable event pending during queue outage and stops retry after five failures', async () => {
  const event = await create()
  await expect(dispatchNotifications(db, { getJob: vi.fn().mockResolvedValue(null), add: vi.fn().mockRejectedValue(new Error('Redis unavailable')) })).rejects.toThrow()
  expect((await db.notificationEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveredAt).toBeNull()
  const add = vi.fn().mockResolvedValue({})
  await dispatchNotifications(db, { add, getJob: vi.fn().mockResolvedValue(null) })
  expect(add).toHaveBeenCalledWith('deliver', { eventId: event.id }, { ...notificationJobOptions, jobId: event.id })
  for (let i = 0; i < 4; i++) await recordDeliveryFailure(db, event.id)
  expect((await db.notificationEvent.findUniqueOrThrow({ where: { id: event.id } })).failedAt).toBeNull()
  await recordDeliveryFailure(db, event.id)
  add.mockClear(); await dispatchNotifications(db, { add, getJob: vi.fn().mockResolvedValue(null) }); expect(add).not.toHaveBeenCalled()
})
it('saves assessment preferences, suppresses future delivery, and preserves existing inbox entries', async () => {
  const first = await create(); await deliverNotification(db, first.id)
  await service.savePreferences(session(developer), false)
  expect((await service.preferences(session(developer))).assessments).toBe(false)
  const next = await create(); await deliverNotification(db, next.id)
  expect((await service.list(session(developer), {})).total).toBe(1)
  expect((await service.list(session(), {})).total).toBe(2)
  await expect(service.savePreferences(session(), 'false')).rejects.toThrow()
})

it('creates exactly one outbox event through the actual assessment producer on replay', async () => {
  await db.repositoryProfile.create({ data: { repositoryId: repoId, sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), branch: 'main', fullName: repo.fullName, version: 1, complete: true, report: { signals: [] } } })
  const standards = await new StandardsService(db).assign(repo.githubId.toString(), { profile: 'RECOMMENDED', packs: [{ id: 'baseline-engineering', version: '1.0.0' }], expectedSelectionId: null }, owner)
  const input = { sourceSha: 'a'.repeat(40), expectedSelectionId: standards.id, requestKey: randomUUID(), mappings: [] }
  const assessments = new AssessmentService(db)
  await assessments.create(repo.githubId.toString(), input, owner)
  expect((await assessments.create(repo.githubId.toString(), input, owner)).duplicate).toBe(true)
  expect(await db.notificationEvent.count()).toBe(1)
})
it.skipIf(!process.env.NOTIFICATION_TEST_REDIS_URL)('delivers through real Redis/BullMQ after a transient failure', async () => {
  const event = await create()
  const prefix = `preflyt-notifications-test-${randomUUID()}`
  const config = queueConfig(process.env.NOTIFICATION_TEST_REDIS_URL!, prefix)
  const consumerConfig = queueConfig(process.env.NOTIFICATION_TEST_REDIS_URL!, prefix, true)
  const producer = new Redis(config.connection), consumer = new Redis(consumerConfig.connection)
  const queue = new Queue('notifications', { ...config, connection: producer })
  let calls = 0
  const worker = new Worker('notifications', async (job) => {
    if (++calls === 1) throw new Error('Transient delivery failure')
    await deliverNotification(db, job.data.eventId)
  }, { ...consumerConfig, connection: consumer })
  try {
    await worker.waitUntilReady(); await dispatchNotifications(db, queue)
    for (let i = 0; i < 60; i++) {
      if ((await db.notificationEvent.findUniqueOrThrow({ where: { id: event.id } })).deliveredAt) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(calls).toBe(2)
    expect(await db.inboxNotification.count()).toBe(2)
  } finally {
    await worker.close(); await queue.obliterate({ force: true }); await queue.close(); producer.disconnect(); consumer.disconnect()
  }
})
