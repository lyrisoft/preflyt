import {disposableDatabase} from './disposable-database.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { GitHubEventProcessor } from '../src/github-events/github-event-processor.js'
import { GitHubEventDispatcher, queueConfig, queueName } from '../src/github-events/github-event-queue.js'

const prefix = `preflyt-test-${randomUUID()}`
const url = process.env.TEST_QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6379/1'
let prisma: PrismaService
let queue: Queue
let worker: Worker | undefined
const connections: Redis[] = []
function config(worker = false) {
  const options = queueConfig(url, prefix, worker)
  const connection = new Redis(options.connection)
  connection.on('error', () => undefined)
  connections.push(connection)
  return { ...options, connection }
}
const ids: string[] = []

beforeAll(async () => {
  fixture = await disposableDatabase('githubeventqueue')
  prisma = fixture.prisma
  await prisma.gitHubWebhookDelivery.deleteMany()
  queue = new Queue(queueName, config())
  queue.on('error', () => undefined)
  await queue.waitUntilReady()
})
afterAll(async () => {
  await worker?.close()
  // The prefix is generated only for this test. Never touch the user's queues.
  await queue?.obliterate({ force: true })
  await queue?.close()
  connections.forEach(connection => connection.disconnect())
  await prisma?.gitHubWebhookDelivery.deleteMany({ where: { id: { in: ids } } })
  await fixture?.close()
})
async function delivery() {
  const id = randomUUID(); ids.push(id)
  await prisma.gitHubWebhookDelivery.create({ data: { id, payloadHash: 'a'.repeat(64), event: 'workflow_run', action: 'completed',
    installationId: 99999n, repositoryGithubId: 99999n, sourceSha: 'b'.repeat(40), sourceObjectId: '1' } })
  return id
}

describe('PostgreSQL inbox to isolated BullMQ queue', () => {
  it('retains the inbox when dispatch fails, reconciles after recovery, and prevents duplicate pending jobs', async () => {
    const id = await delivery()
    const failedQueue = { getJob: vi.fn(async () => undefined), add: vi.fn(async () => { throw new Error('Redis unavailable') }) }
    await expect(new GitHubEventDispatcher(prisma, failedQueue as unknown as Queue).reconcile()).rejects.toThrow()
    expect((await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } })).state).toBe('RECEIVED')
    const dispatcher = new GitHubEventDispatcher(prisma, queue)
    await dispatcher.reconcile()
    await dispatcher.reconcile()
    const jobs = await queue.getJobs(['wait'])
    expect(jobs.filter(job => job.id === id)).toHaveLength(1)
    expect(jobs.find(job => job.id === id)?.data).toEqual({ deliveryId: id })
    // Simulate loss of this one transport job, keeping PostgreSQL as the recovery record.
    await (await queue.getJob(id))!.remove()
    await dispatcher.reconcile()
    expect(await queue.getJob(id)).toBeDefined()
    const processor = new GitHubEventProcessor(prisma)
    worker = new Worker(queueName, job => processor.process(job.data.deliveryId), config(true))
    worker.on('error', () => undefined)
    const deadline = Date.now() + 5000
    while (Date.now() < deadline && (await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } })).state === 'RECEIVED') await delay(25)
    expect((await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } })).state).toBe('IGNORED')
    await worker.close(); worker = undefined
    expect(await dispatcher.reconcile()).toBe(0)
  })

  it('supports TLS/auth/database queue URLs and rejects unsupported schemes or prefixes', () => {
    const config = queueConfig('rediss://worker:pass@redis.example.test:6380/2', 'preflyt:test')
    expect(config.connection).toMatchObject({ host: 'redis.example.test', port: 6380, db: 2, username: 'worker', password: 'pass', tls: {}, maxRetriesPerRequest: 1, enableOfflineQueue: false })
    expect(() => queueConfig('https://example.test', prefix)).toThrow('Invalid queue configuration')
    expect(() => queueConfig(url, 'bad prefix')).toThrow('Invalid queue configuration')
  })
})
