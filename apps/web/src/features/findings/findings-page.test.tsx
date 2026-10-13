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
  getRouteApi: () => ({ useSearch: () => ({}) }),
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: { findingId?: string; repositoryId?: string }
    search?: Record<string, string>
  }) => (
    <a
      href={
        to
          .replace('$findingId', params?.findingId ?? '')
          .replace('$repositoryId', params?.repositoryId ?? '') +
        (search ? '?' + new URLSearchParams(search) : '')
      }
    >
      {children}
    </a>
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
it('opens a standalone exact-assessment details link instead of a drawer', async () => {
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
    .element(view.getByRole('link', { name: 'Unsafe query', exact: true }))
    .toHaveAttribute(
      'href',
      expect.stringContaining('/findings/f?assessment=saved')
    )
  await expect
    .element(view.getByRole('link', { name: 'Details', exact: true }))
    .toBeVisible()
  await expect
    .element(
      view.getByRole('columnheader', { name: 'Assessed at', exact: true })
    )
    .toBeVisible()
  expect(document.querySelector('time')?.dateTime).toBe(
    '2026-10-10T00:00:00.000Z'
  )
  expect(document.querySelector('time')?.title).toBe('2026-10-10T00:00:00.000Z')
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
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
  const criticalMark = document.querySelector(
    '[aria-label="Filter Critical: 5"] [aria-hidden="true"]'
  )!
  const highMark = document.querySelector(
    '[aria-label="Filter High: 15"] [aria-hidden="true"]'
  )!
  expect(getComputedStyle(criticalMark).backgroundColor).not.toBe(
    getComputedStyle(highMark).backgroundColor
  )
  await expect
    .element(view.getByRole('heading', { name: 'Issues by check' }))
    .toBeVisible()
  await expect
    .element(view.getByText('Results are partial.', { exact: false }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Filter High: 15' }).click()
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

it('applies search and tab changes without changing findings query scope', async () => {
  const view = await render(<FindingsPage />)
  await view
    .getByRole('textbox', { name: 'Search findings' })
    .fill('  unsafe query  ')
  expect(state.key).toContain('')
  await view.getByRole('button', { name: 'Apply', exact: true }).click()
  expect(state.key).toEqual([
    'findings',
    'all',
    'all',
    undefined,
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
    'all',
    'all',
    undefined,
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

it('filters the shared list by source and finding type with keyboard controls', async () => {
  const view = await render(<FindingsPage />)
  await view.getByRole('combobox', { name: 'Finding source' }).click()
  await page
    .getByRole('option', { name: 'Repository health', exact: true })
    .click()
  expect(state.key[2]).toBe('health')
  await view.getByRole('combobox', { name: 'Finding type' }).click()
  await page.getByRole('option', { name: 'Reliability', exact: true }).click()
  expect(state.key[1]).toBe('reliability')
  await view.getByRole('combobox', { name: 'Finding source' }).click()
  await page.getByRole('option', { name: 'CI', exact: true }).click()
  expect(state.key[2]).toBe('ci')
  await view.getByRole('combobox', { name: 'Finding type' }).click()
  await page.getByRole('option', { name: 'Test failures', exact: true }).click()
  expect(state.key[1]).toBe('tests')
})
it('opens Health source details from the shared list and restores shared filters on return', async () => {
  const fingerprint = 'a'.repeat(64),
    health = 'd1845495-dda8-48b1-b61f-af7cb843abcb'
  state.query = {
    data: {
      rows: [
        {
          id: 'global-list-id',
          origin: 'health',
          health,
          healthFingerprint: fingerprint,
          title: 'Reliability finding',
          category: 'reliability',
          repositoryId: '11',
          repository: 'org/repo',
          sourceSha: 'b'.repeat(40),
          assessmentId: health,
          observedAt: '2026-10-12T14:35:00Z',
          severity: 'medium',
          status: 'Reported',
          path: 'src/app.ts',
          line: 3,
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
  const link = view.getByRole('link', {
    name: 'Reliability finding',
    exact: true,
  })
  await expect
    .element(link)
    .toHaveAttribute(
      'href',
      expect.stringContaining('/findings/' + fingerprint + '?')
    )
  await expect
    .element(link)
    .toHaveAttribute(
      'href',
      expect.stringContaining(
        'origin=health&health=' + health + '&repository=11'
      )
    )
  await expect
    .element(link)
    .toHaveAttribute('href', expect.stringContaining('source%3Dall'))
  await expect
    .element(
      view.getByRole('cell', {
        name: 'Reliability Repository health',
        exact: true,
      })
    )
    .toBeVisible()
  expect(document.querySelector('time')?.dateTime).toBe(
    '2026-10-12T14:35:00.000Z'
  )
  expect(document.querySelector('time')?.textContent).toContain('2026')
})
it('uses the shared finding table and details route for rated PR suggestions', async () => {
  state.query = {
    data: {
      summary,
      aiSummary: { suggestions: 1, repositories: 1, pullRequests: 1 },
      total: 1,
      assessedRevisions: 1,
      repositories: [],
      pageSize: 50,
      rows: [
        {
          id: 'e'.repeat(64),
          origin: 'ai',
          title: 'A queued review can be lost.',
          recommendation: 'Persist the queue.',
          impact: 'This PR can lose feedback.',
          repositoryId: '11',
          repository: 'org/project',
          sourceSha: 'a'.repeat(40),
          assessmentId: 'original',
          observedAt: '2026-10-13T18:30:00Z',
          pullRequest: 101,
          pullRequestUrl: 'https://github.com/org/project/pull/101',
          category: 'ai',
          severity: 'medium',
          status: 'AI suggestion',
          path: 'src/worker.ts',
          line: 42,
          triage: { state: 'REPORTED' },
        },
      ],
    },
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('tab', { name: 'AI suggestions' }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('columnheader', { name: 'Severity' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('cell', { name: 'medium', exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Details', exact: true }))
    .toHaveAttribute('href', expect.stringContaining('origin=ai'))
  await expect.element(view.getByText('src/worker.ts:42')).toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'PR #101' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('combobox', { name: 'Severity' }))
    .not.toBeDisabled()
  expect(state.key).toContain('all')
})

it('contains long review titles in the accessible chart data at phone widths', async () => {
  state.query = {
    data: {
      summary: {
        ...summary,
        chartTotal: 1,
        byCheck: [
          {
            name: 'Preflyt application PR review with a long title '.repeat(8),
            count: 1,
          },
        ],
      },
      rows: [],
      total: 0,
      assessedRevisions: 1,
      repositories: [],
      pageSize: 50,
    },
    refetch: vi.fn(),
  }
  await page.viewport(390, 844)
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('heading', { name: 'Issues by check' }))
    .toBeVisible()
  await expect
    .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
    .toBe(true)
  await page.viewport(1280, 800)
})
