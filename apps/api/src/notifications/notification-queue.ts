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
