import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PoliciesWorkspace } from './policies-workspace'
import { workspaceSearchSchema } from './search-schema'

const state = vi.hoisted(() => ({
  permissions: [
    'team.read',
    'team.manage',
    'team.policy.assign',
    'policy.read',
    'policy.draft',
  ],
  api: vi.fn(),
}))
vi.mock('./navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'admin',
      organizationId: 'org',
      organizationWide: true,
      permissions: state.permissions,
    },
  }),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.api(...args),
}))
vi.mock('../repositories/repository-standards', () => ({
  RepositoryStandards: ({
    repositoryId,
    canManage,
  }: {
    repositoryId: string
    canManage: boolean
  }) => (
    <>
      <h2>Repository {repositoryId}</h2>
      {canManage && <button>Choose standards</button>}
    </>
  ),
}))
vi.mock('../repositories/gate-policy-panel', () => ({
  GatePolicyPanel: () => <h2>Branch policies</h2>,
}))
vi.mock('../repositories/engineering-queries', () => ({ engineeringRead: async () => ({ revisions: [], currentSelectionId: null, truncated: false }) }))
vi.mock('../repositories/repository-bindings', () => ({
  RepositoryBindings: () => null,
}))
const repositories = [
  { githubId: '101', fullName: 'org/service', selected: true },
]
const team = {
  id: 'team',
  name: 'Platform',
  source: 'LOCAL',
  revision: 1,
  repositories: [{ id: '101', name: 'org/service', policyScopeEnabled: true }],
  assignments: [],
  impact: [],
}
const options = {
  childTeams: [{ id: 'team', name: 'Platform' }],
  standards: [
    {
      id: 'baseline-engineering',
      title: 'Baseline Engineering',
      version: '1.0.0',
    },
  ],
  repositories: [{ id: '101', name: 'org/service', defaultBranch: 'main' }],
  members: [],
  installations: [],
}
const impact = {
  previewHash: 'a'.repeat(64),
  conflicts: false,
  repositories: [
    {
      githubId: '101',
      name: 'org/service',
      addedChecks: ['Tests'],
      profile: 'RECOMMENDED',
      conflicts: [],
      sources: [],
    },
  ],
}
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.permissions = [
    'team.read',
    'team.manage',
    'team.policy.assign',
    'policy.read',
    'policy.draft',
  ]
  state.api.mockReset().mockImplementation(async (path: string) => {
    if (path === '/teams/options') return options
    if (path.startsWith('/teams?page=')) return { teams: [] }
    if (path === '/teams/baseline') return { id: 'organization' }
    if (path === '/teams/organization')
      return {
        ...team,
        id: 'organization',
        name: 'Organization baseline',
        source: 'ORGANIZATION',
      }
    if (path.endsWith('/preview')) return impact
    if (path.endsWith('/assign'))
      return { drafts: [{ githubId: '101', policyId: 'draft' }] }
    return team
  })
})
async function mount(url = '/policies') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <div className='p-6'>
          <PoliciesWorkspace repositories={repositories} />
        </div>
      </QueryClientProvider>
    ),
  })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/policies',
    validateSearch: workspaceSearchSchema,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()
  return { view: await render(<RouterProvider router={router} />), router }
}
it('defaults to repository work without fetching team setup and rejects inaccessible deep-link scope', async () => {
  const first = await mount()
  await expect
    .element(page.getByRole('heading', { name: 'Branch policies' }))
    .toBeVisible()
  expect(state.api).not.toHaveBeenCalled()
  await first.view.unmount()
  const invalid = await mount('/policies?repository=forbidden')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('no longer selected or accessible')
  await expect
    .element(page.getByRole('heading', { name: 'Branch policies' }))
    .not.toBeInTheDocument()
  await invalid.view.unmount()
})
it('assigns a team only after server impact preview and carries the exact reviewed hash', async () => {
  const { view } = await mount('/policies?policyScope=team&team=team')
  await expect
    .element(page.getByRole('heading', { name: 'Platform' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Apply and create drafts' }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Preview impact' }).click()
  expect(state.api.mock.calls.some(([p]) => p.endsWith('/assign'))).toBe(false)
  await page.screenshot({ path: '__screenshots__/s3-team-preview-desktop.png' })
  await page.getByRole('button', { name: 'Apply and create drafts' }).click()
  await expect
    .poll(() => state.api.mock.calls.find(([p]) => p.endsWith('/assign'))?.[1])
    .toEqual({
      branchRef: 'refs/heads/main',
      profile: 'RECOMMENDED',
      packs: [{ id: 'baseline-engineering', version: '1.0.0' }],
      expectedPreviewHash: 'a'.repeat(64),
    })
  await view.unmount()
})
it('blocks conflicting or empty previews and discards preview when the branch changes', async () => {
  state.api.mockImplementation(async (p: string) =>
    p === '/teams/options'
      ? options
      : p.endsWith('/preview')
        ? {
            ...impact,
            conflicts: true,
            repositories: [
              {
                ...impact.repositories[0],
                conflicts: ['Conflicting standard versions'],
              },
            ],
          }
        : team
  )
  const { view } = await mount('/policies?policyScope=team&team=team')
  await page.getByRole('button', { name: 'Preview impact' }).click()
  await expect
    .element(page.getByRole('button', { name: 'Apply and create drafts' }))
    .toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Branch', exact: true })
    .fill('development')
  await expect
    .element(page.getByRole('button', { name: 'Apply and create drafts' }))
    .not.toBeInTheDocument()
  expect(state.api.mock.calls.some(([p]) => p.endsWith('/assign'))).toBe(false)
  state.api.mockImplementation(async (p: string) =>
    p.endsWith('/preview') ? { ...impact, repositories: [] } : team
  )
  await page.getByRole('button', { name: 'Preview impact' }).click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('No repositories are included')
  await expect
    .element(page.getByRole('button', { name: 'Apply and create drafts' }))
    .toBeDisabled()
  await view.unmount()
})
it('does not create organization scope on entry and requires an explicit preparation action', async () => {
  const { view } = await mount('/policies?policyScope=organization')
  await expect
    .element(page.getByRole('heading', { name: 'Set organization scope' }))
    .toBeVisible()
  expect(state.api.mock.calls.some(([p]) => p === '/teams/baseline')).toBe(
    false
  )
  await page.getByRole('button', { name: 'Prepare organization scope' }).click()
  await expect
    .poll(
      () => state.api.mock.calls.find(([p]) => p === '/teams/baseline')?.[1]
    )
    .toEqual({})
  await expect
    .element(page.getByRole('button', { name: 'Preview impact' }))
    .toBeVisible()
  expect(state.api.mock.calls.some(([p]) => p.endsWith('/assign'))).toBe(false)
  await view.unmount()
})
it('keeps assignments read-only without authority and suppresses cached details on error', async () => {
  state.permissions = ['team.read', 'policy.read']
  const reader = await mount('/policies?policyScope=team&team=team')
  await expect
    .element(page.getByText('You can review assignments.', { exact: false }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Preview impact' }))
    .not.toBeInTheDocument()
  await reader.view.unmount()
  state.api.mockImplementation(async (p: string) => {
    if (p === '/teams/options') return options
    throw new Error('Team access changed')
  })
  const denied = await mount('/policies?policyScope=team&team=team')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Team access changed')
  await expect
    .element(page.getByRole('button', { name: 'Preview impact' }))
    .not.toBeInTheDocument()
  await denied.view.unmount()
  state.permissions = []
  const missing = await mount('/policies?policyScope=team&team=team')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('permission to view teams')
  await missing.view.unmount()
})
it('keeps team assignment usable at 320px in both themes', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const { view } = await mount('/policies?policyScope=team&team=team')
    await page.getByRole('button', { name: 'Preview impact' }).click()
    await expect
      .element(page.getByRole('button', { name: 'Apply and create drafts' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/s3-team-preview-${dark ? 'dark' : 'light'}-mobile.png`,
    })
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
})

it('keeps Branch policies and CI jobs in separate tabs without repository standards setup', async () => {
  const { view } = await mount()
  await expect.element(page.getByRole('tab', { name: 'Branch policies' })).toHaveAttribute('data-state', 'active')
  await expect.element(page.getByRole('button', { name: 'Choose standards' })).not.toBeInTheDocument()
  await page.getByRole('tab', { name: 'CI jobs' }).click()
  await expect.element(page.getByText('These connections do not create or run jobs.', { exact: false })).toBeVisible()
  await expect.element(page.getByRole('heading', { name: 'Branch policies' })).not.toBeInTheDocument()
  await view.unmount()
})
