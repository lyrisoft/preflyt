import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { ServiceUnavailableException } from '@nestjs/common'
import type { RedisCacheService } from '../cache/redis-cache.service.js'

/** Only non-secret read results belong here; never installation tokens or write results. */
export class GitHubSharedRead {
  private readonly pending = new Map<string, Promise<unknown>>()
  constructor(private readonly cache?: RedisCacheService) {}
  read<T>(key: string, ttl: number, refresh: boolean, load: () => Promise<T>, valid: (value: T) => boolean): Promise<T> {
    // A forced request must not join a regular cache hit that is already in flight.
    const flight = `${key}:${refresh ? 'refresh' : 'read'}`
    const pending = this.pending.get(flight)
    if (pending) return pending as Promise<T>
    const task = this.run(key, ttl, refresh, load, valid).finally(() => this.pending.delete(flight))
    this.pending.set(flight, task)
    return task
  }
  private async run<T>(key: string, ttl: number, refresh: boolean, load: () => Promise<T>, valid: (value: T) => boolean): Promise<T> {
    const started = Date.now(), owner = randomUUID()
    const baseline = refresh ? await this.cache?.get(key) : undefined
    const read = async () => {
      const raw = await this.cache?.get(key)
      if (!raw) return undefined
      try {
        const entry = JSON.parse(raw)
        if (typeof entry.savedAt === 'number' && entry.savedAt <= Date.now() && Date.now() - entry.savedAt < ttl * 1000 &&
          (!refresh || (raw !== baseline && entry.savedAt >= started)) && valid(entry.value)) return { value: entry.value as T }
      } catch { /* Invalid entries are replaced, never returned. */ }
      return undefined
    }
    if (!refresh) { const hit = await read(); if (hit) return hit.value }
    for (;;) {
      const acquired = await this.cache?.acquireLease?.(key, owner, 120_000)
      if (acquired == null) {
        if (this.cache?.configured) throw new ServiceUnavailableException('GitHub refresh coordination is unavailable. Try again shortly.')
        const value = await load()
        if (!valid(value)) throw new ServiceUnavailableException('GitHub returned invalid refresh data')
        await this.cache?.set(key, JSON.stringify({ savedAt: Date.now(), generation: owner, value }), ttl)
        return value
      }
      if (acquired) {
        try {
          // A previous owner may have published between our cache read and lease acquisition.
          const hit = await read()
          if (hit) return hit.value
          const value = await load()
          if (!valid(value)) throw new ServiceUnavailableException('GitHub returned invalid refresh data')
          if (!await this.cache!.finishLease(key, owner, JSON.stringify({ savedAt: Date.now(), generation: owner, value }), ttl))
            throw new ServiceUnavailableException('GitHub refresh expired. Retry to load the latest result.')
          return value
        } finally { await this.cache!.finishLease(key, owner) }
      }
      const hit = await read()
      if (hit) return hit.value
      if (Date.now() - started >= 30_000) throw new ServiceUnavailableException('GitHub refresh is still running. Try again shortly.')
      await delay(100 + Math.floor(Math.random() * 100))
    }
  }
}
