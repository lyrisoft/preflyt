import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { createClient, type RedisClientType } from '@redis/client'

const timeoutMs = 500
const maxBytes = 2 * 1024 * 1024

/** Optional acceleration only. PostgreSQL and upstream access checks stay authoritative. */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name)
  private readonly url = process.env.REDIS_URL
  private readonly prefix = process.env.REDIS_CACHE_PREFIX ?? 'preflyt:cache'
  private client?: RedisClientType
  private connecting?: Promise<void>
  private retryAt = 0
  private closed = false

  private key(key: string) {
    return `${this.prefix}:v1:${key}`
  }

  private unavailable() {
    if (Date.now() >= this.retryAt) {
      // Never log connection URLs, credentials, keys, or cached payloads.
      this.logger.warn('Redis cache unavailable; using fresh source data')
    }
    this.retryAt = Date.now() + 5000
    if (this.client?.isOpen) this.client.destroy()
    this.client = undefined
  }

  private async ready() {
    if (!this.url || this.closed) return undefined
    if (this.client?.isReady) return this.client
    if (this.connecting) await this.connecting
    else if (Date.now() >= this.retryAt) {
      this.connecting = (async () => {
        try {
          const client = createClient({
            url: this.url,
            disableOfflineQueue: true,
            socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
          })
          this.client = client
          client.on('error', () => {
            if (this.client === client) this.unavailable()
          })
          // Bound the Redis handshake as well as TCP connect, without closing idle sockets.
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([
              client.connect(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  if (client.isOpen) client.destroy()
                  reject(new Error('Redis connection timed out'))
                }, timeoutMs)
              }),
            ])
          } finally {
            clearTimeout(timer)
          }
        } catch {
          this.unavailable()
        }
      })()
      try {
        await this.connecting
      } finally {
        this.connecting = undefined
      }
    }
    return this.client?.isReady ? this.client : undefined
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.ready()
      if (!client) return null
      const value = await client
        .withAbortSignal(AbortSignal.timeout(timeoutMs))
        .get(this.key(key))
      return value !== null && Buffer.byteLength(value) <= maxBytes
        ? value
        : null
    } catch {
      this.unavailable()
      return null
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (
      Buffer.byteLength(value) > maxBytes ||
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 1
    )
      return
    try {
      const client = await this.ready()
      await client
        ?.withAbortSignal(AbortSignal.timeout(timeoutMs))
        .set(this.key(key), value, { EX: ttlSeconds })
    } catch {
      this.unavailable()
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const client = await this.ready()
      await client
        ?.withAbortSignal(AbortSignal.timeout(timeoutMs))
        .del(this.key(key))
    } catch {
      this.unavailable()
    }
  }

  /** Atomic, Redis-clock pacing/cooldown across API replicas. Null means Redis unavailable. */
  async githubPermit(scope: string): Promise<number | null> {
    try {
      const client = await this.ready()
      if (!client) return null
      return Number(
        await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(
          `
        local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
        local cooldown=tonumber(redis.call('GET',KEYS[2]) or '0')
        if cooldown>now then return cooldown-now end
        local slot=math.max(now,tonumber(redis.call('GET',KEYS[1]) or '0'))
        if slot-now>2000 then return slot-now end
        redis.call('SET',KEYS[1],slot+250,'PX',10000)
        return slot-now
      `,
          {
            keys: [
              this.key('github:' + scope + ':pace'),
              this.key('github:' + scope + ':cooldown'),
            ],
            arguments: [],
          },
        ),
      )
    } catch {
      this.unavailable()
      return null
    }
  }

  async githubRemainingCooldown(scope: string): Promise<number | null> {
    try {
      const client = await this.ready()
      if (!client) return null
      return Number(
        await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(
          `
        local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
        return math.max(0,tonumber(redis.call('GET',KEYS[1]) or '0')-now)
      `,
          { keys: [this.key('github:' + scope + ':cooldown')], arguments: [] },
        ),
      )
    } catch {
      this.unavailable()
      return null
    }
  }

  async githubCooldown(scope: string, milliseconds: number): Promise<void> {
    try {
      const client = await this.ready()
      if (!client) return
      await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(
        `
        local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
        local untilAt=math.max(now+tonumber(ARGV[1]),tonumber(redis.call('GET',KEYS[1]) or '0'))
        redis.call('SET',KEYS[1],untilAt,'PX',math.ceil(untilAt-now))
        return 1
      `,
        {
          keys: [this.key('github:' + scope + ':cooldown')],
          arguments: [String(Math.max(1, Math.ceil(milliseconds)))],
        },
      )
    } catch {
      this.unavailable()
    }
  }

  onModuleDestroy() {
    this.closed = true
    if (this.client?.isOpen) this.client.destroy()
    this.client = undefined
  }
}
