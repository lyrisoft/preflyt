import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FindingsPage } from './findings-page'

const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  key: [] as unknown[],
  save: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: state.save, isPending: false }),
  useQuery: (options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'finding-assignees')
      return { data: [{ id: 'developer', label: 'developer' }] }
    state.key = options.queryKey
    return state.query
  },
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { organizationId: 'org' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/apps'>{children}</a>
  ),
}))
const summary = {
  reportedIssues: 0,
  affectedRepositories: 0,
  criticalHigh: 0,
  evidenceGaps: 0,
  suppressed: 0,
  chartTotal: 0,
  bySeverity: ['critical', 'high', 'medium', 'low', 'unknown'].map((name) => ({
    name,
    count: 0,
  })),
  byCheck: [],
}
beforeEach(async () => {
  await page.viewport(1280, 800)
  state.query = {
    data: {
      summary,
      rows: [],
      total: 0,
      assessedRevisions: 0,
      repositories: [],
      pageSize: 50,
    },
    refetch: vi.fn(),
  }
})
it('shows a useful empty state without fabricated findings', async () => {
  const view = await render(<FindingsPage />)
  await expect.element(view.getByText('No saved assessments yet')).toBeVisible()
  await expect
    .element(view.getByRole('heading', { name: 'Findings', level: 1 }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Apply', exact: true }))
    .toHaveClass('bg-primary')
  await expect
    .element(view.getByRole('button', { name: 'Refresh', exact: true }))
    .not.toHaveClass('bg-primary')
  await expect
    .element(view.getByRole('link', { name: 'View repositories' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Missing or unverified results' }))
    .toBeVisible()
})
it('opens exact commit evidence and preserves unverified report status', async () => {
  state.query = {
    data: {
      rows: [
        {
          id: 'f',
          title: 'Unsafe query',
          repositoryId: '1',
          repository: 'org/repo',
          sourceSha: 'a'.repeat(40),
          assessmentId: 'saved',
          observedAt: '2026-10-10T00:00:00Z',
          severity: 'high',
          status: 'Reported',
          path: 'src/db.ts',
          line: 3,
          ruleId: 'query',
          evidence: ['d'.repeat(64), 'APPROVED_CI_SOURCE_FAILED'],
          verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
          occurrences: 1,
        },
      ],
      total: 1,
      assessedRevisions: 1,
      repositories: [],
      pageSize: 50,
    },
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('table').getByText('Reported', { exact: true }))
    .toHaveClass('text-info-text')
  await view.getByRole('button', { name: 'Details', exact: true }).click()
  await expect
    .element(
      view.getByText(
        'Admin-associated report; source not independently verified'
      )
    )
    .toBeVisible()
  await expect
    .element(view.getByText('a'.repeat(40), { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('The approved CI check or workflow failed.'))
    .toBeVisible()
  await expect
    .element(view.getByText('d'.repeat(64), { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('APPROVED_CI_SOURCE_FAILED', { exact: true }))
    .not.toBeVisible()
  await view.getByText('Technical evidence', { exact: true }).click()
  await expect
    .element(view.getByText('APPROVED_CI_SOURCE_FAILED', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'View assessment' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Save changes' }))
    .not.toBeInTheDocument()
})
it('shows API failures without a misleading empty success state', async () => {
  state.query = {
    isError: true,
    error: new Error('Repository access revoked'),
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Repository access revoked')
  await expect
    .element(view.getByText('No saved assessments yet'))
    .not.toBeInTheDocument()
})

it('shows full-result metrics, keyboard severity filtering and mobile charts', async () => {
  state.query = {
    data: {
      rows: Array.from({ length: 50 }, (_, index) => ({
        id: `finding-${index}`,
        title: `Reported issue ${index}`,
        repositoryId: '1',
        repository: 'org/repo',
        sourceSha: 'a'.repeat(40),
        assessmentId: 'saved',
        observedAt: '2026-10-10T00:00:00Z',
        severity: index < 5 ? 'critical' : index < 20 ? 'high' : 'medium',
        status: 'Reported',
        path: null,
        line: null,
        ruleId: 'security.sast',
        evidence: ['digest'],
        verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
        occurrences: 1,
      })),
      total: 62,
      assessedRevisions: 4,
      repositories: [],
      pageSize: 50,
      truncated: true,
      summary: {
        ...summary,
        suppressed: 2,
        reportedIssues: 60,
        affectedRepositories: 3,
        criticalHigh: 20,
        evidenceGaps: 7,
        chartTotal: 60,
        bySeverity: [
          { name: 'critical', count: 5 },
          { name: 'high', count: 15 },
          { name: 'medium', count: 40 },
          { name: 'low', count: 0 },
          { name: 'unknown', count: 0 },
        ],
        byCheck: [{ name: 'security.sast', count: 60 }],
      },
    },
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('region', { name: 'Findings overview' }))
    .toHaveTextContent('Reported issues')
  expect(
    Array.from(
      document.querySelectorAll('[aria-label="Findings overview"] dd'),
      (item) => item.textContent?.trim()
    )
  ).toEqual(['60', '3', '20', '7'])
  expect(
    document.querySelectorAll('[aria-label="Findings overview"] dd')[2]
  ).toHaveClass('text-danger-text')
  await expect
    .element(view.getByRole('heading', { name: 'Issues by check' }))
    .toBeVisible()
  await expect
    .element(view.getByText('Results are partial.', { exact: false }))
    .toBeVisible()
  const high = view.getByRole('button', { name: 'Filter High: 15' })
  await high.click()
  expect(state.key).toContain('high')
  await userEvent.keyboard('{Tab}{Enter}')
  expect(state.key).toContain('medium')
  await expect
    .element(
      view.getByText('2 source-suppressed entries excluded', { exact: false })
    )
    .toBeVisible()
  await page.viewport(320, 844)
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await expect
    .element(view.getByRole('heading', { name: 'Issues by severity' }))
    .toBeVisible()
  await page.viewport(1280, 800)
})

it('provides compact custom triage controls with required resolution notes on mobile', async () => {
  await page.viewport(390, 844)
  state.save.mockClear()
  state.query = {
    data: {
      summary,
      canManage: true,
      rows: [
        {
          id: 'a'.repeat(64),
          title: 'Missing tests',
          repositoryId: '1',
          repository: 'org/repo',
          sourceSha: 'b'.repeat(40),
          assessmentId: 'saved',
          observedAt: '2026-10-10T00:00:00Z',
          severity: 'high',
          status: 'Reported',
          path: null,
          line: null,
          ruleId: 'tests.required',
          evidence: [],
          verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
          occurrences: 1,
          triage: {
            state: 'REPORTED',
            assigneeId: null,
            note: '',
            revision: 0,
          },
        },
      ],
      total: 1,
      repositories: [],
      pageSize: 50,
      assessedRevisions: 1,
    },
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await view.getByRole('button', { name: 'Details' }).click()
  await view.getByLabelText('Status', { exact: true }).click()
  await view.getByRole('option', { name: 'Resolved', exact: true }).click()
  await expect
    .element(view.getByLabelText('Resolution or review note'))
    .toBeRequired()
  await view
    .getByLabelText('Resolution or review note')
    .fill('Fixed in the next commit; historical evidence retained')
  await view.getByLabelText('Assignee', { exact: true }).click()
  await view.getByRole('option', { name: 'developer', exact: true }).click()
  await view.getByRole('button', { name: 'Save changes' }).click()
  expect(state.save).toHaveBeenCalledOnce()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  const drawer = document.querySelector('[data-slot="sheet-content"]')!
  expect(drawer.scrollTop).toBe(0)
  expect(
    drawer.querySelector('[data-slot="sheet-header"]')!.getBoundingClientRect()
      .top
  ).toBeGreaterThanOrEqual(0)
})

it('applies search and tab changes without changing findings query scope', async () => {
  const view = await render(<FindingsPage />)
  await view
    .getByRole('textbox', { name: 'Search findings' })
    .fill('  unsafe query  ')
  expect(state.key).toContain('')
  await view.getByRole('button', { name: 'Apply', exact: true }).click()
  expect(state.key).toEqual([
    'findings',
    'org',
    'findings',
    'all',
    'all',
    'all',
    'unsafe query',
    1,
  ])
  await view.getByRole('tab', { name: 'Missing or unverified results' }).click()
  expect(state.key).toEqual([
    'findings',
    'org',
    'gaps',
    'all',
    'all',
    'all',
    'unsafe query',
    1,
  ])
})

it('shows a loading surface before metrics are available', async () => {
  state.query = { isPending: true, refetch: vi.fn() }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('status', { name: 'Loading findings' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('region', { name: 'Findings overview' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByText('No saved assessments yet'))
    .not.toBeInTheDocument()
})
