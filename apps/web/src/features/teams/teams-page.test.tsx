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
      api.request.mock.calls.some(
        ([path]) => path === '/teams?page=2&pageSize=10&q='
      )
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
    .element(
      view.getByText('Required test execution · recommended requirements')
    )
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

it('imports every page despite a filter, skipping teams already imported', async () => {
  await page.viewport(320, 760)
  const original = api.request.getMockImplementation()!
  api.request.mockImplementation(async (path: string, body?: unknown) => {
    if (path === '/teams/github/discover')
      return {
        teams: Array.from({ length: 13 }, (_, i) => ({
          id: String(300 + i),
          name: `Remote team ${i}`,
          parentId: i === 12 ? '300' : null,
          imported: i === 0,
        })),
      }
    return original(path, body)
  })
  const view = await mount()
  await view.getByRole('button', { name: 'Import from GitHub' }).click()
  await view.getByRole('button', { name: 'List teams' }).click()
  await view
    .getByRole('textbox', { name: 'Filter GitHub teams' })
    .fill('team 1')
  await view.getByRole('button', { name: 'Import all teams (12)' }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Imported 12 of 12 teams.')
  expect(
    api.request.mock.calls
      .filter(([path]) => path === '/teams/github/import')
      .map(([, body]) => body)
  ).toEqual(
    Array.from({ length: 12 }, (_, i) => ({
      installationId: '1001',
      teamId: String(301 + i),
    }))
  )
  await expect
    .element(view.getByRole('button', { name: 'Import all teams (0)' }))
    .toBeDisabled()
  await expect.element(view.getByRole('dialog')).toBeVisible()
  expect(
    document.querySelector('[role="dialog"]')!.getBoundingClientRect().right
  ).toBeLessThanOrEqual(320)
  await page.viewport(1280, 900)
})

it('continues after a failed import and retries only teams still pending', async () => {
  const original = api.request.getMockImplementation()!
  let retry = false
  let release: (() => void) | undefined
  api.request.mockImplementation(
    async (path: string, body?: { teamId?: string }) => {
      if (path === '/teams/github/discover')
        return {
          teams: [300, 301, 302].map((id) => ({
            id: String(id),
            name: `Remote ${id}`,
            parentId: null,
          })),
        }
      if (path === '/teams/github/import' && body?.teamId === '300' && !retry)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      if (path === '/teams/github/import' && body?.teamId === '301' && !retry)
        throw new Error('GitHub is rate-limited. Retry later.')
      return original(path, body)
    }
  )
  const view = await mount()
  await view.getByRole('button', { name: 'Import from GitHub' }).click()
  await view.getByRole('button', { name: 'List teams' }).click()
  await view.getByRole('button', { name: 'Import all teams (3)' }).click()
  await expect.poll(() => !!release).toBe(true)
  await expect
    .element(view.getByRole('combobox', { name: 'GitHub organization' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('button', { name: 'Import', exact: true }).first())
    .toBeDisabled()
  release!()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Imported 2 of 3 teams. 1 failed.')
  await expect
    .element(view.getByText('GitHub is rate-limited. Retry later.'))
    .toBeVisible()
  retry = true
  await view.getByRole('button', { name: 'Import all teams (1)' }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Imported 1 of 1 teams.')
  expect(
    api.request.mock.calls
      .filter(([path]) => path === '/teams/github/import')
      .map(([, body]) => body.teamId)
  ).toEqual(['300', '301', '302', '301'])
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

it('requires confirmation before including repositories in organization scope', async () => {
  api.request.mockImplementation(async (path: string, body?: unknown) => {
    if (path === '/teams/options') return options
    if (path === '/teams/baseline') return body ? { id: 'team' } : { id: null }
    if (path === '/teams/team') return detail
    return { teams: [team], total: 1, pageSize: 20 }
  })
  const view = await mount()
  const open = () =>
    view
      .getByRole('button', {
        name: 'Manage organization-wide standards',
        exact: true,
      })
      .click()
  const mutations = () =>
    api.request.mock.calls.filter(
      ([path, body]) => path === '/teams/baseline' && body
    )
  await open()
  await expect
    .element(
      page.getByRole('heading', { name: 'Include all selected repositories?' })
    )
    .toBeVisible()
  await expect
    .element(page.getByText('No standards are assigned', { exact: false }))
    .toBeVisible()
  expect(mutations()).toHaveLength(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(mutations()).toHaveLength(0)
  await open()
  await page
    .getByRole('button', { name: 'Include repositories and continue' })
    .click()
  await expect.poll(() => mutations().length).toBe(1)
})

it('opens existing organization scope without creating it again', async () => {
  const request = api.request.getMockImplementation()!
  api.request.mockImplementation(async (path: string, ...args: unknown[]) =>
    path === '/teams/baseline' ? { id: 'team' } : request(path, ...args)
  )
  const view = await mount()
  await view
    .getByRole('button', {
      name: 'Manage organization-wide standards',
      exact: true,
    })
    .click()
  await expect
    .poll(() => api.request.mock.calls.some(([path]) => path === '/teams/team'))
    .toBe(true)
  expect(
    api.request.mock.calls.filter(
      ([path, body]) => path === '/teams/baseline' && body
    )
  ).toHaveLength(0)
  await expect
    .element(
      page.getByRole('heading', { name: 'Include all selected repositories?' })
    )
    .not.toBeInTheDocument()
})

it('uses one pagination control for the repository association table', async () => {
  const request = api.request.getMockImplementation()!
  api.request.mockImplementation(async (path: string, ...args: unknown[]) =>
    path === '/teams/team'
      ? {
          ...detail,
          repositories: Array.from({ length: 12 }, (_, index) => ({
            ...detail.repositories[0],
            id: String(101 + index),
            name: `org/service-${index + 1}`,
          })),
        }
      : request(path, ...args)
  )
  const view = await mount()
  await view.getByRole('button', { name: 'Platform', exact: true }).click()
  await view.getByRole('tab', { name: 'Repositories', exact: true }).click()
  const panel = document.querySelector(
    '[role="tabpanel"][data-state="active"]'
  )!
  expect(panel.querySelectorAll('tbody tr')).toHaveLength(10)
  expect(panel.querySelectorAll('nav')).toHaveLength(1)
  await page
    .getByRole('tabpanel')
    .getByRole('button', { name: 'Next', exact: true })
    .click()
  expect(panel.querySelectorAll('tbody tr')).toHaveLength(2)
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

it('reviews exact child repositories before approving scope', async () => {
  api.request.mockImplementation(async (path: string) => {
    if (path === '/teams/options')
      return {
        ...options,
        childTeams: [{ id: 'child', name: 'Service delivery' }],
      }
    if (path === '/teams/team') return detail
    if (path === '/teams/team/child-scope/preview')
      return {
        previewHash: 'c'.repeat(64),
        repositories: [
          { githubId: '101', name: 'org/service' },
          { githubId: '102', name: 'org/child-service' },
        ],
      }
    if (path === '/teams/team/child-scope/approve') return { approved: true }
    return { teams: [team], total: 1, pageSize: 20 }
  })
  const view = await mount()
  await view.getByRole('button', { name: 'Platform', exact: true }).click()
  await view.getByRole('tab', { name: 'Repositories', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Approve scope', exact: true }))
    .toBeDisabled()
  await view
    .getByRole('checkbox', { name: 'Service delivery', exact: true })
    .click()
  await view.getByRole('button', { name: 'Preview scope', exact: true }).click()
  await expect
    .element(view.getByText('org/child-service', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Approve scope', exact: true }).click()
  await expect
    .poll(
      () =>
        api.request.mock.calls.find(
          ([path]) => path === '/teams/team/child-scope/approve'
        )?.[1]
    )
    .toEqual({ childIds: ['child'], expectedPreviewHash: 'c'.repeat(64) })
})
it('does not approve a failed child-scope preview', async () => {
  api.request.mockImplementation(async (path: string) => {
    if (path === '/teams/options')
      return {
        ...options,
        childTeams: [{ id: 'child', name: 'Service delivery' }],
      }
    if (path === '/teams/team') return detail
    if (path.includes('/child-scope/preview'))
      throw new Error('Child team scope changed')
    return { teams: [team], total: 1, pageSize: 20 }
  })
  const view = await mount()
  await view.getByRole('button', { name: 'Platform', exact: true }).click()
  await view.getByRole('tab', { name: 'Repositories', exact: true }).click()
  await view
    .getByRole('checkbox', { name: 'Service delivery', exact: true })
    .click()
  await view.getByRole('button', { name: 'Preview scope', exact: true }).click()
  await expect
    .element(view.getByRole('button', { name: 'Approve scope', exact: true }))
    .toBeDisabled()
  expect(
    api.request.mock.calls.some(([path]) =>
      path.includes('/child-scope/approve')
    )
  ).toBe(false)
})

it('requires an explicit policy branch when the repository default is unknown', async () => {
  const original = options.repositories[0].defaultBranch
  options.repositories[0].defaultBranch = ''
  try {
    const view = await mount()
    await userEvent.click(
      view.getByRole('button', { name: 'Platform', exact: true })
    )
    await userEvent.click(
      view.getByRole('tab', { name: 'Standards & policies' })
    )
    await expect
      .element(view.getByPlaceholder('Enter the target branch'))
      .toHaveValue('')
    await expect
      .element(view.getByRole('button', { name: 'Preview impact' }))
      .toBeDisabled()
  } finally {
    options.repositories[0].defaultBranch = original
  }
})
