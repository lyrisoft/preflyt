import { useState } from 'react'
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
import { userEvent } from 'vitest/browser'
import { WorkspaceModule } from './module-page'
import { workspaceSearchSchema } from './search-schema'

const state = vi.hoisted(() => ({ failed: false, allowed: true }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: {
      repositories: [
        { githubId: 'one', fullName: 'org/one', selected: true },
        { githubId: 'two', fullName: 'org/two', selected: true },
      ],
      installations: [],
    },
    isPending: false,
    isError: state.failed,
    error: new Error('Inventory unavailable'),
    refetch: vi.fn(),
  }),
}))
vi.mock('./navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'reader',
      organizationId: 'org',
      organizationWide: true,
      permissions: state.allowed ? ['assessment.run'] : [],
    },
  }),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@/features/repositories/repository-activity-panel', () => ({
  RepositoryActivityPanel: () => <h2>Repository activity</h2>,
}))
vi.mock('@/features/repositories/repository-pull-requests', () => ({
  RepositoryPullRequests: function PullRequests() {
    const [filter, setFilter] = useState('')
    return (
      <label>
        PR filter
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
    )
  },
}))
vi.mock('@/features/repositories/repository-assessments', () => ({
  RepositoryAssessments: ({
    repositoryId,
    canCreate,
  }: {
    repositoryId: string
    canCreate: boolean
  }) => (
    <div>
      <h2>Snapshots for {repositoryId}</h2>
      {canCreate && <button>New assessment</button>}
    </div>
  ),
}))

beforeEach(() => {
  state.failed = false
  state.allowed = true
})
async function open(url = '/assessments') {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/assessments',
    validateSearch: workspaceSearchSchema,
    component: () => <WorkspaceModule module='assessments' />,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await router.load()
  return { router, view: await render(<RouterProvider router={router} />) }
}
it('opens commit assessments, supports shareable tabs and preserves PR filters', async () => {
  const { router, view } = await open()
  await expect
    .element(view.getByRole('heading', { name: 'Snapshots for one' }))
    .toBeVisible()
  await expect
    .element(view.getByText('Repository activity', { exact: true }))
    .not.toBeVisible()
  await userEvent.click(view.getByRole('tab', { name: 'Pull requests' }))
  await userEvent.fill(view.getByRole('textbox', { name: 'PR filter' }), 'open')
  await expect
    .poll(() => router.state.location.search.tab)
    .toBe('pull-requests')
  await userEvent.click(
    view.getByRole('tab', { name: 'Activity', exact: true })
  )
  await expect
    .element(view.getByText('Repository activity', { exact: true }))
    .toBeVisible()
  await userEvent.click(view.getByRole('tab', { name: 'Pull requests' }))
  await expect
    .element(view.getByRole('textbox', { name: 'PR filter' }))
    .toHaveValue('open')
})
it('preserves the active tab when switching repository scope', async () => {
  const { router, view } = await open(
    '/assessments?repository=one&tab=activity'
  )
  await userEvent.click(view.getByRole('button', { name: /Repository scope/ }))
  await userEvent.click(view.getByRole('option', { name: /org\/two/ }))
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ repository: 'two', tab: 'activity' })
  await expect
    .element(view.getByRole('tab', { name: 'Activity', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
})
it('keeps create actions permission-scoped and rejects inaccessible URL scope', async () => {
  state.allowed = false
  const { view } = await open()
  await expect
    .element(view.getByRole('heading', { name: 'Snapshots for one' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'New assessment' }))
    .not.toBeInTheDocument()
  await view.unmount()
  const invalid = await open('/assessments?repository=forbidden&tab=commits')
  await expect
    .element(invalid.view.getByRole('heading', { name: 'Snapshots for one' }))
    .not.toBeInTheDocument()
})
it('shows repository load failures instead of assessment panels', async () => {
  state.failed = true
  const { view } = await open()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Inventory unavailable')
  await expect
    .element(view.getByRole('tab', { name: 'Commit assessments' }))
    .not.toBeInTheDocument()
})
