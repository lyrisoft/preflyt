import { useSyncExternalStore, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RepositoryProfilePage } from './repository-profile-page'

const state = vi.hoisted(() => ({
  search: {} as { branch?: string; health?: string; tab?: string },
  listeners: new Set<() => void>(),
  navigate: vi.fn(),
  fetch: vi.fn(),
}))
const session = {
  authenticated: true,
  identityId: 'owner',
  organizationId: 'org',
  role: 'OWNER',
  permissions: ['execution.run', 'assessment.read', 'repository.manage'],
  organizationWide: true,
  repositoryScopes: [],
  repositoryGrants: ['51'],
}
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ repositoryId: '51' }),
    useSearch: () =>
      useSyncExternalStore(
        (callback) => {
          state.listeners.add(callback)
          return () => {
            state.listeners.delete(callback)
          }
        },
        () => state.search
      ),
    useNavigate: () => state.navigate,
  }),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({ isSuccess: true, data: session }),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('./branch-picker', () => ({
  BranchPicker: ({
    value,
    onValueChange,
    disabled,
  }: {
    value: string
    onValueChange: (branch: string) => void
    disabled?: boolean
  }) => (
    <select
      aria-label='Repository branch'
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option>development</option>
      <option>codex/coverage</option>
    </select>
  ),
}))
// Exercise the real branch-scoped query used by Health, while the full Health
// component's rendering and assessment actions have their own browser regressions.
vi.mock('../health/repository-health', async () => {
  const { useHealth } = await import('../health/health-api')
  return {
    RepositoryHealth: ({
      repositoryId,
      assessmentId,
      selectedBranch,
      onAssessmentQueued,
    }: {
      repositoryId: string
      assessmentId?: string
      selectedBranch?: string
      onAssessmentQueued?: (assessment: { id: string; branch: string }) => void
    }) => {
      const query = useHealth(
        repositoryId,
        assessmentId,
        1,
        true,
        selectedBranch
      )
      return (
        <>
          <output aria-label='Loaded Health branch'>
            {query.data?.branch ?? 'Loading'}
          </output>
          <button
            onClick={() =>
              onAssessmentQueued?.({
                id: '22222222-2222-4222-8222-222222222222',
                branch: selectedBranch ?? 'development',
              })
            }
          >
            Queue assessment fixture
          </button>
        </>
      )
    },
  }
})
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RepositoryProfilePage />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  state.search = { health: '11111111-1111-4111-8111-111111111111' }
  state.listeners.clear()
  state.navigate.mockReset()
  state.fetch.mockReset()
  state.navigate.mockImplementation(
    ({
      search,
    }: {
      search: (old: typeof state.search) => typeof state.search
    }) => {
      state.search = search(state.search)
      for (const listener of state.listeners) listener()
    }
  )
  state.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname.endsWith('/auth/session')) return Response.json(session)
    if (url.pathname.endsWith('/profile'))
      return Response.json({
        repository: {
          githubId: '51',
          fullName: 'fixture/repo',
          defaultBranch: 'development',
        },
        profile: null,
      })
    if (url.pathname.endsWith('/health'))
      return Response.json({
        branch: url.searchParams.get('branch') ?? 'development',
        assessment: null,
        history: [],
        total: 0,
        page: 1,
        ciCoverage: { state: 'MISSING', sourceSha: null },
      })
    return Response.json({})
  })
  vi.stubGlobal('fetch', state.fetch)
})
it('loads the selected branch, clears the old assessment pin and preserves the branch on page remount', async () => {
  const first = await mount()
  await expect
    .element(page.getByText('Inspection does not enforce merge rules.'))
    .toBeVisible()
  await expect
    .element(page.getByText('No merge blocking', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('combobox', { name: 'Repository branch' }))
    .toHaveValue('development')
  await expect
    .element(page.getByRole('status', { name: 'Loaded Health branch' }))
    .toHaveTextContent('development')
  await page
    .getByRole('combobox', { name: 'Repository branch' })
    .selectOptions('codex/coverage')
  await expect
    .element(page.getByRole('status', { name: 'Loaded Health branch' }))
    .toHaveTextContent('codex/coverage')
  expect(state.search).toMatchObject({
    branch: 'codex/coverage',
    health: undefined,
  })
  expect(
    state.fetch.mock.calls.some(([input]) => {
      const url = new URL(String(input), 'http://localhost')
      return (
        url.pathname.endsWith('/health') &&
        url.searchParams.get('branch') === 'codex/coverage' &&
        !url.searchParams.has('assessment')
      )
    })
  ).toBe(true)
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
  await first.unmount()
  await mount()
  await expect
    .element(page.getByRole('combobox', { name: 'Repository branch' }))
    .toHaveValue('codex/coverage')
  await expect
    .element(page.getByRole('status', { name: 'Loaded Health branch' }))
    .toHaveTextContent('codex/coverage')
})
it('replaces a historical URL pin with the newly queued assessment and retains it on reload', async () => {
  state.search = {
    branch: 'codex/coverage',
    health: '11111111-1111-4111-8111-111111111111',
  }
  const first = await mount()
  await page.getByRole('button', { name: 'Queue assessment fixture' }).click()
  await expect
    .poll(() => state.search.health)
    .toBe('22222222-2222-4222-8222-222222222222')
  expect(state.search.branch).toBe('codex/coverage')
  await first.unmount()
  await mount()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([input]) => {
        const url = new URL(String(input), 'http://localhost')
        return (
          url.searchParams.get('branch') === 'codex/coverage' &&
          url.searchParams.get('assessment') ===
            '22222222-2222-4222-8222-222222222222'
        )
      })
    )
    .toBe(true)
  await expect
    .element(page.getByRole('combobox', { name: 'Repository branch' }))
    .toHaveValue('codex/coverage')
})
