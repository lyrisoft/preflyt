import type { Queue } from 'bullmq'
import type { PrismaService } from '../prisma/prisma.service.js'
export const notificationJobOptions = { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 1000 }
export async function dispatchNotifications(db: PrismaService, queue: Pick<Queue, 'add' | 'getJob'>) {
  const pending = await db.notificationEvent.findMany({ where: { deliveredAt: null, failedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 })
  for (const event of pending) {
    const previous = await queue.getJob(event.id)
    if (previous && ['completed', 'failed'].includes(await previous.getState())) await previous.remove()
    await queue.add('deliver', { eventId: event.id }, { ...notificationJobOptions, jobId: event.id })
  }
}
export async function recordDeliveryFailure(db: PrismaService, eventId: string) {
  // Count failures durably across Redis resets and worker restarts.
  await db.$transaction(async (tx) => {
    await tx.notificationEvent.updateMany({ where: { id: eventId, deliveredAt: null, failedAt: null }, data: { attempts: { increment: 1 } } })
    await tx.notificationEvent.updateMany({ where: { id: eventId, deliveredAt: null, attempts: { gte: notificationJobOptions.attempts } }, data: { failedAt: new Date() } })
  })
}

export async function dispatchNotificationEmails(db: PrismaService, queue: Pick<Queue, 'add' | 'getJob'>) {
  const now = new Date()
  await db.notificationEmailDelivery.updateMany({ where: { state: 'PENDING', attempts: { gte: 5 }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { state: 'FAILED', failureCode: 'DELIVERY_UNCONFIRMED', leaseUntil: null } })
  const pending = await db.notificationEmailDelivery.findMany({ where: { state: 'PENDING', attempts: { lt: 5 }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, orderBy: { createdAt: 'asc' }, take: 100 })
  for (const delivery of pending) {
    const previous = await queue.getJob(delivery.id)
    if (previous && ['completed', 'failed'].includes(await previous.getState())) await previous.remove()
    await queue.add('email', { deliveryId: delivery.id }, { jobId: delivery.id, attempts: 1, removeOnComplete: true, removeOnFail: 1000 })
  }
}
