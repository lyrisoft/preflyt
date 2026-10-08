import 'dotenv/config'
import 'reflect-metadata'
import { writeFile, unlink } from 'node:fs/promises'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { PrismaService } from './prisma/prisma.service.js'
import { GitHubEventProcessor } from './github-events/github-event-processor.js'
import { GitHubEventDispatcher, queueConfig, queueName } from './github-events/github-event-queue.js'

async function start() {
  if (process.env.GITHUB_EVENTS_ENABLED !== 'true' || !process.env.QUEUE_REDIS_URL)
    throw new Error('Enable GitHub events and configure QUEUE_REDIS_URL before starting the worker')
  const prefix = process.env.QUEUE_PREFIX ?? 'preflyt:queue'
  const producerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix)
  const consumerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix, true)
  const prisma = new PrismaService()
  await prisma.$connect()
  const producer = new Redis(producerConfig.connection)
  const consumer = new Redis(consumerConfig.connection)
  const queue = new Queue(queueName, { ...producerConfig, connection: producer })
  const processor = new GitHubEventProcessor(prisma)
  const dispatcher = new GitHubEventDispatcher(prisma, queue)
  const worker = new Worker(queueName, job => {
    if (typeof job.data?.deliveryId !== 'string' || !/^[a-f0-9-]{36}$/.test(job.data.deliveryId)) throw new Error('Invalid delivery job')
    return processor.process(job.data.deliveryId)
  }, {
    ...consumerConfig, connection: consumer, concurrency: 4,
  })
  let lastWarning = 0
  const warn = () => {
    if (Date.now() - lastWarning > 5000) {
      console.warn('GitHub event worker unavailable; accepted deliveries remain in PostgreSQL')
      lastWarning = Date.now()
    }
  }
  producer.on('error', warn)
  consumer.on('error', warn)
  queue.on('error', warn)
  worker.on('error', warn)
  worker.on('failed', job => {
    if (job && job.attemptsMade >= 5) {
      void prisma.gitHubWebhookDelivery.updateMany({ where: { id: job.data.deliveryId, state: 'RECEIVED' },
        data: { state: 'FAILED', reason: 'processing_failed', processedAt: new Date() } }).catch(warn)
    }
  })
  let closing = false
  let reconciling = false
  const heartbeat = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/preflyt-github-worker-heartbeat'
  const reconcile = async () => {
    if (closing || reconciling) return
    reconciling = true
    try {
      await dispatcher.reconcile()
      // Test Redis even when the inbox is empty; readiness is not a stale process flag.
      await queue.getJobCounts('wait')
      if (!closing) await writeFile(heartbeat, String(Date.now()), { mode: 0o600 })
    } catch { warn() } finally { reconciling = false }
  }
  const timer = setInterval(() => void reconcile(), 5000)
  await unlink(heartbeat).catch(() => undefined)
  void reconcile()
  async function stop() {
    if (closing) return
    closing = true
    clearInterval(timer)
    const force = consumer.status !== 'ready'
    if (force) { producer.disconnect(); consumer.disconnect() }
    await worker.close(force)
    await queue.close()
    producer.disconnect()
    consumer.disconnect()
    await prisma.$disconnect()
    await unlink(heartbeat).catch(() => undefined)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
  console.info('GitHub event worker started')
}
void start().catch(() => { console.error('GitHub event worker startup failed; check database and queue configuration'); process.exit(1) })
