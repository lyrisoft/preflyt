import { randomUUID } from 'node:crypto'
import type { Prisma, NotificationEvent } from '../generated/prisma/client.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuthorizationService } from '../auth/authorization.service.js'
import { notificationsEnabled } from './notification-event.js'
import { emailNotificationsEnabled, validNotificationEmail, type NotificationEmailKind } from './notification-mail.js'

/** Called inside event fan-out, only after confirming the repository still belongs to this organization. */
export async function queueOrganizationChannelEmails(tx: Prisma.TransactionClient, event: NotificationEvent) {
  if (!notificationsEnabled() || !emailNotificationsEnabled()) return
  const channels = await tx.organizationNotificationChannel.findMany({
    where: { organizationId: event.organizationId, enabled: true, deletedAt: null, type: 'EMAIL' }, take: 10,
  })
  await tx.notificationChannelDelivery.createMany({
    data: channels.flatMap((channel) => channel.recipients.filter(validNotificationEmail).map((recipient) => ({
      id: randomUUID(), channelId: channel.id, eventId: event.id, organizationId: event.organizationId, recipient, kind: 'EVENT',
    }))), skipDuplicates: true,
  })
}

/** Durable leases and current channel/scope checks are independent of the Redis queue's lifetime. */
export async function deliverNotificationChannelEmail(db: PrismaService, authorization: AuthorizationService,
  mail: { send(to: string, id: string, kind?: NotificationEmailKind, eventType?: string): Promise<void> }, id: string) {
  if (!notificationsEnabled() || !emailNotificationsEnabled()) return
  const now = new Date(), leaseUntil = new Date(now.getTime() + 60000)
  const claimed = await db.notificationChannelDelivery.updateMany({
    where: { id, state: 'PENDING', attempts: { lt: 5 }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil, attempts: { increment: 1 } },
  })
  if (!claimed.count) return
  const delivery = await db.notificationChannelDelivery.findUniqueOrThrow({ where: { id } })
  const owned = { id, state: 'PENDING', leaseUntil, attempts: delivery.attempts }
  const skip = async (failureCode: string) => { await db.notificationChannelDelivery.updateMany({ where: owned, data: { state: 'SKIPPED', failureCode, leaseUntil: null } }) }
  let accepted = false
  try {
    if (delivery.kind === 'TEST') {
      if (!delivery.requestedById || delivery.eventId) { await skip('ACCESS_REVOKED'); return }
      await authorization.requireOrganization({ authenticated: true, identityId: delivery.requestedById,
        organizationId: delivery.organizationId, role: '', subject: '', email: null }, 'notifications.manage', true)
    } else if (delivery.kind !== 'EVENT' || !delivery.eventId) { await skip('SOURCE_UNAVAILABLE'); return }

    // Re-read immediately before SMTP. Pending work canceled by a channel edit stays canceled.
    const current = await db.notificationChannelDelivery.findFirst({ where: owned, include: { channel: true, event: true } })
    if (!current) return
    const channel = current.channel, event = current.event
    if (channel.organizationId !== delivery.organizationId || channel.type !== 'EMAIL' || channel.deletedAt || !channel.enabled) {
      await skip('CHANNEL_UNAVAILABLE'); return
    }
    if (!validNotificationEmail(delivery.recipient) || !channel.recipients.includes(delivery.recipient)) { await skip('RECIPIENT_REMOVED'); return }
    if (delivery.kind === 'EVENT') {
      if (!event || event.organizationId !== delivery.organizationId || !await db.gitHubRepository.findFirst({ where: {
        id: event.repositoryId, githubId: BigInt(event.repositoryGithubId), selected: true, available: true,
        installation: { active: true, organizationId: delivery.organizationId },
      }, select: { id: true } })) { await skip('SOURCE_UNAVAILABLE'); return }
    }
    if (!notificationsEnabled() || !emailNotificationsEnabled()) {
      await db.notificationChannelDelivery.updateMany({ where: owned, data: { leaseUntil: null, attempts: { decrement: 1 } } }); return
    }
    // One message per recipient. No repository names, SHAs, findings, source, logs or configuration secrets.
    await mail.send(delivery.recipient, delivery.id, delivery.kind === 'TEST' ? 'TEST' : 'ORGANIZATION', delivery.kind === 'EVENT' ? event?.type : undefined)
    accepted = true
    await db.$transaction(async (tx) => {
      const sentData = { state: 'SENT', sentAt: new Date(), leaseUntil: null, failureCode: null }
      let sent = await tx.notificationChannelDelivery.updateMany({ where: owned, data: sentData })
      // A pause cannot recall SMTP already in flight. Record acceptance, without reviving canceled work for retry.
      if (!sent.count) sent = await tx.notificationChannelDelivery.updateMany({ where: { id, attempts: delivery.attempts,
        state: 'SKIPPED', failureCode: { in: ['CHANNEL_DISABLED', 'CHANNEL_REMOVED', 'RECIPIENT_REMOVED'] } }, data: sentData })
      if (sent.count) await tx.auditEvent.create({ data: { event: 'notification.channel.email.sent', actorId: delivery.requestedById,
        metadata: { deliveryId: id, organizationId: delivery.organizationId, channelId: delivery.channelId, kind: delivery.kind } } })
    })
  } catch (error) {
    const status = typeof (error as { getStatus?: () => number })?.getStatus === 'function' ? (error as { getStatus: () => number }).getStatus() : null
    const forbidden = status === 403 || status === 401
    const failureData = {
      state: forbidden ? 'SKIPPED' : accepted || delivery.attempts >= 5 ? 'FAILED' : 'PENDING', leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** (delivery.attempts - 1))),
      failureCode: forbidden ? 'ACCESS_REVOKED' : accepted ? 'DELIVERY_UNCONFIRMED' : 'DELIVERY_UNAVAILABLE',
    }
    const failed = await db.notificationChannelDelivery.updateMany({ where: owned, data: failureData })
    if (accepted && !failed.count) await db.notificationChannelDelivery.updateMany({ where: { id, attempts: delivery.attempts,
      state: 'SKIPPED', failureCode: { in: ['CHANNEL_DISABLED', 'CHANNEL_REMOVED', 'RECIPIENT_REMOVED'] } },
      data: { ...failureData, state: 'FAILED', sentAt: new Date(), failureCode: 'DELIVERY_UNCONFIRMED' } })
  }
}
