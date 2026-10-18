import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { GitHubAppSetup } from './github-app-setup'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const mount = (connected = false) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <GitHubAppSetup
        revision={3}
        connected={connected}
        publicApiUrl='https://preflyt.example.test/api'
        disabled={false}
      />
    </QueryClientProvider>
  )
it('reviews useful PR defaults before starting GitHub registration', async () => {
  const fetcher = vi.fn(async (_url: unknown, _options?: RequestInit) =>
    Response.json({ status: null, installationUrl: null })
  )
  vi.stubGlobal('fetch', fetcher)
  const view = await mount()
  await expect
    .element(view.getByRole('switch', { name: 'Create setup PRs' }))
    .toBeChecked()
  await expect
    .element(view.getByRole('switch', { name: 'Manage GitHub rulesets' }))
    .not.toBeChecked()
  await view.getByLabelText('GitHub organization').fill('fixture-org')
  await expect
    .element(view.getByLabelText('App name'))
    .toHaveValue('Preflyt fixture-org')
  await view.getByRole('button', { name: 'Review App setup' }).click()
  await expect
    .element(view.getByText('Review App permissions', { exact: true }))
    .toBeVisible()
  expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(true)
})
it('includes setup PR permissions by default and submits only the reviewed public manifest', async () => {
  let posted: { action: string; value: string } | undefined
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (
    this: HTMLFormElement
  ) {
    posted = {
      action: this.action,
      value: (this.elements.namedItem('manifest') as HTMLInputElement).value,
    }
  })
  const manifest = {
    name: 'Preflyt fixture-org',
    default_permissions: { checks: 'write' },
  }
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) =>
    Response.json(
      options?.method === 'POST'
        ? {
            action:
              'https://github.com/organizations/fixture-org/settings/apps/new?state=fixture',
            manifest,
          }
        : { status: null, installationUrl: null }
    )
  )
  vi.stubGlobal('fetch', fetcher)
  const view = await mount()
  await view.getByLabelText('GitHub organization').fill('fixture-org')
  await view.getByRole('button', { name: 'Review App setup' }).click()
  await expect
    .element(
      view.getByText(
        'Contents, Workflows and Pull requests: write. These permissions let Preflyt create setup branches, commit workflow files and open setup PRs.'
      )
    )
    .toBeVisible()
  await view.getByRole('button', { name: 'Confirm in GitHub' }).click()
  await expect.poll(() => posted?.value).toBe(JSON.stringify(manifest))
  const body = JSON.parse(
    fetcher.mock.calls.find(([, options]) => options?.method === 'POST')![1]!
      .body as string
  )
  expect(body).toMatchObject({
    expectedRevision: 3,
    setupPullRequests: true,
    managedProtection: false,
  })
  expect(posted?.value).not.toContain('secret')
})
it('preserves the existing App and explains permission upgrades on the same connection', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: null, installationUrl: null }))
  )
  const view = await mount(true)
  await expect
    .element(view.getByText('One GitHub App', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Review App setup' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByText(/A separate governance App is optional/))
    .toBeVisible()
})
it('keeps the new setup form within a narrow viewport', async () => {
  await page.viewport(390, 844)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: null, installationUrl: null }))
  )
  const view = await mount()
  await expect.element(view.getByLabelText('GitHub organization')).toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  await page.viewport(1280, 720)
})

it('explains the consequence of explicitly opting out of setup PR permissions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: null, installationUrl: null }))
  )
  const view = await mount()
  await view.getByRole('switch', { name: 'Create setup PRs' }).click()
  await expect
    .element(
      view.getByText('Setup PR creation will be unavailable.', { exact: false })
    )
    .toBeVisible()
})
