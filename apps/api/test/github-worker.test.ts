import {disposableDatabase} from './disposable-database.js'
import {beforeAll, afterAll, vi} from 'vitest'
import { randomBytes } from 'node:crypto'
import { initializeConfiguration } from '../src/configuration/configuration-store.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
beforeAll(async () => {
 fixture = await disposableDatabase('worker')
 vi.stubEnv('CONFIGURATION_ENCRYPTION_KEY', randomBytes(32).toString('base64'))
 vi.stubEnv('GITHUB_EVENTS_ENABLED', 'true')
 await initializeConfiguration(fixture.prisma)
})
afterAll(async () => { await fixture?.close(); vi.unstubAllEnvs() })
import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { expect, it } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import {
  queueConfig,
  queueName,
} from '../src/github-events/github-event-queue.js'

it('runs the actual separate worker, reconciles an accepted delivery, reports health and shuts down', async () => {
  const prisma = new PrismaService()
  await prisma.$connect()
  const id = randomUUID()
  const prefix = `preflyt-worker-test-${id}`
  const heartbeat = `/tmp/preflyt-worker-test-${id}`
  const url = process.env.TEST_QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6379/1'
  const config = queueConfig(url, prefix)
  const connection = new Redis(config.connection)
  connection.on('error', () => undefined)
  const queue = new Queue(queueName, { ...config, connection })
  const notifications = new Queue('notifications', { ...config, connection })
  queue.on('error', () => undefined)
  await prisma.gitHubWebhookDelivery.create({
    data: {
      id,
      payloadHash: 'a'.repeat(64),
      event: 'workflow_run',
      action: 'completed',
      installationId: 99999n,
      repositoryGithubId: 99999n,
      sourceSha: 'd'.repeat(40),
      sourceObjectId: '1',
    },
  })
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GITHUB_APP_ID: '',
      OTEL_SDK_DISABLED: 'true',
      GITHUB_EVENTS_ENABLED: 'true',
      QUEUE_REDIS_URL: url,
      QUEUE_PREFIX: prefix,
      WORKER_HEARTBEAT_FILE: heartbeat,
    },
    stdio: 'ignore',
  })
  const exit = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  )
  try {
    const deadline = Date.now() + 7000
    let healthy = false
    while (Date.now() < deadline) {
      healthy = await readFile(heartbeat, 'utf8')
        .then((value) => Date.now() - Number(value) < 10_000)
        .catch(() => false)
      const record = await prisma.gitHubWebhookDelivery.findUniqueOrThrow({
        where: { id },
      })
      if (healthy && record.state === 'IGNORED') break
      await delay(25)
    }
    expect(healthy).toBe(true)
    expect(
      (await prisma.gitHubWebhookDelivery.findUniqueOrThrow({ where: { id } }))
        .state,
    ).toBe('IGNORED')
    const stored = await prisma.deploymentConfiguration.findUniqueOrThrow({ where: { id: 'primary' } })
    await prisma.deploymentConfiguration.update({ where: { id: 'primary' }, data: { values: { ...(stored.values as Record<string, string>), NOTIFICATIONS_ENABLED: 'true' } } })
    const notification = await notifications.add('live-toggle-fixture', { eventId: 'invalid_event_id' }, { attempts: 1 })
    const toggleDeadline = Date.now() + 12000
    while (Date.now() < toggleDeadline && await notification.getState() !== 'failed') await delay(50)
    // It rejects the deliberately invalid payload only after the previously
    // disabled consumer starts following a database toggle, without a restart.
    expect(await notification.getState()).toBe('failed')
    child.kill('SIGTERM')
    const exited = await Promise.race([exit, delay(3000).then(() => 'timeout')])
    expect(exited).toBe(0)
    expect(
      await readFile(heartbeat)
        .then(() => true)
        .catch(() => false),
    ).toBe(false)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exit
    }
    await notifications.obliterate({ force: true })
    await notifications.close()
    await queue.obliterate({ force: true })
    await queue.close()
    connection.disconnect()
    await prisma.gitHubWebhookDelivery.deleteMany({ where: { id } })
    await prisma.$disconnect()
    await unlink(heartbeat).catch(() => undefined)
  }
}, 25_000)

it('stays unhealthy and can stop while Redis is unavailable', async () => {
  const id = randomUUID()
  const heartbeat = `/tmp/preflyt-worker-test-${id}`
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GITHUB_APP_ID: '',
      OTEL_SDK_DISABLED: 'true',
      GITHUB_EVENTS_ENABLED: 'true',
      QUEUE_REDIS_URL: 'redis://127.0.0.1:1/1',
      QUEUE_PREFIX: `preflyt-test-${id}`,
      WORKER_HEARTBEAT_FILE: heartbeat,
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const exit = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  )
  let started = false
  child.stdout?.on('data', (chunk) => {
    if (String(chunk).includes('worker started')) started = true
  })
  try {
    const deadline = Date.now() + 3000
    while (!started && Date.now() < deadline) await delay(25)
    expect(started).toBe(true)
    expect(
      await readFile(heartbeat)
        .then(() => true)
        .catch(() => false),
    ).toBe(false)
    child.kill('SIGTERM')
    expect(await Promise.race([exit, delay(3000).then(() => 'timeout')])).toBe(
      0,
    )
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exit
    }
    await unlink(heartbeat).catch(() => undefined)
  }
}, 10_000)
