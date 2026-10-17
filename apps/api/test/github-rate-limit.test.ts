import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GitHubRequestLimiter,
  GitHubRateLimitError,
  rateDelay,
} from '../src/github/github-rate-limit.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe('GitHub rate limit handling', () => {
  it('rechecks a shared cooldown established by another replica while a slot waited', async () => {
    const cache = {
      githubPermit: async () => 1,
      githubRemainingCooldown: async () => 60000,
    }
    const action = vi.fn(async () => new Response('ok'))
    await expect(
      new GitHubRequestLimiter(cache as any).run('shared', action),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
    expect(action).not.toHaveBeenCalled()
  })
  it('preserves SDK rate timing during installation verification', async () => {
    vi.stubEnv('GITHUB_APP_ID', '11')
    const action = vi.fn(async () => {
      throw { status: 429, response: { headers: { 'retry-after': '30' } } }
    })
    const provider = new GitHubProviderService()
    ;(provider as any).app = { octokit: { request: action } }
  ;(provider as any).appFingerprint = (provider as any).connectionFingerprint()
    await expect(provider.verifyInstallation(1n)).rejects.toBeInstanceOf(
      GitHubRateLimitError,
    )
    await expect(provider.verifyInstallation(1n)).rejects.toBeInstanceOf(
      GitHubRateLimitError,
    )
    expect(action).toHaveBeenCalledTimes(1)
  })
  it('honors primary reset and Retry-After without confusing ordinary permission failures', () => {
    const now = 1_000_000
    expect(
      rateDelay(
        403,
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1100' },
        '',
        now,
      ),
    ).toBe(101000)
    expect(rateDelay(429, { 'retry-after': '2' }, '', now)).toBe(3000)
    expect(
      rateDelay(
        403,
        { 'retry-after': new Date(now + 20000).toUTCString() },
        '',
        now,
      ),
    ).toBe(21000)
    expect(rateDelay(403, {}, 'secondary rate limit', now)).toBe(60000)
    expect(
      rateDelay(
        429,
        { 'retry-after': 'bad', 'x-ratelimit-reset': 'bad' },
        '',
        now,
      ),
    ).toBe(60000)
    expect(
      rateDelay(403, {}, 'Resource not accessible by integration', now),
    ).toBeNull()
    expect(rateDelay(401, { 'retry-after': '30' }, '', now)).toBeNull()
  })
  it('pauses subsequent requests locally and returns safe retry timing without upstream headers/body', async () => {
    const limiter = new GitHubRequestLimiter()
    const action = vi.fn(
      async () =>
        new Response('private diagnostic', {
          status: 429,
          headers: { 'retry-after': '5' },
        }),
    )
    try {
      await limiter.run('installation:1', action)
      expect.fail()
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubRateLimitError)
      expect((error as GitHubRateLimitError).getResponse()).toMatchObject({
        code: 'GITHUB_RATE_LIMITED',
        retryAfterSeconds: 6,
      })
      expect(JSON.stringify(error)).not.toContain('private diagnostic')
    }
    await expect(limiter.run('installation:1', action)).rejects.toBeInstanceOf(
      GitHubRateLimitError,
    )
    expect(action).toHaveBeenCalledTimes(1)
    await expect(
      limiter.run('installation:2', async () => new Response('ok')),
    ).resolves.toHaveProperty('status', 200)
  })
  it('detects headerless secondary limits in fetch and SDK errors', async () => {
    await expect(
      new GitHubRequestLimiter().run(
        'one',
        async () =>
          new Response(
            JSON.stringify({
              message: 'You have exceeded a secondary rate limit',
            }),
            { status: 403 },
          ),
      ),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
    await expect(
      new GitHubRequestLimiter().run('two', async () => {
        throw {
          status: 403,
          message: 'API rate limit exceeded',
          response: {
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 100),
            },
          },
        }
      }),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
  })
  it('bounds safe transient retries and never retries writes or permission errors', async () => {
    const get = vi.fn(async () => new Response(null, { status: 503 }))
    expect((await new GitHubRequestLimiter().run('get', get)).status).toBe(503)
    expect(get).toHaveBeenCalledTimes(3)
    const write = vi.fn(async () => new Response(null, { status: 503 }))
    await new GitHubRequestLimiter().run('write', write, false)
    expect(write).toHaveBeenCalledTimes(1)
    const denied = vi.fn(async () => new Response('denied', { status: 403 }))
    expect(
      (await new GitHubRequestLimiter().run('denied', denied)).status,
    ).toBe(403)
    expect(denied).toHaveBeenCalledTimes(1)
  })
  it('coalesces in-flight reads but does not cache authorization results', async () => {
    const limiter = new GitHubRequestLimiter()
    let release!: () => void
    const waiting = new Promise<void>((resolve) => (release = resolve))
    const action = vi.fn(async () => {
      await waiting
      return 'value'
    })
    const a = limiter.singleFlight('verify', action),
      b = limiter.singleFlight('verify', action)
    release()
    expect(await Promise.all([a, b])).toEqual(['value', 'value'])
    expect(action).toHaveBeenCalledTimes(1)
    await limiter.singleFlight('verify', action)
    expect(action).toHaveBeenCalledTimes(2)
  })
  it('preserves retry metadata through repository authorization and distinguishes rate from revocation', async () => {
    const provider = new GitHubProviderService()
    vi.spyOn(provider, 'verifyInstallation').mockRejectedValue(
      new GitHubRateLimitError(60000),
    )
    await expect(
      provider.verifyRepositoryAccess(1n, 2n),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
  })
  it('uses shared cooldowns before dispatching and hashes auth budget keys', async () => {
    const cache = {
      githubPermit: vi.fn(async () => 60000),
      githubRemainingCooldown: vi.fn(async () => 0),
      githubCooldown: vi.fn(),
    }
    const action = vi.fn(async () => new Response('ok'))
    await expect(
      new GitHubRequestLimiter(cache as any).run('user:secret-token', action),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
    expect(action).not.toHaveBeenCalled()
    expect(cache.githubPermit.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/)
  })
  it('records exhaustion on a successful final-budget response before the next call', async () => {
    const limiter = new GitHubRequestLimiter()
    await limiter.run(
      'last',
      async () =>
        new Response('ok', {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 30),
          },
        }),
    )
    const action = vi.fn(async () => new Response('ok'))
    await expect(limiter.run('last', action)).rejects.toBeInstanceOf(
      GitHubRateLimitError,
    )
    expect(action).not.toHaveBeenCalled()
  })
})

it('waits for a short shared request backlog instead of treating it as a GitHub failure',async()=>{
 const cache={githubPermit:vi.fn().mockResolvedValueOnce(2050).mockResolvedValue(0),githubRemainingCooldown:vi.fn(async()=>0)}
 const action=vi.fn(async()=>new Response('ok'))
 await expect(new GitHubRequestLimiter(cache as any).run('installation:burst',action)).resolves.toHaveProperty('status',200)
 expect(cache.githubPermit).toHaveBeenCalledTimes(2)
 expect(action).toHaveBeenCalledTimes(1)
})

it('shares team directory cooldowns with repository reads for the same installation',async()=>{
 const provider=new GitHubProviderService() as any
 vi.spyOn(provider,'verifyInstallation').mockResolvedValue({accountType:'Organization',accountId:22n,accountLogin:'fixture',permissions:{members:'read'}})
 vi.spyOn(provider,'installationToken').mockResolvedValue('fixture-token')
 const fetch=vi.fn(async()=>new Response('{}',{status:429,headers:{'retry-after':'60'}}))
 vi.stubGlobal('fetch',fetch)
 await expect(provider.withOrganizationMembers(1n,22n,(_token:string,_login:string,request:(path:string)=>Promise<Response>)=>request('/orgs/fixture/teams?per_page=100&page=1'))).rejects.toBeInstanceOf(GitHubRateLimitError)
 await expect(provider.verifyRepositoryAccess(1n,2n)).rejects.toBeInstanceOf(GitHubRateLimitError)
 expect(fetch).toHaveBeenCalledTimes(1)
 provider.close()
})
