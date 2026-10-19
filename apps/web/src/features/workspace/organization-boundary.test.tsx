import { useEffect, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { API_BASE_URL } from '@/lib/api'
import { OrganizationBoundary } from './organization-boundary'
import type { ScopedSession } from './scoped-access'

const state = vi.hoisted(() => ({ pathname: '/teams', searchStr: '' }))
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string; searchStr: string }) => string
  }) => select(state),
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode
    to: string
    search?: Record<string, string>
  }) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}))
vi.mock('@/components/layout/app-header', () => ({
  AppHeader: ({ breadcrumbs }: { breadcrumbs: { label: string }[] }) => (
    <nav aria-label='Breadcrumb'>{breadcrumbs[0].label}</nav>
  ),
}))

let client: QueryClient
let session: ScopedSession
let failSession: boolean
let github: boolean
let scopedRequest = vi.fn<() => void>()
let fetchMock = vi.fn<(url: string) => Promise<Response>>()

function ScopedPage() {
  useEffect(() => {
    scopedRequest()
  }, [])
  return <p>Organization page, including its real permission checks</p>
}
function subject() {
  return (
    <QueryClientProvider client={client}>
      <OrganizationBoundary>
        <ScopedPage />
      </OrganizationBoundary>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  state.pathname = '/teams'
  state.searchStr = ''
  session = { platformAdmin: true, role: 'SUPER_ADMIN' }
  failSession = false
  github = false
  scopedRequest = vi.fn()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fetchMock = vi.fn(async (url: string) => {
    if (url === `${API_BASE_URL}/auth/session`) {
      return failSession
        ? new Response(null, { status: 503 })
        : Response.json(session)
    }
    if (url === `${API_BASE_URL}/auth/methods`) return Response.json({ github })
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  client.clear()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

it.each([
  ['/teams', 'Teams'],
  ['/findings', 'Findings'],
  ['/standards', 'Standards'],
  ['/intelligence', 'AI Intelligence'],
  ['/skills', 'Skills'],
  ['/repositories/42', 'Repositories'],
  ['/assessments', 'Assessments'],
  ['/policies', 'Policies'],
  ['/quality-gates', 'Merge Protection'],
  ['/overview', 'Overview'],
  ['/integrations', 'Integrations'],
  ['/audit-log', 'Audit log'],
  ['/contributors/42', 'Contributors'],
])(
  'shows actionable setup without mounting scoped requests at %s',
  async (path, title) => {
    state.pathname = path
    const view = await render(subject())
    await expect
      .element(view.getByRole('heading', { level: 1, name: title }))
      .toBeVisible()
    await expect
      .element(view.getByRole('link', { name: 'Configure GitHub' }))
      .toHaveAttribute('href', '/organization-settings?tab=configuration')
    expect(scopedRequest).not.toHaveBeenCalled()
    expect(view.container.querySelector('[role=alert]')).toBeNull()
    expect(view.container.textContent).not.toMatch(
      /permission|unavailable|Refresh and try again/
    )
  }
)

it('checks the session before rendering an organization page', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}))
  const view = await render(subject())
  await expect
    .element(view.getByRole('status', { name: 'Checking organization access' }))
    .toBeVisible()
  expect(scopedRequest).not.toHaveBeenCalled()
})

it('retries a failed session check without calling it missing setup', async () => {
  failSession = true
  const view = await render(subject())
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Could not check your organization access')
  expect(scopedRequest).not.toHaveBeenCalled()
  expect(view.container.textContent).not.toContain('Connect your organization')
  failSession = false
  await view.getByRole('button', { name: 'Try again' }).click()
  await expect
    .element(view.getByRole('link', { name: 'Configure GitHub' }))
    .toBeVisible()
})

it('retains organization pages and their permission checks, including legacy workspaces', async () => {
  session = { organizationId: 'legacy-org', permissions: ['team.read'] }
  const view = await render(subject())
  await expect
    .element(
      view.getByText('Organization page, including its real permission checks')
    )
    .toBeVisible()
  expect(scopedRequest).toHaveBeenCalledOnce()
  expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
    `${API_BASE_URL}/auth/methods`
  )
})

it.each([
  '/organization-settings',
  '/settings/account',
  '/settings/appearance',
  '/notifications',
  '/access-control',
])('preserves setup and identity routes at %s', async (path) => {
  state.pathname = path
  const view = await render(subject())
  await expect
    .element(
      view.getByText('Organization page, including its real permission checks')
    )
    .toBeVisible()
  expect(scopedRequest).toHaveBeenCalledOnce()
})

it('does not offer deployment configuration to an ordinary user without an organization', async () => {
  session = { platformAdmin: false }
  state.pathname = '/access-control'
  const view = await render(subject())
  await expect
    .element(
      view.getByText(
        'Ask your Preflyt administrator to connect your organization and grant you access.'
      )
    )
    .toBeVisible()
  expect(view.container.querySelector('a')).toBeNull()
  expect(scopedRequest).not.toHaveBeenCalled()
})

it('offers session-preserving organization setup when GitHub is configured', async () => {
  github = true
  const view = await render(subject())
  await expect
    .element(view.getByRole('link', { name: 'Connect GitHub organization' }))
    .toHaveAttribute('href', `${API_BASE_URL}/github/connection`)
  expect(scopedRequest).not.toHaveBeenCalled()
})
it('keeps a failed GitHub connection actionable before an organization exists', async () => {
  state.searchStr = '?github=error'
  const view = await render(subject())
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Your Preflyt account was not changed')
  expect(scopedRequest).not.toHaveBeenCalled()
})

it.each([false, true])(
  'keeps setup usable at 320px in dark mode=%s',
  async (dark) => {
    await page.viewport(320, 740)
    document.documentElement.classList.toggle('dark', dark)
    const view = await render(subject())
    const link = view.getByRole('link', { name: 'Configure GitHub' })
    await expect.element(link).toBeVisible()
    link.element().focus()
    expect(document.activeElement).toBe(link.element())
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  }
)

it('does not mount a forbidden page or start its scoped requests for a direct URL', async () => {
  state.pathname = '/access-control'
  session = { organizationId: 'org', role: 'OWNER', permissions: [] }
  const view = await render(subject())
  await expect
    .element(
      view.getByRole('heading', { name: 'You do not have access to this page' })
    )
    .toBeVisible()
  expect(scopedRequest).not.toHaveBeenCalled()
})
