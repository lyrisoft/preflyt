import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@redis/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisCacheService } from '../src/cache/redis-cache.service.js'
import { GitHubSharedRead } from '../src/github/github-shared-read.js'
import { GitHubProviderService, GitHubInstallationRevokedError } from '../src/github/github-provider.service.js'
import { GitHubRequestLimiter, GitHubRateLimitError } from '../src/github/github-rate-limit.js'

describe.runIf(!!process.env.TEST_REDIS_URL)('shared GitHub coordination with real Redis', () => {
  const services: RedisCacheService[] = []
  let prefix: string
  let client: ReturnType<typeof createClient>
  const cache = () => { const service = new RedisCacheService(); services.push(service); return service }
  beforeEach(async () => {
    prefix = `preflyt:github-test:${randomUUID()}`
    vi.stubEnv('REDIS_URL', process.env.TEST_REDIS_URL!)
    vi.stubEnv('REDIS_CACHE_PREFIX', prefix)
    vi.stubEnv('GITHUB_APP_ID', '123')
    client = createClient({ url: process.env.TEST_REDIS_URL })
    await client.connect()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    services.splice(0).forEach(service => service.onModuleDestroy())
    if (client?.isReady) {
      const keys = await client.keys(`${prefix}:*`)
      if (keys.length) await client.del(keys)
      await client.quit()
    }
    vi.unstubAllEnvs()
  })

  it('100 readers across replicas share one load and one forced refresh', async () => {
    const readers = Array.from({ length: 10 }, () => new GitHubSharedRead(cache()))
    let revision = 1
    const load = vi.fn(async () => { await delay(40); return { revision } })
    const valid = (value: { revision: number }) => Number.isInteger(value?.revision)
    const read = (refresh: boolean) => Promise.all(Array.from({length: 100}, (_, i) => readers[i % 10].read('workflow', 300, refresh, load, valid)))
    expect((await read(false)).every(value => value.revision === 1)).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    revision = 2
    expect((await read(true)).every(value => value.revision === 2)).toBe(true)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('expired lease owners cannot publish or release a successor lease', async () => {
    const a = cache(), b = cache()
    expect(await a.acquireLease('read', 'old', 20)).toBe(true)
    await delay(40)
    expect(await b.acquireLease('read', 'new', 5000)).toBe(true)
    expect(await a.finishLease('read', 'old', 'stale', 30)).toBe(false)
    expect(await a.finishLease('read', 'old')).toBe(false)
    expect(await b.finishLease('read', 'new', 'current', 30)).toBe(true)
    expect(await a.get('read')).toBe('current')
  })

  it('reserves interactive budget, isolates installations, and ignores late higher observations', async () => {
    const a = cache(), b = cache(), reset = Date.now() + 60000
    await a.githubObserveBudget('one', 100, 11, reset)
    expect(await a.githubBudgetPermit('one', true, 10)).toMatchObject({granted: true})
    // Background spacing must never occupy the interactive lane until reset.
    expect(await b.githubBudgetPermit('one', false, 10)).toMatchObject({granted: true})
    await a.githubObserveBudget('one', 100, 50, reset)
    expect(await b.githubBudgetPermit('one', true, 10)).toMatchObject({granted: false, blocked: true})
    expect(await b.githubBudgetPermit('two', true, 10)).toMatchObject({granted: true})
    await a.githubObserveBudget('one', 100, 90, reset + 60000)
    await a.githubObserveBudget('one', 100, 0, reset)
    expect(await b.githubBudgetPermit('one', false, 10)).toMatchObject({granted: true})
  })

  it('refunds conditional responses only in the reserved reset window', async () => {
    const a = cache(), reset = Date.now() + 60000
    await a.githubObserveBudget('conditional', 100, 1, reset)
    expect(await a.githubBudgetPermit('conditional', false, 10)).toMatchObject({granted: true, reset})
    await a.githubRefundBudget('conditional', reset)
    expect(await a.githubBudgetPermit('conditional', false, 10)).toMatchObject({granted: true})
    await a.githubObserveBudget('conditional', 100, 0, reset + 60000)
    await a.githubRefundBudget('conditional', reset)
    expect(await a.githubBudgetPermit('conditional', false, 10)).toMatchObject({granted: false, blocked: true})
  })

  it('atomically grants only the remaining requests across replicas', async () => {
    const a = cache(), b = cache()
    await a.githubObserveBudget('small', 100, 3, Date.now() + 60000)
    const permits = await Promise.all(Array.from({length: 20}, (_, i) => (i % 2 ? a : b).githubBudgetPermit('small', false, 10)))
    expect(permits.filter(permit => permit?.granted)).toHaveLength(3)
    expect(permits.filter(permit => permit?.blocked)).toHaveLength(17)
  })

  it('worker budget deferral does not dispatch upstream or block another installation', async () => {
    vi.stubEnv('GITHUB_REQUEST_PRIORITY', 'background')
    const a = new GitHubRequestLimiter(cache())
    await a.run('installation:1', async () => new Response('{}', {headers: {
      'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 60),
    }}))
    const action = vi.fn(async () => new Response('{}'))
    const b = new GitHubRequestLimiter(cache())
    await expect(b.run('installation:1', action)).rejects.toBeInstanceOf(GitHubRateLimitError)
    expect(action).not.toHaveBeenCalled()
    await expect(b.run('installation:2', action)).resolves.toHaveProperty('status', 200)
    vi.stubEnv('GITHUB_REQUEST_PRIORITY', 'interactive')
    await expect(new GitHubRequestLimiter(cache()).run('installation:1', action)).resolves.toHaveProperty('status', 200)
  })

  function providers() {
    let revision = 1, active = true
    const counts = { verify: 0, metadata: 0, workflows: 0, branches: 0, contents: 0 }
    const instances = Array.from({length: 4}, () => {
      const provider = new GitHubProviderService(cache(), {gitHubInstallation: {findUnique: async () => ({accessRevision: revision, active})}} as any) as any
      vi.spyOn(provider, 'verifyInstallation').mockImplementation(async () => { counts.verify++; if (!active) throw new GitHubInstallationRevokedError(); return {id: 5n} })
      vi.spyOn(provider, 'installationToken').mockResolvedValue('fixture-token')
      vi.spyOn(provider, 'apiFetch').mockImplementation(async (_scope: string, url: string) => {
        const path = new URL(url).pathname
        let value: unknown
        if (path.startsWith('/repositories/')) { counts.metadata++; value = {id: 6, name: 'app', owner: {login: 'fixture'}, default_branch: 'main'} }
        else if (path.includes('/actions/')) { counts.workflows++; value = {total_count: 1, workflows: [{id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active'}]} }
        else if (path.includes('/branches/')) { counts.branches++; value = {commit: {sha: 'a'.repeat(40)}} }
        else { counts.contents++; const text = 'name: CI'; value = {type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64'), size: text.length, sha: 'b'.repeat(40), path: '.github/workflows/ci.yml'} }
        return new Response(JSON.stringify(value))
      })
      return provider
    })
    return {instances, counts, bump: () => revision++, revoke: () => { active = false; revision++ }}
  }

  it('shares bounded repository verification and workflow data across users, expires proof, and rejects revocation', async () => {
    const {instances, counts} = providers()
    const read = () => Promise.all(Array.from({length: 40}, (_, i) => instances[i % 4].readPipelineWorkflow(5n, 6n, '7', 'main')))
    await read()
    expect(counts).toEqual({verify: 1, metadata: 1, workflows: 1, branches: 1, contents: 1})
    await read()
    expect(counts.verify).toBe(1)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 31000)
    await instances[0].readPipelineWorkflow(5n, 6n, '7', 'main')
    expect(counts.verify).toBe(2)
    expect(counts.metadata).toBe(2)
    vi.restoreAllMocks() // Restore clock before closing; fixture mocks are needed below in a separate test.
    instances.forEach(instance => instance.close())
  })

  it('invalidates access and data on revision or connection changes and refuses removed access', async () => {
    const {instances, counts, bump, revoke} = providers()
    await instances[0].readPipelineWorkflow(5n, 6n, '7', 'main')
    bump()
    await instances[1].readPipelineWorkflow(5n, 6n, '7', 'main')
    expect(counts.verify).toBe(2)
    expect(counts.contents).toBe(2)
    vi.stubEnv('GITHUB_APP_ID', '456')
    await instances[2].readPipelineWorkflow(5n, 6n, '7', 'main')
    expect(counts.verify).toBe(3)
    revoke()
    await expect(instances[3].readPipelineWorkflow(5n, 6n, '7', 'main')).rejects.toThrow('access is unavailable')
    expect(counts.contents).toBe(3)
    instances.forEach(instance => instance.close())
  })

  it('requires fresh upstream access for explicit refreshes and non-display operations', async () => {
    const {instances, counts} = providers()
    await instances[0].readPipelineWorkflow(5n, 6n, '7', 'main')
    expect(counts.verify).toBe(1)
    await instances[0].openRepository(5n, 6n, 'contents')
    expect(counts.verify).toBe(2)
    vi.mocked(instances[0].verifyInstallation).mockRejectedValue(new GitHubInstallationRevokedError())
    await expect(instances[0].readPipelineWorkflow(5n, 6n, '7', 'main', true)).rejects.toThrow('access is unavailable')
    // A failed fresh verification invalidates the earlier reusable proof.
    await expect(instances[0].readPipelineWorkflow(5n, 6n, '7', 'main')).rejects.toThrow('access is unavailable')
    instances.forEach(instance => instance.close())
  })

  it('rejects results when the access revision changes during a refresh', async () => {
    const {instances, bump} = providers()
    const provider = instances[0]
    const original = provider.apiFetch.getMockImplementation()
    provider.apiFetch.mockImplementation(async (...args: any[]) => {
      const result = await original(...args)
      if (String(args[1]).includes('/contents/')) bump()
      return result
    })
    await expect(provider.readPipelineWorkflow(5n, 6n, '7', 'main')).rejects.toThrow('access changed')
    instances.forEach(instance => instance.close())
  })

  it('releases a failed refresh lease without replacing a previously cached value', async () => {
    const shared = new GitHubSharedRead(cache())
    await shared.read('failure', 30, false, async () => ({revision: 1}), () => true)
    await expect(shared.read('failure', 30, true, async () => { throw new Error('upstream unavailable') }, () => true)).rejects.toThrow('upstream unavailable')
    expect(await shared.read('failure', 30, true, async () => ({revision: 2}), () => true)).toEqual({revision: 2})
  })
})

it('fails closed when configured shared coordination is unavailable', async () => {
  const cache = {configured: true, get: async () => null, acquireLease: async () => null, githubBudgetPermit: async () => null} as any
  const load = vi.fn(async () => ({ok: true}))
  await expect(new GitHubSharedRead(cache).read('test', 30, false, load, () => true)).rejects.toThrow('coordination is unavailable')
  expect(load).not.toHaveBeenCalled()
  const action = vi.fn(async () => new Response('{}'))
  await expect(new GitHubRequestLimiter(cache).run('installation:1', action)).rejects.toThrow('coordination is unavailable')
  expect(action).not.toHaveBeenCalled()
})
