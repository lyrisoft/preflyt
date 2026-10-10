import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { TeamsWorkspace } from './teams-page'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => api.request(...args),
}))
const options = {
  members: [{ id: 'member', name: 'Developer' }],
  repositories: [{ id: '101', name: 'org/service', defaultBranch: 'main' }],
  standards: [
    {
      id: 'baseline-engineering',
      version: '1.0.0',
      title: 'Baseline Engineering',
    },
  ],
  installations: [{ id: '1001', name: 'org' }],
}
const team = {
  id: 'team',
  name: 'Platform',
  description: 'Services',
  source: 'LOCAL',
  syncState: 'LOCAL',
  syncedAt: null,
  revision: 1,
  members: 1,
  repositories: 1,
  pendingRepositories: 0,
  assignments: 0,
}
const detail = {
  impact: [
    {
      githubId: '101',
      name: 'org/service',
      branchRef: 'refs/heads/main',
      state: 'DRAFT',
      revision: 1,
      current: true,
    },
  ],
  ...team,
  members: [{ id: 'member', name: 'Developer' }],
  repositories: [
    {
      id: '101',
      name: 'org/service',
      policyScopeEnabled: true,
      providerPresent: true,
      origin: 'MANUAL',
    },
  ],
  assignments: [],
  activity: [
    { id: 'audit', event: 'team.created', createdAt: '2026-10-10T00:00:00Z' },
  ],
}
const impact = {
  previewHash: 'a'.repeat(64),
  conflicts: false,
  repositories: [
    {
      githubId: '101',
      name: 'org/service',
      addedChecks: ['Required test execution'],
      conflicts: [],
      profile: 'RECOMMENDED',
      sources: [],
    },
  ],
}
beforeEach(() => {
  api.request.mockReset().mockImplementation(async (path: string) => {
    if (path === '/teams/options') return options
    if (path === '/teams/team') return detail
    if (path.includes('/preview')) return impact
    if (path.includes('/assign'))
      return { drafts: [{ githubId: '101', policyId: 'draft' }] }
    if (path === '/teams') return { id: 'team' }
    if (path.includes('/github/discover'))
      return { teams: [{ id: '300', name: 'GitHub Platform', parentId: null }] }
    if (path.includes('/github/import')) return { id: 'team' }
    return { teams: [team], total: 21, pageSize: 20 }
  })
})
async function mount(manage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <TeamsWorkspace
          canManage={manage}
          canImport={manage}
          canAssign={manage}
          scopeKey='fixture-org'
        />
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}
it('lists API-backed teams and requests the next page', async () => {
  const view = await mount()
  await expect
    .element(view.getByRole('button', { name: 'Platform', exact: true }))
    .toBeVisible()
  await userEvent.click(view.getByRole('button', { name: 'Next', exact: true }))
  await expect
    .poll(() =>
      api.request.mock.calls.some(([path]) => path === '/teams?page=2&q=')
    )
    .toBe(true)
})
it('creates a local team with selected members and explicit scope', async () => {
  const view = await mount()
  await userEvent.click(
    view.getByRole('button', { name: 'Create team', exact: true })
  )
  await userEvent.fill(
    view.getByRole('textbox', { name: 'Name', exact: true }),
    'Delivery'
  )
  await userEvent.click(view.getByRole('checkbox', { name: 'Developer' }))
  await userEvent.click(view.getByRole('checkbox', { name: 'org/service' }))
  await userEvent.click(
    view.getByRole('dialog').getByRole('button', { name: 'Create team' })
  )
  await expect
    .poll(() => api.request.mock.calls.find(([path]) => path === '/teams')?.[1])
    .toEqual({
      name: 'Delivery',
      description: '',
      memberIds: ['member'],
      repositoryIds: ['101'],
      expectedRevision: 0,
    })
})
it('requires an impact preview before creating drafts', async () => {
  const view = await mount()
  await userEvent.click(
    view.getByRole('button', { name: 'Platform', exact: true })
  )
  await userEvent.click(view.getByRole('tab', { name: 'Standards & policies' }))
  await expect
    .element(view.getByRole('button', { name: 'Apply and create drafts' }))
    .not.toBeInTheDocument()
  await userEvent.click(view.getByRole('button', { name: 'Preview impact' }))
  await expect
    .element(view.getByText('Required test execution · recommended profile'))
    .toBeVisible()
  await userEvent.click(
    view.getByRole('button', { name: 'Apply and create drafts' })
  )
  await expect
    .poll(
      () =>
        api.request.mock.calls.find(
          ([path]) => path === '/teams/team/assign'
        )?.[1]
    )
    .toEqual({
      branchRef: 'refs/heads/main',
      profile: 'RECOMMENDED',
      packs: [{ id: 'baseline-engineering', version: '1.0.0' }],
      expectedPreviewHash: impact.previewHash,
    })
})
it('disables assignment when preview reports conflicting requirements', async () => {
  api.request.mockImplementation(async (path: string) =>
    path.includes('/preview')
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
      : path === '/teams/options'
        ? options
        : path === '/teams/team'
          ? detail
          : { teams: [team], total: 1, pageSize: 20 }
  )
  const view = await mount()
  await userEvent.click(
    view.getByRole('button', { name: 'Platform', exact: true })
  )
  await userEvent.click(view.getByRole('tab', { name: 'Standards & policies' }))
  await userEvent.click(view.getByRole('button', { name: 'Preview impact' }))
  await expect
    .element(view.getByText('Conflicting standard versions'))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Apply and create drafts' }))
    .toBeDisabled()
})
it('hides mutation actions for readers while retaining authorized team data', async () => {
  const view = await mount(false)
  await expect
    .element(view.getByRole('button', { name: 'Platform', exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Create team' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: 'Import from GitHub' }))
    .not.toBeInTheDocument()
  await userEvent.click(
    view.getByRole('button', { name: 'Platform', exact: true })
  )
  await expect
    .element(view.getByRole('button', { name: 'Edit scope' }))
    .not.toBeInTheDocument()
})
it('reports errors rather than rendering stale data as an empty team list', async () => {
  api.request.mockRejectedValue(new Error('Team access is unavailable'))
  const view = await mount()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Team access is unavailable')
  await expect.element(view.getByText('No teams yet')).not.toBeInTheDocument()
})
it('imports a selected GitHub team with the server verified identity', async () => {
  const view = await mount()
  await userEvent.click(
    view.getByRole('button', { name: 'Import from GitHub' })
  )
  await userEvent.click(view.getByRole('button', { name: 'List teams' }))
  await userEvent.click(
    view.getByRole('button', { name: 'Import', exact: true })
  )
  await expect
    .poll(
      () =>
        api.request.mock.calls.find(
          ([path]) => path === '/teams/github/import'
        )?.[1]
    )
    .toEqual({ installationId: '1001', teamId: '300' })
})

it('keeps the editor usable at mobile width and exposes effective impact', async () => {
  await page.viewport(390, 844)
  const screen = await mount()
  await screen.getByRole('button', { name: 'Create team', exact: true }).click()
  await expect
    .element(screen.getByRole('textbox', { name: 'Name', exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Cancel', exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Cancel', exact: true }).click()
  await screen.getByRole('button', { name: 'Platform', exact: true }).click()
  await screen.getByRole('tab', { name: 'Effective impact' }).click()
  await expect
    .element(screen.getByText('org/service', { exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: 'Open policies' }))
    .toBeVisible()
  await page.viewport(1280, 900)
})

it('opens the organization baseline through an explicit action', async () => {
  api.request.mockImplementation(async (path: string, body?: unknown) => {
    if (path === '/teams/options') return options
    if (path === '/teams/baseline' && body) return { id: 'baseline' }
    if (path === '/teams/baseline/edit') return { id: 'baseline' }
    if (path === '/teams/baseline')
      return { ...detail, id: 'baseline', source: 'ORGANIZATION', members: [] }
    return { teams: [team], total: 1, pageSize: 20 }
  })
  const view = await mount()
  await userEvent.click(
    view.getByRole('button', {
      name: 'Organization-wide requirements',
      exact: true,
    })
  )
  await expect
    .poll(() =>
      api.request.mock.calls.some(
        ([path, body]) =>
          path === '/teams/baseline' && JSON.stringify(body) === '{}'
      )
    )
    .toBe(true)
})

it('shows separate impact rows and statuses for branches in the same repository', async () => {
  const request = api.request.getMockImplementation()!
  api.request.mockImplementation(async (path: string, ...args: unknown[]) => {
    if (path === '/teams/team')
      return {
        ...detail,
        impact: [
          {
            ...detail.impact[0],
            state: 'PUBLISHED',
            revision: 2,
            current: false,
          },
          { ...detail.impact[0], branchRef: 'refs/heads/develop' },
        ],
      }
    return request(path, ...args)
  })
  const view = await mount()
  await view.getByRole('button', { name: 'Platform', exact: true }).click()
  await view.getByRole('tab', { name: 'Effective impact' }).click()
  await expect
    .element(
      view.getByRole('row', {
        name: 'org/service main Needs review v2 Open policies',
      })
    )
    .toBeVisible()
  await expect
    .element(
      view.getByRole('row', {
        name: 'org/service develop Draft v1 Open policies',
      })
    )
    .toBeVisible()
})
