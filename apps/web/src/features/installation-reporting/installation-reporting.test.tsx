import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import {
  InstallationReportingSettings,
  type ReportingState,
} from './installation-reporting'

const session = vi.hoisted(() => ({ admin: true }))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { platformAdmin: session.admin, identityId: 'admin' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
let data: ReportingState,
  failed = false
const fetched = vi.fn()
beforeEach(() => {
  session.admin = true
  failed = false
  data = {
    enabled: true,
    countryReportingEnabled: false,
    countryReportingEnvironmentDisabled: false,
    environmentDisabled: false,
    revision: 1,
    acknowledged: false,
    destination: 'https://reports.example.com',
    configured: true,
    lastReportedAt: null,
    nextAttemptAt: null,
    error: null,
    payload: {
      schemaVersion: 1,
      installationId: '11111111-1111-4111-8111-111111111111',
      version: 'v0.1.2',
      deploymentType: 'compose',
    },
  }
  vi.stubGlobal(
    'fetch',
    fetched
      .mockReset()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (failed)
          return Response.json(
            { message: 'Reporting settings are unavailable' },
            { status: 503 }
          )
        if (url.endsWith('/preferences'))
          data = {
            ...data,
            ...JSON.parse(init!.body as string),
            acknowledged: true,
            revision: 2,
          }
        if (url.endsWith('/acknowledge')) data = { ...data, acknowledged: true }
        return Response.json(data)
      })
  )
})
const client = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
async function mount() {
  return render(
    <QueryClientProvider client={client()}>
      <InstallationReportingSettings />
    </QueryClientProvider>
  )
}

it('shows exact report fields and persists an administrator opt-out from settings', async () => {
  await mount()
  await page.getByText('Exact report contents').click()
  await expect
    .element(page.getByText('"installationId"', { exact: false }))
    .toBeVisible()
  await page.getByRole('switch', { name: 'Send installation reports' }).click()
  await expect
    .element(page.getByText('Disabled', { exact: true }))
    .toBeVisible()
  expect(data.enabled).toBe(false)
})
it('makes the environment opt-out authoritative and reports unconfigured receivers honestly', async () => {
  data = {
    ...data,
    enabled: false,
    environmentDisabled: true,
    destination: null,
    configured: false,
  }
  await mount()
  await expect
    .element(page.getByRole('switch', { name: 'Send installation reports' }))
    .toBeDisabled()
  await expect
    .element(
      page.getByText(
        'A reporting receiver has not been configured. No reports are being sent.'
      )
    )
    .toBeVisible()
  await expect
    .element(
      page.getByText(
        'Disabled by the deployment environment. It cannot be enabled here.'
      )
    )
    .toBeVisible()
})
it('does not fetch deployment-wide reporting details for ordinary users', async () => {
  session.admin = false
  await mount()
  await expect
    .element(page.getByRole('switch', { name: 'Send installation reports' }))
    .not.toBeInTheDocument()
  expect(fetched).not.toHaveBeenCalled()
})
it('shows request failures without presenting a false saved preference', async () => {
  failed = true
  await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Reporting settings are unavailable')
  await expect
    .element(page.getByRole('switch', { name: 'Send installation reports' }))
    .not.toBeInTheDocument()
})
it('keeps reporting settings usable at 320px in both themes', async () => {
  await page.viewport(320, 1000)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await mount()
    await expect
      .element(page.getByText('Installation reporting', { exact: true }))
      .toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/installation-reporting-settings-${dark ? 'dark' : 'light'}.png`,
    })
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

it('keeps country reporting separate, off by default, and saves the country preference', async () => {
  await mount()
  const country = page.getByRole('switch', {
    name: 'Include installation country',
  })
  await expect.element(country).not.toBeChecked()
  await country.click()
  await expect.element(country).toBeChecked()
  expect(data.countryReportingEnabled).toBe(true)
  expect(data.enabled).toBe(true)
  const body = JSON.parse(
    fetched.mock.calls.find(([url]) => url.endsWith('/preferences'))![1].body
  )
  expect(body).toEqual({ countryReportingEnabled: true, expectedRevision: 1 })
})
it('prevents country reporting when the deployment opts out or installation reporting is off', async () => {
  data = { ...data, countryReportingEnvironmentDisabled: true }
  const view = await mount()
  await expect
    .element(page.getByRole('switch', { name: 'Include installation country' }))
    .toBeDisabled()
  await expect
    .element(
      page.getByText(
        'Country reporting is disabled by the deployment environment.'
      )
    )
    .toBeVisible()
  await view.unmount()
  data = { ...data, countryReportingEnvironmentDisabled: false, enabled: false }
  await mount()
  await expect
    .element(page.getByRole('switch', { name: 'Include installation country' }))
    .toBeDisabled()
})
