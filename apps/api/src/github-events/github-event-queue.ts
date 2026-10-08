import { Queue } from 'bullmq'
import type { RedisOptions } from 'ioredis'
import { PrismaService } from '../prisma/prisma.service.js'

export const queueName = 'github-events'
export function queueConfig(url: string, prefix: string, worker = false) {
  const parsed = new URL(url)
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !/^[a-zA-Z0-9:_-]{1,100}$/.test(prefix)) throw new Error('Invalid queue configuration')
  const db = parsed.pathname.slice(1) || '0'
  if (!/^[0-9]{1,2}$/.test(db)) throw new Error('Invalid queue database')
  const connection: RedisOptions = {
    host: parsed.hostname, port: Number(parsed.port || 6379), db: Number(db),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 1000, maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker, ...(worker ? {} : { commandTimeout: 1000 }),
  }
  return { connection, prefix }
}

export class GitHubEventDispatcher {
  constructor(private readonly prisma: PrismaService, private readonly queue: Queue) {}

  async reconcile() {
    // Redis is transport, not the source of truth. Recovery also covers Redis data loss.
    const pending = await this.prisma.gitHubWebhookDelivery.findMany({
      where: { state: 'RECEIVED' }, orderBy: { receivedAt: 'asc' }, take: 100,
    })
    for (const delivery of pending) {
      const job = await this.queue.getJob(delivery.id)
      if (job && ['failed', 'completed'].includes(await job.getState())) await job.remove()
      await this.queue.add('process-delivery', { deliveryId: delivery.id }, {
        jobId: delivery.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true, removeOnFail: { count: 1000 },
      })
    }
    return pending.length
  }
}
