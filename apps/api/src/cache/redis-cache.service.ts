import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { createClient, type RedisClientType } from '@redis/client'

const timeoutMs = 500
const maxBytes = 2 * 1024 * 1024

/** Shared cache and coordination. PostgreSQL and bounded upstream checks remain authoritative. */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name)
  private readonly url = process.env.REDIS_URL
  private readonly prefix = process.env.REDIS_CACHE_PREFIX ?? 'preflyt:cache'
  private client?: RedisClientType
  private connecting?: Promise<void>
  private retryAt = 0
  private closed = false
  get configured() { return !!this.url }

  /** Owner-fenced leases: a timed-out loader cannot publish over its successor. */
  async acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean | null> {
    try {
      const client = await this.ready()
      if (!client) return null
      return (await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).set(this.key(key + ':lease'), owner, { NX: true, PX: ttlMs })) === 'OK'
    } catch { this.unavailable(); return null }
  }
  async finishLease(key: string, owner: string, value?: string, ttlSeconds = 1): Promise<boolean> {
    if (value !== undefined && Buffer.byteLength(value) > maxBytes) return false
    try {
      const client = await this.ready()
      if (!client) return false
      return Number(await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(`
        if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
        if ARGV[2]=='1' then redis.call('SET',KEYS[2],ARGV[3],'EX',ARGV[4]) end
        redis.call('DEL',KEYS[1]); return 1
      `, { keys: [this.key(key + ':lease'), this.key(key)], arguments: [owner, value === undefined ? '0' : '1', value ?? '', String(ttlSeconds)] })) === 1
    } catch { this.unavailable(); return false }
  }

  /** Keep the lowest observation within a reset window; late responses cannot refill it. */
  async githubObserveBudget(scope: string, limit: number, remaining: number, reset: number): Promise<void> {
    try {
      const client = await this.ready()
      if (!client) return
      await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(`
        local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
        local reset=tonumber(ARGV[3]); if reset<=now then return 0 end
        local old=tonumber(redis.call('HGET',KEYS[1],'reset') or '0')
        if old>reset then return 0 end
        local remaining=tonumber(ARGV[2])
        if old==reset then remaining=math.min(remaining,tonumber(redis.call('HGET',KEYS[1],'remaining') or remaining)) end
        redis.call('HSET',KEYS[1],'limit',ARGV[1],'remaining',remaining,'reset',reset)
        redis.call('PEXPIRE',KEYS[1],math.ceil(reset-now)); return 1
      `, { keys: [this.key('github:' + scope + ':budget')], arguments: [String(limit), String(remaining), String(reset)] })
    } catch { this.unavailable() }
  }

  async githubRefundBudget(scope: string, reset: number): Promise<void> {
    try {
      const client = await this.ready()
      if (!client) return
      await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(`
        if tonumber(redis.call('HGET',KEYS[1],'reset') or '0')~=tonumber(ARGV[1]) then return 0 end
        local remaining=tonumber(redis.call('HGET',KEYS[1],'remaining') or '-1')
        local limit=tonumber(redis.call('HGET',KEYS[1],'limit') or '0')
        if remaining>=0 and remaining<limit then redis.call('HINCRBY',KEYS[1],'remaining',1) end
        return 1
      `, {keys: [this.key('github:' + scope + ':budget')], arguments: [String(reset)]})
    } catch { this.unavailable() }
  }

  async githubBudgetPermit(scope: string, background: boolean, reservePercent: number): Promise<{ wait: number; granted: boolean; blocked: boolean; reset: number } | null> {
    try {
      const client = await this.ready()
      if (!client) return null
      const result = await client.withAbortSignal(AbortSignal.timeout(timeoutMs)).eval(`
        local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
        local cooldown=tonumber(redis.call('GET',KEYS[2]) or '0')
        if cooldown>now then return {math.ceil(cooldown-now),0,1} end
        local reset=tonumber(redis.call('HGET',KEYS[3],'reset') or '0')
        local remaining=tonumber(redis.call('HGET',KEYS[3],'remaining') or '0')
        local interval=250
        if reset>now then
          local reserve=0
          if ARGV[1]=='1' then reserve=math.ceil(tonumber(redis.call('HGET',KEYS[3],'limit') or '0')*tonumber(ARGV[2])/100) end
          if remaining<=reserve then return {math.ceil(reset-now),0,1} end
          if ARGV[1]=='1' then interval=math.max(250,math.ceil((reset-now)/(remaining-reserve))) end
        end
        local slot=math.max(now,tonumber(redis.call('GET',KEYS[1]) or '0'))
        if ARGV[1]=='1' then slot=math.max(slot,tonumber(redis.call('GET',KEYS[4]) or '0')) end
        if slot-now>2000 then return {math.ceil(slot-now),0,0} end
        redis.call('SET',KEYS[1],slot+250,'PX',math.ceil(slot-now+1250))
        if ARGV[1]=='1' then redis.call('SET',KEYS[4],slot+interval,'PX',math.ceil(slot-now+interval+1000)) end
        if reset>now then redis.call('HINCRBY',KEYS[3],'remaining',-1) end
        return {math.ceil(slot-now),1,0,reset>now and reset or 0}
      `, { keys: [this.key('github:' + scope + ':pace'), this.key('github:' + scope + ':cooldown'), this.key('github:' + scope + ':budget'), this.key('github:' + scope + ':background-pace')], arguments: [background ? '1' : '0', String(reservePercent)] }) as number[]
      return { wait: Number(result[0]), granted: result[1] === 1, blocked: result[2] === 1, reset: Number(result[3] ?? 0) }
    } catch { this.unavailable(); return null }
  }

  private key(key: string) {
    return `${this.prefix}:v1:${key}`
  }

  private unavailable() {
    if (Date.now() >= this.retryAt) {
      // Never log connection URLs, credentials, keys, or cached payloads.
      this.logger.warn('Redis unavailable; shared GitHub coordination is paused')
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
