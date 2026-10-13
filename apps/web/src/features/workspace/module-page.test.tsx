import { useState } from 'react'
import type * as QueryModule from '@tanstack/react-query'
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
  ...(await importOriginal<typeof QueryModule>()),
  useQuery: () => ({
    data: {
      repositories: [
        { githubId: 'one', fullName: 'org/one', selected: true },
        { githubId: 'two', fullName: 'org/two', selected: true },
        { githubId: '1097527174', fullName: 'org/api', selected: true },
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
vi.mock('@/features/repositories/repository-rulesets', () => ({
  RepositoryRulesets: () => <h2>Merge protection controls</h2>,
  RulesetDetail: () => <h2>Ruleset details</h2>,
}))
vi.mock('@/features/repositories/check-publications', () => ({
  CheckPublications: () => <h2>GitHub result publications</h2>,
}))
vi.mock('@/features/repositories/repository-assessments', () => ({
  RepositoryAssessments: ({
    repositoryId,
    canCreate,
    initialAssessmentId,
  }: {
    repositoryId: string
    canCreate: boolean
    initialAssessmentId?: string
  }) => (
    <div>
      <h2>
        {initialAssessmentId
          ? `Report ${initialAssessmentId} for ${repositoryId}`
          : `Snapshots for ${repositoryId}`}
      </h2>
      {canCreate && <button>New assessment</button>}
    </div>
  ),
}))

beforeEach(() => {
  state.failed = false
  state.allowed = true
})
async function open(
  url = '/assessments',
  module: 'assessments' | 'quality-gates' = 'assessments'
) {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: `/${module}`,
    validateSearch: workspaceSearchSchema,
    component: () => <WorkspaceModule module={module} />,
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
    .toBeVisible()
  await userEvent.click(view.getByRole('tab', { name: 'Pull requests' }))
  await userEvent.fill(view.getByRole('textbox', { name: 'PR filter' }), 'open')
  await expect
    .poll(() => router.state.location.search.tab)
    .toBe('pull-requests')
  await userEvent.click(
    view.getByRole('tab', { name: 'Commit assessments', exact: true })
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
    '/assessments?repository=one&tab=pull-requests'
  )
  await userEvent.click(view.getByRole('button', { name: /Repository scope/ }))
  await userEvent.click(view.getByRole('option', { name: /org\/two/ }))
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ repository: 'two', tab: 'pull-requests' })
  await expect
    .element(view.getByRole('tab', { name: 'Pull requests', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
})
it('opens legacy activity links with the graph above commit assessments', async () => {
  const { view } = await open('/assessments?repository=one&tab=activity')
  await expect
    .element(view.getByText('Repository activity', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Commit assessments', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await expect
    .element(view.getByRole('tab', { name: 'Activity', exact: true }))
    .not.toBeInTheDocument()
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

it('uses merge protection sections while preserving existing shared links and repository scope', async () => {
  const { router, view } = await open(
    '/quality-gates?repository=two&gate=rulesets&rulesetView=drafts',
    'quality-gates'
  )
  await expect
    .element(view.getByRole('tab', { name: 'Branch rules', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await expect
    .element(view.getByRole('heading', { name: 'Merge protection controls' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Results', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('heading', { name: 'Snapshots for two' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('link', { name: 'View assessments' }))
    .toHaveAttribute('href', '/assessments?repository=two')
  await userEvent.click(
    view.getByRole('tab', { name: 'PR checks', exact: true })
  )
  await expect.poll(() => router.state.location.search.gate).toBe('checks')
  await expect
    .element(view.getByRole('heading', { name: 'GitHub result publications' }))
    .toBeVisible()
})

it('opens one report from a shared link and returns to the repository-scoped list', async () => {
  const { router, view } = await open(
    '/assessments?repository=two&assessment=report'
  )
  await expect
    .element(view.getByRole('heading', { name: 'Report report for two' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Commit assessments' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: /Repository scope/ }))
    .not.toBeInTheDocument()
  await userEvent.click(view.getByRole('link', { name: 'Back to assessments' }))
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ repository: 'two', tab: 'commits' })
  expect(router.state.location.search.assessment).toBeUndefined()
  await expect
    .element(view.getByRole('heading', { name: 'Snapshots for two' }))
    .toBeVisible()
})

it('does not open a report in a fallback repository when scope is missing or inaccessible', async () => {
  for (const url of [
    '/assessments?assessment=report',
    '/assessments?repository=forbidden&assessment=report',
  ]) {
    const { view } = await open(url)
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent(
        'This assessment needs an accessible, selected repository.'
      )
    await expect
      .element(view.getByRole('heading', { name: 'Report report for one' }))
      .not.toBeInTheDocument()
    await view.unmount()
  }
})

it('preserves legacy report links back to merge protection', async () => {
  const { view } = await open(
    '/assessments?repository=two&assessment=report&from=quality-gates'
  )
  await expect
    .element(view.getByRole('link', { name: 'Back to merge protection' }))
    .toHaveAttribute('href', '/quality-gates?repository=two&gate=rulesets')
  await expect
    .element(view.getByRole('button', { name: 'New assessment' }))
    .not.toBeInTheDocument()
})

it('retains an unquoted numeric repository ID from a native assessment link', async () => {
  const { router, view } = await open(
    '/assessments?repository=1097527174&assessment=cmv2fgwjd0007gd6nkhpin3xt'
  )
  expect(router.state.location.search.repository).toBe('1097527174')
  await expect
    .element(
      view.getByRole('heading', {
        name: 'Report cmv2fgwjd0007gd6nkhpin3xt for 1097527174',
      })
    )
    .toBeVisible()
  await expect.element(view.getByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(view.getByRole('link', { name: 'Back to assessments' }))
  expect(router.state.location.search.repository).toBe('1097527174')
  await expect
    .element(view.getByRole('heading', { name: 'Snapshots for 1097527174' }))
    .toBeVisible()
})

it('opens branch protection by default and removes duplicated assessment history from legacy results links', async () => {
  for (const url of [
    '/quality-gates?repository=two',
    '/quality-gates?repository=two&gate=assessments',
  ]) {
    const { view } = await open(url, 'quality-gates')
    await expect
      .element(
        view.getByRole('heading', { name: 'Merge Protection', exact: true })
      )
      .toBeVisible()
    await expect
      .element(view.getByRole('tab', { name: 'Branch rules' }))
      .toHaveAttribute('aria-selected', 'true')
    await expect
      .element(view.getByRole('heading', { name: 'Merge protection controls' }))
      .toBeVisible()
    await expect
      .element(view.getByRole('heading', { name: 'Snapshots for two' }))
      .not.toBeInTheDocument()
    await expect
      .element(view.getByRole('link', { name: 'View assessments' }))
      .toHaveAttribute('href', '/assessments?repository=two')
    await view.unmount()
  }
})
