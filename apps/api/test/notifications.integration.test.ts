import {disposableDatabase} from './disposable-database.js'
import { GatePolicyService } from '../src/assessments/gate-policy.service.js'
import { deliverNotificationEmail } from '../src/notifications/notification-email-delivery.js'
import { dispatchNotificationEmails } from '../src/notifications/notification-queue.js'
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
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
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
  fixture = await disposableDatabase('notifications')
  db = fixture.prisma
  const authz = new AuthorizationService(db)
  service = new NotificationsService(db, authz)
  app = await NestFactory.create({ module: class TestModule {}, controllers: [NotificationsController], providers: [
    SessionGuard, { provide: NotificationsService, useValue: service }, { provide: AuthorizationService, useValue: authz },
    { provide: AuthService, useValue: { sessionCookieName: 'test.sid', currentSession: async (token: string) => token === 'owner' ? session() : { authenticated: false }, assertOrigin: (origin: string) => { if (origin !== 'http://localhost:5173') throw new ForbiddenException() } } },
  ] }, { logger: false })
  app.use(cookieParser()); await app.init()
})
afterAll(async () => { await app?.close(); await fixture?.close(); vi.unstubAllEnvs() })
beforeEach(async () => {
  await fixture.reset()
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'false')
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
it('counts unread notifications without loading reports or repository choices, and limits the open preview to five', async () => {
  for(let i=0;i<8;i++){const event=await create();await deliverNotification(db,event.id)}
  const list=vi.spyOn(db.inboxNotification,'findMany'),choices=vi.spyOn(db.notificationEvent,'groupBy'),reports=vi.spyOn(db.commitAssessment,'findMany')
  try {
    expect(await service.summary(session())).toEqual({enabled:true,unreadCount:8})
    expect(list).not.toHaveBeenCalled();expect(choices).not.toHaveBeenCalled();expect(reports).not.toHaveBeenCalled()
    expect((await service.preview(session())).items).toHaveLength(5)
    expect(choices).not.toHaveBeenCalled()
    await service.list(session(),{})
    expect(choices).toHaveBeenCalledOnce()
    await db.repositoryGrant.deleteMany()
    expect((await service.summary(session(developer))).unreadCount).toBe(0)
    expect((await service.preview(session(developer))).items).toEqual([])
    expect((await service.summary({...session(),organizationId:'elsewhere'})).unreadCount).toBe(0)
    await db.repositoryGrant.create({data:{membershipId:(await db.organizationMembership.findFirstOrThrow({where:{identityId:developer}})).id,repositoryId:repoId}})
    for(const path of ['summary','preview']){
      await request(app.getHttpServer()).get('/notifications/'+path).expect(401)
      const response=await request(app.getHttpServer()).get('/notifications/'+path).set('Cookie','test.sid=owner').set('Origin','http://localhost:5173').expect(200)
      expect(response.headers['cache-control']).toBe('no-store')
    }
  } finally {list.mockRestore();choices.mockRestore();reports.mockRestore()}
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

it('records actual policy publication and sends mandatory in-app notices despite assessment opt-out', async () => {
  const authorization = new AuthorizationService(db), policies = new GatePolicyService(db, authorization)
  const selection = await new StandardsService(db).assign(repo.githubId.toString(), { profile: 'RECOMMENDED', packs: [{ id: 'baseline-engineering', version: '1.0.0' }], expectedSelectionId: null }, owner)
  await db.membership.create({ data: { identityId: owner, role: 'SUPER_ADMIN', active: true } })
  await service.savePreferences(session(), false)
  const draft = await policies.draft(session(), repo.githubId.toString(), { expectedSelectionId: selection.id, branchRef: 'refs/heads/main', requiredRules: [] })
  await policies.approve(session(), repo.githubId.toString(), draft.id, draft.definitionHash)
  await policies.publish(session(), repo.githubId.toString(), draft.id, draft.definitionHash, null)
  const event = await db.notificationEvent.findUniqueOrThrow({ where: { policyId: draft.id } })
  expect(event.assessmentId).toBeNull(); expect(event.sourceSha).toBeNull()
  await deliverNotification(db, event.id)
  expect((await service.list(session(), { type: 'POLICY_PUBLISHED' })).total).toBe(1)
  expect((await service.list(session(developer), {})).total).toBe(0)
  await expect(policies.publish(session(), repo.githubId.toString(), draft.id, draft.definitionHash, null)).rejects.toThrow()
  expect(await db.notificationEvent.count()).toBe(1)
})
const email = async () => {
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true')
  await db.identity.update({ where: { id: owner }, data: { email: 'owner@example.test' } })
  await service.savePreferences(session(), true, true)
  const event = await create(); await deliverNotification(db, event.id)
  return db.notificationEmailDelivery.findFirstOrThrow()
}
it('queues only opted-in email recipients and persists sent status without changing assessments', async () => {
  const delivery = await email(), mail = { send: vi.fn().mockResolvedValue(undefined) }
  expect(await db.notificationEmailDelivery.count()).toBe(1)
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  expect(mail.send).toHaveBeenCalledTimes(1)
  const inbox = await service.list(session(), {})
  expect(inbox.items[0].emailDelivery?.state).toBe('SENT')
  expect(await db.notificationEvent.count()).toBe(1)
})
it('skips email after opt-out or membership revocation at send time', async () => {
  const delivery = await email(), mail = { send: vi.fn() }
  await service.savePreferences(session(), true, false)
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  expect(mail.send).not.toHaveBeenCalled()
  expect((await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).state).toBe('SKIPPED')
  await email()
  const pending = await db.notificationEmailDelivery.findFirstOrThrow({ where: { state: 'PENDING' } })
  await db.organizationMembership.updateMany({ where: { identityId: owner }, data: { active: false } })
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, pending.id)
  expect(mail.send).not.toHaveBeenCalled()
})
it('records bounded email retries and failures while the in-app event remains delivered', async () => {
  const delivery = await email(), mail = { send: vi.fn().mockRejectedValue(new Error('private transport detail')) }
  for (let i = 0; i < 5; i++) {
    await db.notificationEmailDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(0) } })
    await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  }
  const failed = await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
  expect(failed.state).toBe('FAILED'); expect(failed.attempts).toBe(5)
  expect(failed.failureCode).toBe('DELIVERY_UNAVAILABLE')
  expect((await service.list(session(), {})).items).toHaveLength(1)
})
it('recovers expired email leases and classifies exhausted unconfirmed deliveries', async () => {
  const delivery = await email()
  await db.notificationEmailDelivery.update({ where: { id: delivery.id }, data: { attempts: 5, leaseUntil: new Date(0) } })
  const add = vi.fn(), getJob = vi.fn()
  await dispatchNotificationEmails(db, { add, getJob })
  expect(add).not.toHaveBeenCalled()
  expect((await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).failureCode).toBe('DELIVERY_UNCONFIRMED')
})

it('does not resend a known accepted email when persisting its acknowledgement fails', async () => {
  const delivery = await email(), mail = { send: vi.fn().mockResolvedValue(undefined) }
  const transaction = vi.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('Acknowledgement unavailable'))
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  transaction.mockRestore()
  const failed = await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
  expect(failed.state).toBe('FAILED'); expect(failed.failureCode).toBe('DELIVERY_UNCONFIRMED')
  await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id)
  expect(mail.send).toHaveBeenCalledTimes(1)
})

it('serves and saves personal weekly health settings through CSRF-protected scoped endpoints', async () => {
  const result = await request(app.getHttpServer()).get('/notifications/weekly-health').set('Cookie', 'test.sid=owner').expect(200)
  expect(result.body.repositories).toEqual([{ id: String(repo.githubId), name: repo.fullName }])
  const body = { enabled: false, repositoryIds: [String(repo.githubId)], day: 1, hour: 9, timezone: 'Africa/Lagos' }
  await request(app.getHttpServer()).post('/notifications/weekly-health').set('Cookie', 'test.sid=owner').send(body).expect(403)
  const saved = await request(app.getHttpServer()).post('/notifications/weekly-health').set('Cookie', 'test.sid=owner').set('Origin', 'http://localhost:5173').send(body).expect(201)
  expect(saved.body.repositoryIds).toEqual([String(repo.githubId)])
  await request(app.getHttpServer()).post('/notifications/weekly-health').set('Cookie', 'test.sid=owner').set('Origin', 'http://localhost:5173').send({ ...body, repositoryIds: ['8888'] }).expect(403)
})
