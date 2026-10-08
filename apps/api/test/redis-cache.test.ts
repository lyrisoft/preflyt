import { randomUUID } from 'node:crypto'
import { createServer, type Socket } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@redis/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import { RedisCacheService } from '../src/cache/redis-cache.service.js'

const url = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/0'
const services: RedisCacheService[] = []
const prefixes: string[] = []
const originalUrl = process.env.REDIS_URL
const originalPrefix = process.env.REDIS_CACHE_PREFIX
const client = createClient({ url, socket: { connectTimeout: 1000, reconnectStrategy: false } })
client.on('error', () => undefined)

function service(connection = url) {
  process.env.REDIS_URL = connection
  const prefix = `preflyt:test:${randomUUID()}`
  process.env.REDIS_CACHE_PREFIX = prefix
  prefixes.push(prefix)
  const cache = new RedisCacheService()
  services.push(cache)
  return cache
}

afterEach(async () => {
  services.splice(0).forEach(cache => cache.onModuleDestroy())
  // Delete only the exact test keys; never flush a shared Redis database.
  if (client.isReady) {
    for (const prefix of prefixes.splice(0)) await client.del(`${prefix}:v1:inventory`)
  }
  if (originalUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalUrl
  if (originalPrefix === undefined) delete process.env.REDIS_CACHE_PREFIX
  else process.env.REDIS_CACHE_PREFIX = originalPrefix
  vi.restoreAllMocks()
})

describe('optional Redis cache against local Redis/Valkey', () => {
  it('isolates deployments, stores with expiry, and deletes only its own key', async () => {
    await client.connect()
    const a = service()
    const b = service()
    await a.set('inventory', 'metadata', 1)
    expect(await a.get('inventory')).toBe('metadata')
    expect(await b.get('inventory')).toBeNull()
    expect(await client.ttl(`${prefixes[0]}:v1:inventory`)).toBeGreaterThanOrEqual(0)
    await b.set('inventory', 'other-deployment', 30)
    await a.delete('inventory')
    expect(await a.get('inventory')).toBeNull()
    expect(await b.get('inventory')).toBe('other-deployment')
    await a.set('inventory', 'expires', 1)
    await delay(1100)
    expect(await a.get('inventory')).toBeNull()
    expect(await b.get('inventory')).toBe('other-deployment')
  })

  it('bypasses when disabled and rejects oversized values', async () => {
    const a = service()
    await a.set('inventory', 'x'.repeat(2 * 1024 * 1024 + 1), 30)
    expect(await a.get('inventory')).toBeNull()
    delete process.env.REDIS_URL
    const disabled = new RedisCacheService()
    services.push(disabled)
    await disabled.set('inventory', 'unused', 30)
    expect(await disabled.get('inventory')).toBeNull()
  })

  it('falls back promptly on unavailable Redis without logging credentials', async () => {
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const a = service('redis://secret-user:secret-password@127.0.0.1:1')
    const start = Date.now()
    expect(await a.get('inventory')).toBeNull()
    await a.set('inventory', 'unused', 30)
    await a.delete('inventory')
    expect(Date.now() - start).toBeLessThan(1500)
    expect(warning).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret')
  })

  it('bounds connection handshakes to an unresponsive Redis server', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const sockets = new Set<Socket>()
    const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const a = service(`redis://127.0.0.1:${address.port}`)
    try {
      const start = Date.now()
      expect(await a.get('inventory')).toBeNull()
      expect(Date.now() - start).toBeLessThan(1500)
    } finally {
      a.onModuleDestroy()
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})

afterAll(() => { if (client.isOpen) client.destroy() })
