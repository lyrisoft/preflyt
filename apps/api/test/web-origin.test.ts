import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { resolveWebOrigin } from '../src/config/web-origin.js'
import { GitHubController } from '../src/github/github.controller.js'
import { GitHubService } from '../src/github/github.service.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'
import type { GitHubProviderService } from '../src/github/github-provider.service.js'

afterEach(() => vi.unstubAllEnvs())
describe('GitHub local web-origin fallback', () => {
  it('normalizes an explicit origin and retains the development default', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://preflyt.example.com/')
    expect(resolveWebOrigin()).toBe('https://preflyt.example.com')
    vi.stubEnv('WEB_ORIGIN', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    expect(resolveWebOrigin()).toBe('http://localhost:5173')
  })
  it('does not introduce a production origin fallback', () => {
    vi.stubEnv('WEB_ORIGIN', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => resolveWebOrigin()).toThrow(
      'WEB_ORIGIN is required in production',
    )
  })
  it('redirects an invalid OAuth callback to a visible error instead of throwing 500 when the local origin is absent', async () => {
    vi.stubEnv('WEB_ORIGIN', undefined)
    vi.stubEnv('NODE_ENV', 'development')
    const service = new GitHubService(
      {} as PrismaService,
      {} as GitHubProviderService,
    )
    const controller = new GitHubController(service)
    const redirect = vi.fn()
    const response = { clearCookie: vi.fn(), redirect } as unknown as Response
    await controller.oauthCallback(
      { cookies: {}, query: { code: 'fixture-code' } } as unknown as Request,
      response,
    )
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:5173/repositories?github=error',
    )
  })
})

it('returns successful GitHub connection feedback to the canonical repository URL', async () => {
 const service={frontendOrigin:'http://localhost:5173',setupCookieName:'github.setup',secureCookie:false,
  completeUserAuthorization:vi.fn(async()=>({accountLogin:'lyrisoft'}))} as unknown as GitHubService
 const controller=new GitHubController(service), redirect=vi.fn()
 const response={clearCookie:vi.fn(),redirect} as unknown as Response
 await controller.oauthCallback({cookies:{},query:{state:'state',code:'code'}} as unknown as Request,response)
 expect(redirect).toHaveBeenCalledWith('http://localhost:5173/repositories?github=connected&account=lyrisoft')
})
it('sends fresh GitHub App setup callbacks to the canonical repository URL', async () => {
 const controller=new GitHubController({frontendOrigin:'http://localhost:5173'} as GitHubService), redirect=vi.fn()
 await controller.setupCallback({query:{}} as Request,{redirect} as unknown as Response)
 expect(redirect).toHaveBeenCalledWith('http://localhost:5173/repositories')
})
