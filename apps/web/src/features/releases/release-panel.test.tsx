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
    checkedAt: new Date().toISOString(),
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
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
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
    .getByRole('switch', { name: 'Check automatically every hour' })
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

it('refreshes stale release information on open and selects the newly published release', async () => {
  state = {
    ...state,
    checkedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  }
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .poll(
      () => fetched.mock.calls.filter(([url]) => url.endsWith('/check')).length
    )
    .toBe(1)
  const call = fetched.mock.calls.find(([url]) => url.endsWith('/check'))!
  expect(JSON.parse(call[1]!.body as string)).toEqual({ automatic: true })
})

it('does not check GitHub automatically or manually during the shared cooldown', async () => {
  state = {
    ...state,
    enabled: true,
    checkedAt: new Date(0).toISOString(),
    nextCheckAt: new Date(Date.now() + 60_000).toISOString(),
  }
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .element(page.getByRole('button', { name: 'Check for updates' }))
    .toBeDisabled()
  expect(fetched.mock.calls.some(([url]) => url.endsWith('/check'))).toBe(false)
  await expect.element(page.getByText(/Check again after/)).toBeVisible()
})

it('shows v0.1.5 after checking even when an older release was selected', async () => {
  const old = { ...state.notes[0], tag: 'v0.1.4', name: 'Preflyt v0.1.4' }
  const older = { ...old, tag: 'v0.1.3', name: 'Preflyt v0.1.3' }
  state = { ...state, latest: old, notes: [old, older] }
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await page.getByRole('combobox', { name: 'Release version' }).click()
  await page.getByRole('option', { name: 'v0.1.3', exact: true }).click()
  await expect
    .element(page.getByRole('heading', { name: 'Preflyt v0.1.3' }))
    .toBeVisible()
  const latest = { ...old, tag: 'v0.1.5', name: 'Preflyt v0.1.5' }
  state = {
    ...state,
    latest,
    notes: [latest, old, older],
    checkedAt: new Date().toISOString(),
  }
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect
    .element(page.getByRole('heading', { name: 'Preflyt v0.1.5' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('combobox', { name: 'Release version' }))
    .toHaveTextContent('v0.1.5 · Latest')
})

it('formats headings, lists and links and keeps build metadata behind a disclosure', async () => {
  const body = `All application images use v0.1.5 and sha-867774d7dd4369c25cbc2219a56f7388bc919a1c. Both linux/amd64 and linux/arm64 are available.

Upgrade guide: https://docs.preflytlabs.com/self-hosting/community-edition

## What's Changed
* Pause Dependabot update PRs by @iampeters in https://github.com/lyrisoft/preflyt/pull/128
* Pause Dependabot update PRs by @iampeters in https://github.com/lyrisoft/preflyt/pull/129
* Enhance GitHub sign-in with form submission and loading state by @iampeters in https://github.com/lyrisoft/preflyt/pull/130
* feat(sign-in): enhance GitHub sign-in with form submission and loading state by @iampeters in https://github.com/lyrisoft/preflyt/pull/131
* Fix Git-backed Health retries and policy preview clarity by @iampeters in https://github.com/lyrisoft/preflyt/pull/132
* Release Health retry, policy preview and public website fixes by @iampeters in https://github.com/lyrisoft/preflyt/pull/133

**Full Changelog**: https://github.com/lyrisoft/preflyt/compare/v0.1.4...v0.1.5`
  const note = {
    ...state.notes[0],
    tag: 'v0.1.5',
    name: 'Preflyt v0.1.5',
    body,
  }
  state = { ...state, latest: note, notes: [note] }
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .element(page.getByRole('heading', { name: "What's Changed", exact: true }))
    .toBeVisible()
  const heading = document.querySelector('.release-notes h3')!
  expect(Number(getComputedStyle(heading).fontWeight)).toBeGreaterThanOrEqual(
    600
  )
  expect(
    getComputedStyle(document.querySelector('.release-notes ul')!).listStyleType
  ).toBe('disc')
  await expect
    .element(page.getByRole('link', { name: 'Compare changes on GitHub' }))
    .toHaveAttribute(
      'href',
      'https://github.com/lyrisoft/preflyt/compare/v0.1.4...v0.1.5'
    )
  await expect
    .element(page.getByText(/All application images use/))
    .not.toBeVisible()
  expect(
    document.querySelector(
      '[role=dialog] img, [role=dialog] script, [role=dialog] a[href^="javascript:"]'
    )
  ).toBeNull()
  for (const width of [320, 1440]) {
    await page.viewport(width, 1000)
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      await new Promise((resolve) => setTimeout(resolve, 350))
      const region = document.querySelector('[aria-label="Release notes"]')!
      expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `__screenshots__/release-notes-v015-${width}-${dark ? 'dark' : 'light'}.png`,
      })
    }
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
  await page.getByText('Image and build details', { exact: true }).click()
  await expect
    .element(page.getByText(/All application images use/))
    .toBeVisible()
})

it('preserves fetched notes if refreshing the cached information fails', async () => {
  await mount()
  await expect
    .element(
      page.getByRole('button', {
        name: "What's new — v0.1.2 — Update available",
      })
    )
    .toBeVisible()
  failed = true
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .element(page.getByText('Service unavailable', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('heading', { name: 'Preflyt v0.2.0' }))
    .toBeVisible()
})

it('respects disabled automatic checks but still allows an explicit manual check', async () => {
  state = {
    ...state,
    enabled: false,
    checkedAt: new Date(0).toISOString(),
    nextCheckAt: null,
  }
  await mount()
  await page
    .getByRole('button', { name: "What's new — v0.1.2 — Update available" })
    .click()
  await expect
    .element(page.getByRole('heading', { name: 'Preflyt v0.2.0' }))
    .toBeVisible()
  expect(fetched.mock.calls.some(([url]) => url.endsWith('/check'))).toBe(false)
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await expect
    .poll(
      () => fetched.mock.calls.filter(([url]) => url.endsWith('/check')).length
    )
    .toBe(1)
})

it('keeps the update dot for readers after notes are read and clears it only after upgrading', async () => {
  state = { ...state, canCheck: false, canConfigure: false, unread: false }
  await mount()
  const trigger = page.getByRole('button', {
    name: "What's new — v0.1.2 — Update available",
  })
  await expect.element(trigger).toBeVisible()
  expect(
    document.querySelector('button [aria-label="Update available"]')
  ).not.toBeNull()
  await trigger.click()
  await userEvent.keyboard('{Escape}')
  await expect.element(trigger).toBeVisible()
  expect(
    document.querySelector('button [aria-label="Update available"]')
  ).not.toBeNull()
  state = { ...state, installed: 'v0.2.0', updateAvailable: false }
  await trigger.click()
  await userEvent.keyboard('{Escape}')
  await expect
    .element(
      page.getByRole('button', { name: "What's new — v0.2.0", exact: true })
    )
    .toBeInTheDocument()
  expect(
    document.querySelector('button [aria-label="Update available"]')
  ).toBeNull()
})
