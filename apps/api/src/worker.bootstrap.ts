import {
  telemetryLog,
  telemetryOperation,
  shutdownTelemetry,
} from './telemetry.js'
import 'reflect-metadata'
import { writeFile, unlink } from 'node:fs/promises'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { RedisCacheService } from './cache/redis-cache.service.js'
import { GitHubProviderService } from './github/github-provider.service.js'
import { GitHubSyncService } from './github/github-sync.service.js'
import { PrismaService } from './prisma/prisma.service.js'
import { GitHubEventProcessor } from './github-events/github-event-processor.js'
import {
  GitHubEventDispatcher,
  queueConfig,
  queueName,
} from './github-events/github-event-queue.js'

async function start() {
  if (!process.env.QUEUE_REDIS_URL)
    throw new Error('Configure QUEUE_REDIS_URL before starting the worker')
  const prefix = process.env.QUEUE_PREFIX ?? 'preflyt:queue'
  const producerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix)
  const consumerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix, true)
  const prisma = new PrismaService()
  await prisma.$connect()
  const producer = new Redis(producerConfig.connection)
  const consumer = new Redis(consumerConfig.connection)
  const queue = new Queue(queueName, {
    ...producerConfig,
    connection: producer,
  })
  const cache = new RedisCacheService()
  const githubProvider = new GitHubProviderService(cache, prisma)
  const sync = new GitHubSyncService(prisma, githubProvider)
  const processor = new GitHubEventProcessor(prisma)
  const dispatcher = new GitHubEventDispatcher(prisma, queue)
  const worker = new Worker(
    queueName,
    async (job) => {
      if (
        typeof job.data?.deliveryId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(job.data.deliveryId)
      )
        throw new Error('Invalid delivery job')
      if (job.data.lifecycle) {
        const access = await prisma.gitHubAccessDelivery.findUnique({
          where: { id: job.data.deliveryId },
        })
        if (!access || access.state !== 'RECEIVED') return
        await sync.sync(access.installationId)
        await prisma.gitHubAccessDelivery.updateMany({
          where: { id: access.id, state: 'RECEIVED' },
          data: { state: 'PROCESSED', processedAt: new Date() },
        })
        return
      }
      const delivery = await prisma.gitHubWebhookDelivery.findUnique({
        where: { id: job.data.deliveryId },
        select: { traceParent: true },
      })
      return telemetryOperation(
        'preflyt.github.event.process',
        { 'delivery.id': job.data.deliveryId },
        () => processor.process(job.data.deliveryId),
        delivery?.traceParent,
      )
    },
    {
      ...consumerConfig,
      connection: consumer,
      concurrency: 4,
    },
  )
  let lastWarning = 0
  const warn = () => {
    if (Date.now() - lastWarning > 5000) {
      console.warn(
        'GitHub event worker unavailable; accepted deliveries remain in PostgreSQL',
      )
      telemetryLog('preflyt.worker.unavailable')
      lastWarning = Date.now()
    }
  }
  producer.on('error', warn)
  consumer.on('error', warn)
  queue.on('error', warn)
  worker.on('error', warn)
  worker.on('failed', (job) => {
    if (job && job.attemptsMade >= 5) {
      const args = {
        where: { id: job.data.deliveryId, state: 'RECEIVED' as const },
        data: { state: 'FAILED' as const, processedAt: new Date() },
      }
      void (
        job.data.lifecycle
          ? prisma.gitHubAccessDelivery.updateMany(args)
          : prisma.gitHubWebhookDelivery.updateMany(args)
      ).catch(warn)
    }
  })
  let closing = false
  let reconciling = false
  let syncRun: Promise<void> | undefined
  const heartbeat =
    process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/preflyt-github-worker-heartbeat'
  const reconcile = async () => {
    if (closing || reconciling) return
    reconciling = true
    try {
      await dispatcher.reconcile()
      if (!syncRun) {
        syncRun = sync
          .reconcile()
          .catch(warn)
          .finally(() => {
            syncRun = undefined
          })
      }
      // Test Redis even when the inbox is empty; readiness is not a stale process flag.
      await queue.getJobCounts('wait')
      if (!closing)
        await writeFile(heartbeat, String(Date.now()), { mode: 0o600 })
    } catch {
      warn()
    } finally {
      reconciling = false
    }
  }
  const timer = setInterval(() => void reconcile(), 5000)
  await unlink(heartbeat).catch(() => undefined)
  void reconcile()
  async function stop() {
    if (closing) return
    closing = true
    clearInterval(timer)
    sync.close()
    githubProvider.close()
    const force = consumer.status !== 'ready'
    if (force) {
      producer.disconnect()
      consumer.disconnect()
    }
    await worker.close(force)
    await queue.close()
    producer.disconnect()
    consumer.disconnect()
    await syncRun
    cache.onModuleDestroy()
    await prisma.$disconnect()
    await unlink(heartbeat).catch(() => undefined)
    await shutdownTelemetry()
    // The dedicated worker owns this process; cleanup is complete even if Redis retry timers remain.
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
  console.info('GitHub event worker started')
  telemetryLog('preflyt.worker.started')
}
void start().catch(() => {
  console.error(
    'GitHub event worker startup failed; check database and queue configuration',
  )
  process.exit(1)
})
