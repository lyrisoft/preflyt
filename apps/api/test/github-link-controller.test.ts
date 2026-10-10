import { beforeEach, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { GitHubLoginController } from '../src/auth/github-login.controller.js'
import type { GitHubLoginService } from '../src/auth/github-login.service.js'
import type { AuthService } from '../src/auth/auth.service.js'
const login = {
  transactionCookie: 'github-transaction',
  onboardingCookie: 'github-proof',
  isWorkspaceLinkCallback: vi.fn(),
  isIdentityLinkCallback: vi.fn(),
  complete: vi.fn(),
  enter: vi.fn(),
  cancelWorkspaceLink: vi.fn(),
  organizations: vi.fn(),
}
const auth = {
  sessionCookieName: 'admin-session',
  secureCookie: false,
  frontendOrigin: 'http://localhost:5173',
  assertOrigin: vi.fn(),
}
const controller = () =>
  new GitHubLoginController(
    login as unknown as GitHubLoginService,
    auth as unknown as AuthService,
  )
const request = (signedIn = true) =>
  ({
    query: { state: 'state', code: 'code' },
    headers: { origin: auth.frontendOrigin },
    cookies: {
      'github-transaction': 'binding',
      'github-proof': 'proof',
      ...(signedIn ? { 'admin-session': 'original-admin-token' } : {}),
    },
  }) as unknown as Request
const response = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
    json: vi.fn(),
  }) as unknown as Response
beforeEach(() => vi.resetAllMocks())
it('returns authorized linking to the app drawer without replacing the admin cookie', async () => {
  login.isWorkspaceLinkCallback.mockResolvedValue(true)
  login.complete.mockResolvedValue({
    challengeToken: 'proof',
    linkingWorkspace: true,
  })
  const res = response()
  await controller().callback(request(), res)
  expect(res.redirect).toHaveBeenCalledWith(
    auth.frontendOrigin + '/access-control?tab=github&githubLink=confirm',
  )
  expect(res.cookie).toHaveBeenCalledTimes(1)
  expect(vi.mocked(res.cookie).mock.calls[0]?.[0]).toBe('github-proof')
  expect(
    vi
      .mocked(res.clearCookie)
      .mock.calls.every(([name]) => name !== auth.sessionCookieName),
  ).toBe(true)
})
it('returns OAuth failure to Access Control and never clears the admin session', async () => {
  login.isWorkspaceLinkCallback.mockResolvedValue(true)
  login.complete.mockRejectedValue(new Error('Provider unavailable'))
  const res = response()
  await controller().callback(request(), res)
  expect(res.redirect).toHaveBeenCalledWith(
    auth.frontendOrigin + '/access-control?tab=github&githubLink=failed',
  )
  expect(res.cookie).not.toHaveBeenCalled()
  expect(
    vi
      .mocked(res.clearCookie)
      .mock.calls.every(([name]) => name !== auth.sessionCookieName),
  ).toBe(true)
})
it('keeps a signed-in administrator in the app even if callback context lookup fails', async () => {
  login.isWorkspaceLinkCallback.mockRejectedValue(
    new Error('Context unavailable'),
  )
  const res = response()
  await controller().callback(request(), res)
  expect(res.redirect).toHaveBeenCalledWith(
    auth.frontendOrigin + '/access-control?tab=github&githubLink=failed',
  )
})
it('keeps normal unauthenticated GitHub sign-in failure on the sign-in flow', async () => {
  login.isWorkspaceLinkCallback.mockResolvedValue(false)
  login.complete.mockRejectedValue(new Error('Provider unavailable'))
  const res = response()
  await controller().callback(request(false), res)
  expect(res.redirect).toHaveBeenCalledWith(
    auth.frontendOrigin + '/sign-in?error=github',
  )
})
it('keeps failed organization confirmation in place without changing any session cookie', async () => {
  login.enter.mockRejectedValue(
    new ForbiddenException('Members permission required'),
  )
  const res = response()
  await expect(
    controller().enter({ installationId: '41' }, request(), res),
  ).rejects.toThrow('Members permission')
  expect(res.clearCookie).not.toHaveBeenCalled()
  expect(res.cookie).not.toHaveBeenCalled()
  expect(res.redirect).not.toHaveBeenCalled()
})
it('cancellation verifies origin and clears only the link proof', async () => {
  const res = response()
  await controller().cancelLink(request(), res)
  expect(auth.assertOrigin).toHaveBeenCalledWith(auth.frontendOrigin)
  expect(login.cancelWorkspaceLink).toHaveBeenCalledWith(
    'proof',
    'original-admin-token',
  )
  expect(res.clearCookie).toHaveBeenCalledTimes(1)
  expect(vi.mocked(res.clearCookie).mock.calls[0]?.[0]).toBe('github-proof')
})

it('returns identity-link confirmation to Settings without replacing the original session', async () => {
  login.isIdentityLinkCallback.mockResolvedValue(true)
  login.complete.mockResolvedValue({ challengeToken: 'proof', linkingIdentity: true })
  const res = response()
  await controller().callback(request(), res)
  expect(res.redirect).toHaveBeenCalledWith(auth.frontendOrigin + '/organization-settings?identityLink=confirm')
  expect(res.cookie).toHaveBeenCalledTimes(1)
  expect(vi.mocked(res.cookie).mock.calls[0]?.[0]).toBe('github-proof')
})
it('returns failed identity proof to Settings and preserves the original session', async () => {
  login.isIdentityLinkCallback.mockResolvedValue(true)
  login.complete.mockRejectedValue(new Error('Provider unavailable'))
  const res = response()
  await controller().callback(request(), res)
  expect(res.redirect).toHaveBeenCalledWith(auth.frontendOrigin + '/organization-settings?identityLink=failed')
  expect(res.cookie).not.toHaveBeenCalled()
  expect(vi.mocked(res.clearCookie).mock.calls.every(([name]) => name !== auth.sessionCookieName)).toBe(true)
})
