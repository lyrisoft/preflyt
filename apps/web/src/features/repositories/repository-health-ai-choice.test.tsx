import { useSyncExternalStore, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { RepositoryProfilePage } from './repository-profile-page'

const state = vi.hoisted(() => ({
  search: {} as { branch?: string; health?: string; tab?: string },
  listeners: new Set<() => void>(),
  navigate: vi.fn(),
  fetch: vi.fn(),
  delayProfile: false,
  resolveProfile: null as null | (() => void),
  client: null as QueryClient | null,
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
function mount() {
  state.client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={state.client}>
      <RepositoryProfilePage />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  state.search = {}
  state.delayProfile = false
  state.resolveProfile = null
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
  state.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname.endsWith('/auth/session')) return Response.json(session)
      if (url.pathname.endsWith('/profile')) {
        if (state.delayProfile)
          await new Promise<void>((resolve) => {
            state.resolveProfile = resolve
          })
        return Response.json({
          repository: {
            githubId: '51',
            fullName: 'fixture/repo',
            defaultBranch: 'development',
          },
          profile: null,
        })
      }
      if (url.pathname.endsWith('/health/strix'))
        return Response.json({ available: true, reason: 'Model ready' })
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        return Response.json({
          id: '22222222-2222-4222-8222-222222222222',
          state: 'QUEUED',
          branch: body.branch,
          includeAiSecurity: body.includeAiSecurity,
          aiReviewId: body.includeAiSecurity
            ? '33333333-3333-4333-8333-333333333333'
            : null,
        })
      }
      if (url.pathname.endsWith('/health'))
        return Response.json({
          branch: url.searchParams.get('branch') ?? 'development',
          assessment: null,
          assessmentOptions: { includeAiSecurity: false },
          history: [],
          total: 0,
          page: 1,
          ciCoverage: { state: 'MISSING', sourceSha: null },
        })
      return Response.json({})
    }
  )
  vi.stubGlobal('fetch', state.fetch)
})
it('retains the selected AI review through a background profile refresh before assessment', async () => {
  await mount()
  await expect
    .element(
      page.getByRole('button', { name: 'Assess repository', exact: true })
    )
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeEnabled()
  await page
    .getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    .click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeChecked()
  await userEvent.keyboard('{Escape}')
  state.delayProfile = true
  const refreshed = state.client!.invalidateQueries({
    queryKey: ['repository-profile', '51'],
  })
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Loading repository')
  state.resolveProfile!()
  await refreshed
  await expect
    .element(
      page.getByRole('button', { name: 'Assess repository', exact: true })
    )
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeChecked()
  await page
    .getByRole('button', { name: 'Assess repository', exact: true })
    .click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  expect(
    JSON.parse(
      String(
        state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]
          .body
      )
    ).includeAiSecurity
  ).toBe(true)
})

it('retains the AI choice when the selected branch remounts the Health panel', async () => {
  await mount()
  await expect
    .element(
      page.getByRole('button', { name: 'Assess repository', exact: true })
    )
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeEnabled()
  await page
    .getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    .click()
  await userEvent.keyboard('{Escape}')
  await page
    .getByRole('combobox', { name: 'Repository branch' })
    .selectOptions('codex/coverage')
  await expect
    .element(
      page.getByRole('button', { name: 'Assess repository', exact: true })
    )
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeChecked()
  await page
    .getByRole('button', { name: 'Assess repository', exact: true })
    .click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  expect(
    JSON.parse(
      String(
        state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]
          .body
      )
    )
  ).toMatchObject({ branch: 'codex/coverage', includeAiSecurity: true })
})
