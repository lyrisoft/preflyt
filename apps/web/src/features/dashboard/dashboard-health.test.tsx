import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { HealthPortfolioData } from '@/features/health/health-api'
import { Dashboard } from './index'

const state = vi.hoisted(() => ({
  search: {
    tab: 'overview',
    days: '180',
    repository: undefined as string | undefined,
  },
  listeners: new Set<() => void>(),
  fail: false,
  fetch: vi.fn(),
}))
vi.mock('@tanstack/react-router', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    getRouteApi: () => ({
      useSearch: () =>
        useSyncExternalStore(
          (listener) => {
            state.listeners.add(listener)
            return () => {
              state.listeners.delete(listener)
            }
          },
          () => state.search
        ),
    }),
    useNavigate:
      () =>
      ({ search }: { search: typeof state.search }) => {
        state.search = search
        state.listeners.forEach((fn) => fn())
      },
    Link: ({
      to,
      params,
      search,
      children,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      to: string
      params?: { repositoryId: string }
      search?: Record<string, string>
      children: ReactNode
    }) => (
      <a
        {...props}
        href={
          to.replace('$repositoryId', params?.repositoryId ?? '') +
          (search ? '?' + new URLSearchParams(search) : '')
        }
      >
        {children}
      </a>
    ),
  }
})
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@/components/layout/main', () => ({
  Main: ({
    children,
    className,
  }: {
    children: ReactNode
    className: string
  }) => <main className={className}>{children}</main>,
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: {
      organizationId: 'org',
      identityId: 'owner',
      permissions: ['assessment.read'],
    },
  }),
}))
const health: HealthPortfolioData = {
  summary: {
    repositories: 3,
    assessed: 1,
    analyzed: 0,
    active: 0,
    incomplete: 1,
    high: 0,
    notAssessed: 2,
  },
  statuses: { complete: 0, partial: 1, failed: 0, cancelled: 0 },
  priorityFindings: [],
  items: [],
  page: 1,
  total: 3,
  bounded: false,
}
beforeEach(() => {
  state.search = { tab: 'overview', days: '180', repository: undefined }
  state.fail = false
  state.fetch.mockReset().mockImplementation(async (url: string) => {
    if (url.includes('/github/health?'))
      return state.fail
        ? new Response('{}', { status: 403 })
        : Response.json(health)
    if (url.includes('/github/dashboard?'))
      return Response.json({
        generatedAt: new Date().toISOString(),
        period: { from: '2026-10-01', to: '2026-10-11' },
        choices: [{ githubId: '51', fullName: 'fixture/repo' }],
        metrics: {
          repositories: 3,
          prsAssessed: 10,
          snapshots: 768,
          standardsAdopted: 1,
          repositoriesWithSnapshots: 3,
        },
        repositories: [
          {
            githubId: '51',
            fullName: 'fixture/repo',
            technologies: [],
            latestAssessment: {
              id: 'saved',
              sourceSha: 'a'.repeat(40),
              createdAt: '2026-10-11',
            },
            sync: { state: 'synced' },
          },
        ],
        activity: [],
        attention: [],
      })
    throw new Error('Unexpected request: ' + url)
  })
  vi.stubGlobal('fetch', state.fetch)
})
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <div className='p-4'>
        <Dashboard />
      </div>
    </QueryClientProvider>
  )
}
it('adds Health fourth, swaps the metrics, and restores the original Overview with one Help button', async () => {
  await mount()
  await expect
    .element(page.getByRole('tab', { name: 'Overview', exact: true }))
    .toBeVisible()
  expect(
    Array.from(document.querySelectorAll('[role=tab]')).map(
      (n) => n.textContent
    )
  ).toEqual(['Overview', 'Repositories', 'Pull requests', 'Health'])
  expect(
    state.fetch.mock.calls.some(([url]) => url.includes('/github/health?'))
  ).toBe(false)
  await page.getByRole('tab', { name: 'Health', exact: true }).click()
  await expect
    .element(page.getByText('Findings are not available yet'))
    .toBeVisible()
  await expect
    .element(page.getByText('PRs assessed', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('combobox', { name: 'Assessment period' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Repository reports', { exact: true }))
    .not.toBeInTheDocument()
  expect(
    document.querySelectorAll(
      'button[aria-label="Help for Engineering Overview"]'
    )
  ).toHaveLength(1)
  await page.getByRole('tab', { name: 'Overview', exact: true }).click()
  await expect
    .element(page.getByText('PRs assessed', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByText('Evidence overview', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('combobox', { name: 'Assessment period' }))
    .toBeVisible()
  await expect
    .element(page.getByText('Repositories assessed', { exact: true }))
    .not.toBeInTheDocument()
})
it('applies the repository filter to Health and refreshes results without starting an assessment', async () => {
  state.search.tab = 'health'
  await mount()
  await expect
    .element(page.getByText('Assessment status', { exact: true }))
    .toBeVisible()
  await page
    .getByRole('button', { name: 'Filter repositories: All repositories' })
    .click()
  await page.getByRole('option', { name: 'fixture/repo' }).click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(
        ([url]) =>
          url.includes('/github/health?') &&
          new URL(url, 'http://localhost').searchParams.get('repository') ===
            '51'
      )
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Refresh repository health' }).click()
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
})
it('shows access errors and can retry without exposing cached results', async () => {
  state.search.tab = 'health'
  state.fail = true
  await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access is unavailable')
  await expect
    .element(page.getByText('Assessment status', { exact: true }))
    .not.toBeInTheDocument()
  state.fail = false
  await page.getByRole('button', { name: 'Retry health summary' }).click()
  await expect
    .element(page.getByText('Findings are not available yet'))
    .toBeVisible()
})
it('links a priority finding to its saved report and fits 320px in both themes', async () => {
  state.search.tab = 'health'
  state.fetch.mockReset()
  state.fetch.mockImplementation(async (url: string) =>
    url.includes('/github/health?')
      ? Response.json({
          ...health,
          summary: { ...health.summary, analyzed: 1, high: 1 },
          priorityFindings: [
            {
              repositoryId: '51',
              repositoryName: 'fixture/' + 'long-name-'.repeat(12),
              assessmentId: '11111111-1111-4111-8111-111111111111',
              branch: 'development',
              fingerprint: 'f'.repeat(64),
              title: 'Unsafe SQL expression',
              severity: 'high',
              path: 'src/db.ts',
              line: 7,
            },
          ],
        })
      : Response.json({
          generatedAt: new Date().toISOString(),
          period: { from: '2026-10-01', to: '2026-10-11' },
          choices: [],
          metrics: {
            repositories: 1,
            prsAssessed: 0,
            snapshots: 1,
            standardsAdopted: 0,
          },
          repositories: [],
          activity: [],
          attention: [],
        })
  )
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const screen = await mount()
    await expect
      .element(page.getByRole('link', { name: /Unsafe SQL expression/ }))
      .toHaveAttribute(
        'href',
        '/repositories/51?tab=health&health=11111111-1111-4111-8111-111111111111'
      )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await screen.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
