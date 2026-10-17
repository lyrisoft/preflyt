import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { ReleasePanel, type ReleaseStatus } from './release-panel'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { identityId: 'owner' },
  }),
}))
let state: ReleaseStatus,
  failed = false
const fetched = vi.fn()
beforeEach(() => {
  failed = false
  const note = {
    tag: 'v0.2.0',
    name: 'Preflyt v0.2.0',
    body: '## Changes\nImproved repository reports.\n\n<script>alert(1)</script>\n\n![External image](https://attacker.example/tracker)\n\n[Unsafe](javascript:alert(1))',
    url: 'https://github.com/lyrisoft/preflyt/releases/tag/v0.2.0',
    publishedAt: '2026-10-17T00:00:00Z',
    ready: true,
    prerelease: false,
  }
  state = {
    installed: 'v0.1.2',
    sha: 'a'.repeat(40),
    development: false,
    latest: note,
    notes: [note],
    checkedAt: '2026-10-17T00:00:00Z',
    error: null,
    enabled: true,
    prereleases: false,
    revision: 1,
    updateAvailable: true,
    unread: true,
    canCheck: true,
    canConfigure: true,
  }
  vi.stubGlobal(
    'fetch',
    fetched
      .mockReset()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (failed)
          return Response.json(
            { message: 'Service unavailable' },
            { status: 503 }
          )
        if (url.endsWith('/read')) {
          state = { ...state, unread: false }
          return Response.json({ read: true })
        }
        if (url.endsWith('/preferences')) {
          state = { ...state, ...JSON.parse(init?.body as string), revision: 2 }
          return Response.json({ saved: true })
        }
        return Response.json(state)
      })
  )
})
async function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ReleasePanel />
    </QueryClientProvider>
  )
}
it('shows installed version, opens notes, marks them read and preserves the upgrade indicator', async () => {
  await mount()
  await expect
    .element(
      page.getByRole('button', {
        name: "What's new — v0.1.2 — Update available",
      })
    )
    .toBeVisible()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .element(page.getByRole('heading', { name: 'What’s new in Preflyt' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Upgrade guide' }))
    .toHaveAttribute(
      'href',
      'https://docs.preflytlabs.com/self-hosting/community-edition'
    )
  await expect
    .poll(() => fetched.mock.calls.some(([url]) => url.endsWith('/read')))
    .toBe(true)
  await expect
    .element(page.getByText('Update available', { exact: true }))
    .toBeVisible()
  expect(document.querySelector('[role=dialog] img')).toBeNull()
  expect(document.querySelector('[role=dialog] script')).toBeNull()
  expect(
    document.querySelector('[role=dialog] a[href^="javascript:"]')
  ).toBeNull()
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
})
it('limits upgrade notices and deployment preferences while allowing release notes for readers', async () => {
  state = { ...state, canCheck: false, canConfigure: false }
  await mount()
  await page.getByRole('button', { name: "What's new — v0.1.2" }).click()
  await expect
    .element(page.getByRole('heading', { name: 'Preflyt v0.2.0' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Check for updates' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Update available', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Update preferences', { exact: true }))
    .not.toBeInTheDocument()
})
it('supports manual checks and deployment preferences', async () => {
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect
    .poll(() => fetched.mock.calls.some(([url]) => url.endsWith('/check')))
    .toBe(true)
  await page.getByText('Update preferences', { exact: true }).click()
  await page
    .getByRole('switch', { name: 'Check automatically every 12 hours' })
    .click()
  await expect
    .poll(() =>
      fetched.mock.calls.some(([url]) => url.endsWith('/preferences'))
    )
    .toBe(true)
  const call = fetched.mock.calls.find(([url]) => url.endsWith('/preferences'))!
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    enabled: false,
    revision: 1,
  })
})
it('shows unavailable and development states without claiming an upgrade', async () => {
  state = {
    ...state,
    installed: 'development',
    development: true,
    latest: null,
    notes: [],
    updateAvailable: false,
    unread: false,
    error: 'GitHub is unavailable.',
  }
  await mount()
  await page.getByRole('button', { name: "What's new — Development" }).click()
  await expect
    .element(
      page.getByText(
        'Development build. Release upgrade comparisons are unavailable.'
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('GitHub is unavailable.')
})
it('keeps cached-failure handling usable at 320px in both themes', async () => {
  await page.viewport(320, 900)
  failed = true
  await mount()
  await page.getByRole('button', { name: "What's new — Development" }).click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Service unavailable')
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/releases-error-${dark ? 'dark' : 'light'}.png`,
    })
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
it('renders release notes at 320px and desktop in both themes', async () => {
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  for (const width of [320, 1440])
    for (const dark of [false, true]) {
      await page.viewport(width, 1000)
      document.documentElement.classList.toggle('dark', dark)
      await new Promise((resolve) => setTimeout(resolve, 350))
      await expect
        .element(page.getByRole('heading', { name: 'What’s new in Preflyt' }))
        .toBeVisible()
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `__screenshots__/releases-${width}-${dark ? 'dark' : 'light'}.png`,
      })
    }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
