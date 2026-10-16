import '@/styles/index.css'
import { createAppRouter } from '@/website-router'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PricingPage } from './pricing-page'

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})

it.each([320, 1440])(
  'website mode makes no API requests or auth links at %ipx',
  async (width) => {
    vi.stubEnv('VITE_WEBSITE_MODE', 'true')
    const fetch = vi.fn(() => Promise.reject(new Error('No API exists')))
    vi.stubGlobal('fetch', fetch)
    await page.viewport(width, 900)
    const view = await render(<PricingPage />)
    await expect.element(view.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      document.querySelector('a[href="/sign-in"], a[href="/overview"]')
    ).toBeNull()
    if (width === 320)
      await view.getByRole('button', { name: 'Open menu' }).click()
    expect(
      document.querySelector('a[href="/sign-in"], a[href="/overview"]')
    ).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  }
)

it('application mode retains session-aware access', async () => {
  vi.stubEnv('VITE_WEBSITE_MODE', 'false')
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ authenticated: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
  )
  vi.stubGlobal('fetch', fetch)
  const view = await render(<PricingPage />)
  await expect
    .element(view.getByRole('link', { name: 'Open workspace' }).first())
    .toBeVisible()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('website router contains only public paths', () => {
  const router = createAppRouter()
  const paths = Object.keys(router.routesByPath)
  expect(paths).toContain('/pricing')
  for (const path of [
    '/sign-in',
    '/super-admin/login',
    '/setup',
    '/overview',
    '/github-onboarding',
  ])
    expect(paths).not.toContain(path)
})
