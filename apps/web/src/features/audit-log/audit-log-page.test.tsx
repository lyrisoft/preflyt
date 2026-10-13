import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { AuditLogPage } from './audit-log-page'
import { auditSearchSchema } from './audit-search'

const session = vi.hoisted(() => ({
  data: { organizationId: 'workspace', permissions: ['audit.read'] },
  isPending: false,
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => session,
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
  session.data.permissions = ['audit.read']
})
const row = (id: string) => ({
  id,
  action: 'policy.published',
  actionLabel: 'Policy published',
  createdAt: '2026-10-11T12:00:00Z',
  actor: { id: 'actor', name: 'Test owner' },
  repository: { id: '101', name: 'fixture/repo' },
  details: [{ label: 'Branch', value: 'refs/heads/main' }],
})
async function setup(url = '/audit-log') {
  const root = createRootRoute({ component: Outlet })
  const parent = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
    component: Outlet,
  })
  const route = createRoute({
    getParentRoute: () => parent,
    path: 'audit-log',
    validateSearch: (search) => auditSearchSchema.parse(search),
    component: AuditLogPage,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}
it('paginates, filters from page one, preserves numeric repository URLs and opens safe details', async () => {
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams
    const current = Number(params.get('page'))
    return new Response(
      JSON.stringify({
        items: [row(current === 2 ? 'older' : 'newest')],
        page: current,
        pageSize: 20,
        total: 21,
        hasMore: current === 1,
        repositories: [{ id: '101', name: 'fixture/repo' }],
        actions: [{ id: 'policy.published', label: 'Policy published' }],
      })
    )
  })
  vi.stubGlobal('fetch', fetcher)
  const router = await setup('/audit-log?repository=101')
  await expect.element(page.getByText('Test owner')).toBeVisible()
  expect(router.state.location.search.repository).toBe('101')
  await page
    .getByRole('button', { name: 'View Policy published details' })
    .click()
  await expect
    .element(page.getByRole('dialog').getByText('refs/heads/main'))
    .toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect.element(page.getByText('Page 2 of 2')).toBeVisible()
  expect(router.state.location.search.page).toBe(2)
  await page.getByLabelText('From (UTC)').fill('2026-10-11')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect.poll(() => router.state.location.search.page).toBe(1)
  await expect
    .poll(() =>
      fetcher.mock.calls.some(
        ([url]) => new URL(url).searchParams.get('from') === '2026-10-11'
      )
    )
    .toBe(true)
  await router.history.back()
  await expect.element(page.getByLabelText('From (UTC)')).toHaveValue('')
})
it('shows a retriable API error and a filtered empty result', async () => {
  let fail = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      fail
        ? new Response(JSON.stringify({ message: 'Audit log unavailable' }), {
            status: 503,
          })
        : new Response(
            JSON.stringify({
              items: [],
              page: 1,
              pageSize: 20,
              total: 0,
              hasMore: false,
              repositories: [],
              actions: [],
            })
          )
    )
  )
  await setup('/audit-log?action=policy.published')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Audit log unavailable')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect
    .element(
      page.getByText(
        'No events match these filters. Clear or adjust the filters.'
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Next', exact: true }))
    .toBeDisabled()
})
it('does not request audit records without the approved permission', async () => {
  session.data.permissions = []
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  await setup()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('You need Owner, Admin or Auditor access')
  expect(fetcher).not.toHaveBeenCalled()
})
