import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { SMTPServer } from 'smtp-server'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'
import { queueConfig } from '../src/github-events/github-event-queue.js'
import { disposableDatabase } from './disposable-database.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { NotificationChannelsService } from '../src/notifications/notification-channels.service.js'
import { deliverNotification } from '../src/notifications/notification-delivery.js'
import { deliverNotificationChannelEmail } from '../src/notifications/notification-channel-delivery.js'
import { dispatchNotificationChannelEmails } from '../src/notifications/notification-queue.js'
import { NotificationMailer } from '../src/notifications/notification-mail.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
const org = 'channel-mail-org', owner = 'channel-mail-owner', repoId = 'channel-mail-repo'
const session = { authenticated: true as const, identityId: owner, organizationId: org, role: 'OWNER', subject: owner, email: null }
let authorization: AuthorizationService, service: NotificationChannelsService
const db = () => fixture.prisma
const channel = async (recipients = ['lead@example.test', 'security@example.test'], name = 'Engineering updates') =>
  db().organizationNotificationChannel.create({ data: { organizationId: org, name, recipients, createdById: owner, updatedById: owner } })
const event = async () => db().notificationEvent.create({ data: { organizationId: org, repositoryId: repoId, repositoryGithubId: '98902', repositoryName: 'private/sensitive-repo', sourceSha: 'a'.repeat(40), type: 'ASSESSMENT_FAILED', severity: 'error' } })
const pending = async () => { const group = await channel(); const update = await event(); await deliverNotification(db(), update.id); return { group, update, delivery: await db().notificationChannelDelivery.findFirstOrThrow() } }
const row = async (id: string) => db().notificationChannelDelivery.findUniqueOrThrow({ where: { id } })
const deliver = (id: string, mail: { send(to: string, id: string, kind?: 'PERSONAL' | 'ORGANIZATION' | 'TEST'): Promise<void> }) => deliverNotificationChannelEmail(db(), authorization, mail, id)
beforeAll(async () => { fixture = await disposableDatabase('channelmail'); authorization = new AuthorizationService(db()); service = new NotificationChannelsService(db(), authorization) })
afterAll(async () => { await fixture?.close() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
beforeEach(async () => {
  await fixture.reset()
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true'); vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true')
  await db().organization.create({ data: { id: org, name: 'Channel mail fixture' } })
  await db().identity.create({ data: { id: owner, issuer: 'fixture', subject: owner } })
  await db().organizationMembership.create({ data: { identityId: owner, organizationId: org, role: 'OWNER' } })
  await db().gitHubInstallation.create({ data: { id: 98901n, organizationId: org, accountLogin: 'private', accountType: 'Organization', repositorySelection: 'selected', permissions: {}, connectedById: owner } })
  await db().gitHubRepository.create({ data: { id: repoId, installationId: 98901n, githubId: 98902n, fullName: 'private/sensitive-repo', name: 'sensitive-repo', ownerLogin: 'private', isPrivate: true, selected: true } })
})
it('fans out once to each active org channel recipient, independently of personal email preferences', async () => {
  const group = await channel(), another = await channel(['ops@example.test'], 'Operations')
  await db().organizationNotificationChannel.create({ data: { organizationId: org, name: 'Paused', recipients: ['paused@example.test'], enabled: false, createdById: owner, updatedById: owner } })
  await db().organization.create({ data: { id: 'another-org', name: 'Other organization' } })
  await db().organizationNotificationChannel.create({ data: { organizationId: 'another-org', name: 'Other', recipients: ['other@example.test'], createdById: owner, updatedById: owner } })
  await db().notificationPreference.create({ data: { organizationId: org, identityId: owner, email: false, assessments: false } })
  const update = await event()
  await Promise.all([deliverNotification(db(), update.id), deliverNotification(db(), update.id)])
  const outbox = await db().notificationChannelDelivery.findMany()
  expect(outbox).toHaveLength(3); expect(new Set(outbox.map((item) => item.channelId))).toEqual(new Set([group.id, another.id]))
  expect(await db().notificationEmailDelivery.count()).toBe(0)
  expect(outbox.every((item) => item.eventId === update.id && item.organizationId === org)).toBe(true)
})
it('does not create historical channel deliveries while email is disabled or source repository is unavailable', async () => {
  await channel(); vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'false')
  const first = await event(); await deliverNotification(db(), first.id)
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true'); await deliverNotification(db(), first.id)
  expect(await db().notificationChannelDelivery.count()).toBe(0)
  await db().gitHubRepository.update({ where: { id: repoId }, data: { selected: false } })
  await deliverNotification(db(), (await event()).id); expect(await db().notificationChannelDelivery.count()).toBe(0)
})
it('claims concurrent worker attempts once and records a safe sent audit', async () => {
  const { delivery } = await pending(), send = vi.fn().mockResolvedValue(undefined)
  await Promise.all([deliver(delivery.id, { send }), deliver(delivery.id, { send })])
  expect(send).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledWith(delivery.recipient, delivery.id, 'ORGANIZATION')
  expect((await row(delivery.id)).state).toBe('SENT')
  const audit = await db().auditEvent.findFirstOrThrow({ where: { event: 'notification.channel.email.sent' } })
  expect(JSON.stringify(audit.metadata)).not.toContain(delivery.recipient); expect(JSON.stringify(audit.metadata)).not.toContain('sensitive-repo')
})
it.each(['pause', 'remove', 'recipient', 'repository', 'installation', 'channel-org', 'event-org', 'repository-id'])('skips changed %s eligibility before send', async (change) => {
  const { group, update, delivery } = await pending(), send = vi.fn().mockResolvedValue(undefined)
  if (change === 'pause') await db().organizationNotificationChannel.update({ where: { id: group.id }, data: { enabled: false } })
  if (change === 'remove') await db().organizationNotificationChannel.update({ where: { id: group.id }, data: { deletedAt: new Date() } })
  if (change === 'recipient') await db().organizationNotificationChannel.update({ where: { id: group.id }, data: { recipients: ['new@example.test'] } })
  if (change === 'repository') await db().gitHubRepository.update({ where: { id: repoId }, data: { selected: false } })
  if (change === 'installation') await db().gitHubInstallation.update({ where: { id: 98901n }, data: { active: false } })
  if (change === 'channel-org') await db().notificationChannelDelivery.update({ where: { id: delivery.id }, data: { organizationId: 'another-org' } })
  if (change === 'event-org') await db().notificationEvent.update({ where: { id: update.id }, data: { organizationId: 'another-org' } })
  if (change === 'repository-id') await db().notificationEvent.update({ where: { id: update.id }, data: { repositoryGithubId: '123' } })
  await deliver(delivery.id, { send }); expect(send).not.toHaveBeenCalled(); expect((await row(delivery.id)).state).toBe('SKIPPED')
})
it('leaves work pending without consuming an attempt when deployment email is disabled', async () => {
  const { delivery } = await pending(), send = vi.fn()
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'false'); await deliver(delivery.id, { send })
  expect(send).not.toHaveBeenCalled(); expect(await row(delivery.id)).toMatchObject({ state: 'PENDING', attempts: 0, leaseUntil: null })
})
it('rechecks current organization admin permission for queued channel tests', async () => {
  const group = await channel()
  const delivery = await db().notificationChannelDelivery.create({ data: { channelId: group.id, organizationId: org, recipient: group.recipients[0], requestedById: owner, kind: 'TEST' } })
  await db().organizationMembership.updateMany({ where: { identityId: owner }, data: { role: 'DEVELOPER' } })
  const send = vi.fn(); await deliver(delivery.id, { send }); expect(send).not.toHaveBeenCalled()
  expect(await row(delivery.id)).toMatchObject({ state: 'SKIPPED', failureCode: 'ACCESS_REVOKED' })
})
it('stops after five durable transport failures, without leaking raw SMTP errors', async () => {
  const { delivery } = await pending(), send = vi.fn().mockRejectedValue(new Error('smtp credentials and server detail'))
  for (let attempt = 1; attempt <= 5; attempt++) {
    await db().notificationChannelDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date(0) } })
    await deliver(delivery.id, { send }); expect((await row(delivery.id)).attempts).toBe(attempt)
  }
  expect(await row(delivery.id)).toMatchObject({ state: 'FAILED', failureCode: 'DELIVERY_UNAVAILABLE', leaseUntil: null })
  await deliver(delivery.id, { send }); expect(send).toHaveBeenCalledTimes(5)
})
it('recovers an expired lease but does not duplicate an active one', async () => {
  const { delivery } = await pending(), send = vi.fn().mockResolvedValue(undefined)
  await db().notificationChannelDelivery.update({ where: { id: delivery.id }, data: { leaseUntil: new Date(Date.now() + 60000), attempts: 1 } })
  await deliver(delivery.id, { send }); expect(send).not.toHaveBeenCalled()
  await db().notificationChannelDelivery.update({ where: { id: delivery.id }, data: { leaseUntil: new Date(0) } })
  await deliver(delivery.id, { send }); expect(send).toHaveBeenCalledOnce(); expect((await row(delivery.id)).attempts).toBe(2)
})
it('does not resend after SMTP acceptance when database acknowledgement fails', async () => {
  const { delivery } = await pending(), send = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(db(), '$transaction').mockRejectedValueOnce(new Error('ack failed'))
  await deliver(delivery.id, { send }); expect(await row(delivery.id)).toMatchObject({ state: 'FAILED', failureCode: 'DELIVERY_UNCONFIRMED' })
  await deliver(delivery.id, { send }); expect(send).toHaveBeenCalledOnce()
})
it.each([false, true])('records in-flight acceptance during pause accurately, including acknowledgement failure %s', async (ackFails) => {
  const { group, delivery } = await pending()
  let accepted!: () => void, started!: () => void
  const start = new Promise<void>((resolve) => { started = resolve }), completion = new Promise<void>((resolve) => { accepted = resolve })
  const send = vi.fn(async () => { started(); await completion })
  const running = deliver(delivery.id, { send }); await start
  await service.update(session, group.id, { expectedRevision: group.revision, enabled: false })
  expect((await row(delivery.id)).state).toBe('SKIPPED')
  if (ackFails) vi.spyOn(db(), '$transaction').mockRejectedValueOnce(new Error('ack failed'))
  accepted(); await running
  expect(await row(delivery.id)).toMatchObject(ackFails ? { state: 'FAILED', failureCode: 'DELIVERY_UNCONFIRMED' } : { state: 'SENT', failureCode: null })
  expect((await row(delivery.id)).sentAt).not.toBeNull()
  const second = await db().notificationChannelDelivery.findFirstOrThrow({ where: { id: { not: delivery.id } } })
  await deliver(second.id, { send }); expect(send).toHaveBeenCalledOnce(); expect((await row(second.id)).state).toBe('SKIPPED')
})
it('uses namespaced ID-only queue jobs and recovers retained failed jobs without exposing recipients', async () => {
  const { delivery } = await pending(), remove = vi.fn(), add = vi.fn(), getJob = vi.fn().mockResolvedValue({ getState: async () => 'failed', remove })
  await dispatchNotificationChannelEmails(db(), { add, getJob })
  expect(remove).toHaveBeenCalled(); expect(add).toHaveBeenCalledWith('channel-email', { deliveryId: delivery.id, channel: true }, { jobId: `channel-${delivery.id}`, attempts: 1, removeOnComplete: true, removeOnFail: 1000 })
  expect(JSON.stringify(add.mock.calls)).not.toContain('example.test')
  await db().notificationChannelDelivery.updateMany({ data: { attempts: 5, leaseUntil: null } })
  add.mockClear(); await dispatchNotificationChannelEmails(db(), { add, getJob }); expect(add).not.toHaveBeenCalled()
  expect((await row(delivery.id)).failureCode).toBe('DELIVERY_UNCONFIRMED')
})
it('sends event and test messages through real loopback SMTP, without private repository data or other recipients', async () => {
  const messages: string[] = []
  const server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, _session, callback) {
    let message = ''; stream.on('data', (chunk) => { message += chunk.toString() }); stream.on('end', () => { messages.push(message); callback() })
  } })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const mail = new NotificationMailer()
  try {
    vi.stubEnv('SMTP_HOST', '127.0.0.1'); vi.stubEnv('SMTP_PORT', String((server.server.address() as { port: number }).port))
    vi.stubEnv('SMTP_FROM', 'preflyt@example.test'); vi.stubEnv('SMTP_ALLOW_INSECURE_LOCAL', 'true'); vi.stubEnv('SMTP_USER', ''); vi.stubEnv('SMTP_PASSWORD', '')
    const { group, delivery } = await pending(); await deliver(delivery.id, mail)
    expect((await row(delivery.id)).state).toBe('SENT')
    await service.test(session, group.id, { expectedRevision: group.revision })
    const test = await db().notificationChannelDelivery.findFirstOrThrow({ where: { kind: 'TEST' } }); await deliver(test.id, mail)
    expect(messages).toHaveLength(2); expect((await row(test.id)).state).toBe('SENT')
    for (const message of messages) {
      expect(message).toContain('http://localhost:5173/notifications'); expect(message).not.toContain('sensitive-repo'); expect(message).not.toContain('a'.repeat(40))
      expect(message).not.toContain('Manage optional email'); expect(message).not.toContain('Bcc:'); expect(message).not.toContain('Cc:')
    }
    expect(messages[1]).toContain('Subject: Preflyt email channel test')
  } finally { mail.close(); await new Promise<void>((resolve) => server.close(resolve)) }
})

it.skipIf(!process.env.NOTIFICATION_TEST_REDIS_URL)('delivers and reconciles a channel through real Redis/BullMQ with an isolated prefix', async () => {
  const { delivery } = await pending(), send = vi.fn().mockResolvedValue(undefined)
  const prefix = `preflyt-channel-mail-test-${randomUUID()}`
  const config = queueConfig(process.env.NOTIFICATION_TEST_REDIS_URL!, prefix), consumerConfig = queueConfig(process.env.NOTIFICATION_TEST_REDIS_URL!, prefix, true)
  const producer = new Redis(config.connection), consumer = new Redis(consumerConfig.connection)
  const queue = new Queue('notification-email', { ...config, connection: producer })
  const worker = new Worker('notification-email', async (job) => {
    expect(job.data.channel).toBe(true)
    await deliver(job.data.deliveryId, { send })
  }, { ...consumerConfig, connection: consumer })
  try {
    await worker.waitUntilReady(); await dispatchNotificationChannelEmails(db(), queue)
    await vi.waitFor(async () => { expect((await row(delivery.id)).state).toBe('SENT') }, { timeout: 5000, interval: 100 })
    await vi.waitFor(async () => { expect(await db().notificationChannelDelivery.count({ where: { state: 'SENT' } })).toBe(2) }, { timeout: 5000, interval: 100 })
    await dispatchNotificationChannelEmails(db(), queue); expect(send).toHaveBeenCalledTimes(2)
  } finally { await worker.close(); await queue.obliterate({ force: true }); await queue.close(); producer.disconnect(); consumer.disconnect() }
})
