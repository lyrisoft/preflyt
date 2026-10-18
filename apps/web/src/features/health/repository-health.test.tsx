import type { ReactNode, AnchorHTMLAttributes } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { HealthCoverageDetails } from './health-coverage-details'
import { RepositoryHealth } from './repository-health'

const state = vi.hoisted(() => ({
  latestAttempt: null as null | {
    id: string
    branch: string
    state: string
    reason: string | null
    retryAt: string | null
  },
  mode: 'EXECUTED',
  state: 'COMPLETED',
  progress: 'SCANNING',
  failureReason: null as string | null,
  noReport: false,
  unpinned: false,
  category: null as 'coverage' | null,
  categoryResults: null as Record<
    string,
    { assessmentId: string; finishedAt: string; value: string } | null
  > | null,
  retryAt: null as string | null,
  role: 'OWNER',
  timeline: false,
  duplication: false,
  hotspots: false,
  coverage: false,
  policy: false,
  scanErrors: false,
  measuredFiles: false,
  manyAnalyses: false,
  manyFindings: false,
  manyHistory: false,
  scanning: true,
  readinessReason: 'READY',
  readinessFailure: false,
  platformAdmin: false,
  fetch: vi.fn(),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: {
      identityId: 'owner',
      organizationId: 'org',
      authenticated: true,
      platformAdmin: state.platformAdmin,
      role: state.role,
      permissions:
        state.role === 'OWNER'
          ? ['execution.run', 'assessment.read']
          : ['assessment.read'],
      repositoryScopes: [
        {
          repositoryId: '51',
          permissions: ['execution.run', 'assessment.read'],
        },
      ],
      organizationWide: true,
      repositoryGrants: ['51'],
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children?: ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={`${to.replace(/\$([A-Za-z]\w*)/g, (_, key) => encodeURIComponent(params?.[key] ?? ''))}?${new URLSearchParams(search)}`}
      {...props}
    >
      {children}
    </a>
  ),
}))
vi.mock('@/features/repositories/branch-picker', () => ({
  BranchPicker: ({
    value,
    onValueChange,
    disabled,
    id,
  }: {
    disabled?: boolean
    id?: string
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label='Assessment branch'
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option>development</option>
      <option>main</option>
    </select>
  ),
}))
const id = '11111111-1111-4111-8111-111111111111',
  sha = 'a'.repeat(40)
const report = () => ({
  version: 1,
  ...(state.category ? { selection: state.category } : {}),
  ...(state.duplication
    ? {
        measurements: {
          duplication: {
            version: 1,
            formula: 'unique-lines-v1',
            analyzedLines: 100,
            duplicatedLines: 20,
            analyzedFiles: 2,
            clonePairs: 1,
          },
        },
      }
    : {}),
  mode: state.mode,
  completeness: 'PARTIAL',
  ...(state.policy
    ? {
        policyContext: {
          version: 1,
          state: 'CAPTURED',
          policyId: 'policy',
          revision: 3,
          definitionHash: 'a'.repeat(64),
          selectionId: 'selection',
          branchRef: 'refs/heads/development',
          capturedAt: '2026-10-12T00:00:00Z',
          requirements: 2,
          evidence: {
            state: 'HISTORICAL_PREVIEW',
            assessmentId: 'ci-report',
            evaluatorVersion: 2,
            covered: 1,
            passing: 1,
            blocked: 0,
            incomplete: 1,
            percentage: 50,
          },
        },
      }
    : {}),
  inspection: { complete: true, fileCount: 3, languages: ['TypeScript'] },
  ...(state.coverage
    ? {
        measurements: {
          coverage: {
            version: 1,
            formula: 'node-covered-lines-v1',
            scope: 'node-loaded-files',
            analyzedLines: 10,
            coveredLines: 6,
            analyzedFiles: 1,
            tests: 2,
            passed: 2,
          },
        },
      }
    : {}),
  analyses: [
    ...(state.coverage
      ? [
          {
            id: 'tests.coverage',
            title: 'Optional test coverage',
            state: 'PASS',
            reason: 'CHECKS_PASSED',
            findingsRetained: 0,
          },
        ]
      : []),
    ...(state.hotspots
      ? [
          {
            id: 'security.hotspots',
            title: 'Security hotspot review',
            state: 'FAIL',
            reason: 'FINDINGS_REPORTED',
            findingsRetained: 2,
          },
        ]
      : []),
    ...(state.duplication
      ? [
          {
            id: 'quality.duplication',
            title: 'Duplicated code',
            state: 'FAIL',
            reason: 'FINDINGS_REPORTED',
            findingsRetained: 2,
          },
        ]
      : []),
    {
      id: 'security.sast',
      title: 'Static security analysis',
      ...(state.scanErrors
        ? { scanErrors: [{ type: 'Timeout', path: 'src/large.ts' }] }
        : {}),
      ...(state.measuredFiles
        ? {
            fileAnalysis: {
              version: 1,
              formula: 'semgrep-candidate-files-v1',
              scope: 'js-ts-python',
              candidateFiles: 3,
              analyzedFiles: 2,
              skippedFiles: 1,
              pathsDigest: 'e'.repeat(64),
            },
          }
        : {}),
      scope: 'JavaScript, TypeScript and Python only: eval and exec calls.',
      state: state.mode === 'EXECUTED' ? 'FAIL' : 'UNAVAILABLE',
      reason:
        state.mode === 'EXECUTED' ? 'FINDINGS_REPORTED' : 'REVIEW_REQUIRED',
      tool: '1.0',
      findingsRetained:
        state.mode === 'EXECUTED' ? (state.manyFindings ? 12 : 1) : undefined,
    },
    ...(state.manyAnalyses
      ? Array.from({ length: 7 }, (_, index) => ({
          id: `fixture.extra-${index + 1}`,
          title: `Extra check ${index + 1}`,
          state: 'PASS',
          reason: 'CHECKS_PASSED',
          ...(index === 0 ? {} : { findingsRetained: 0 }),
        }))
      : []),
  ],
  findings:
    state.mode === 'EXECUTED'
      ? [
          {
            fingerprint: 'b'.repeat(64),
            category: 'security',
            severity: 'high',
            title: 'Unsafe SQL expression',
            ruleId: 'sql-injection',
            path: 'src/db.ts',
            line: 7,
            checkId: 'security.sast',
            evidence: 'ANALYZER_REPORTED',
          },
          ...(state.manyFindings
            ? Array.from({ length: 11 }, (_, index) => ({
                fingerprint: (index + 2).toString(16).padStart(64, '0'),
                category: 'security',
                severity: 'high',
                title: `Additional finding ${index + 2}`,
                ruleId: 'sql-injection',
                path: 'src/db.ts',
                line: index + 8,
                checkId: 'security.sast',
                evidence: 'ANALYZER_REPORTED',
              }))
            : []),
          ...(state.hotspots
            ? ['c', 'd'].map((value) => ({
                fingerprint: value.repeat(64),
                category: 'hotspot',
                severity: 'medium',
                title: 'MD5 security-sensitive hash',
                ruleId: 'preflyt-js-md5-review',
                path: 'hash.ts',
                line: 1,
                checkId: 'security.hotspots',
                evidence: 'ANALYZER_REPORTED',
              }))
            : []),
        ]
      : [],
  limits: ['Reliability and maintainability metrics are unavailable.'],
})
const row = () => ({
  id,
  branch: 'development',
  state: state.state,
  progress: state.progress,
  sourceSha: state.unpinned ? null : sha,
  report: state.noReport ? null : report(),
  category: state.category,
  reason: state.failureReason,
  retryAt: state.retryAt,
  cancelled: false,
  createdAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
})
beforeEach(() => {
  state.mode = 'EXECUTED'
  state.latestAttempt = null
  state.state = 'COMPLETED'
  state.failureReason = null
  state.noReport = false
  state.unpinned = false
  state.category = null
  state.categoryResults = null
  state.retryAt = null
  state.progress = 'SCANNING'
  state.role = 'OWNER'
  state.timeline = false
  state.duplication = false
  state.hotspots = false
  state.coverage = false
  state.policy = false
  state.scanErrors = false
  state.measuredFiles = false
  state.manyAnalyses = false
  state.manyFindings = false
  state.manyHistory = false
  state.scanning = true
  state.readinessReason = 'READY'
  state.readinessFailure = false
  state.platformAdmin = false
  state.fetch.mockReset()
  state.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/health/test-apps'))
        return Response.json({
          complete: true,
          apps: [
            { directory: 'api', name: 'maiguard-api', framework: 'node' },
            {
              directory: 'performance',
              name: 'maiguard-tester',
              framework: 'node',
            },
          ],
        })
      if (url.includes('/native-execution/status'))
        return state.readinessFailure
          ? Response.json(
              { message: 'Repository access unavailable' },
              { status: 403 }
            )
          : Response.json({
              executionAvailable: state.scanning,
              preflightVerified: state.scanning,
              checkedAt: new Date().toISOString(),
              reason: state.readinessReason,
            })
      if (init?.method === 'POST')
        return new Response(JSON.stringify({ ...row(), state: 'QUEUED' }), {
          status: 201,
        })
      if (url.includes('/health/freshness?'))
        return Response.json({
          assessmentId: id,
          sourceSha: sha,
          branch: 'development',
          freshness: 'STALE',
          checkedAt: new Date().toISOString(),
        })
      if (url.includes('/source'))
        return new Response(
          JSON.stringify({
            sourceSha: sha,
            path: 'src/db.ts',
            line: 7,
            reason: null,
            lines: [
              { number: 6, text: 'const query = input;' },
              { number: 7, text: 'database.execute(query);' },
              { number: 8, text: 'return rows;' },
            ],
          })
        )
      if (url.includes('/github/health?'))
        return new Response(
          JSON.stringify({
            statuses: { complete: 0, partial: 1, failed: 0, cancelled: 0 },
            priorityFindings: [],
            summary: {
              repositories: 1,
              analyzed: 1,
              assessed: 1,
              active: 0,
              incomplete: 1,
              high: 1,
              notAssessed: 0,
            },
            bounded: false,
            page: 1,
            total: 1,
            items: [
              {
                repositoryId: '51',
                name: 'fixture/repo',
                branch: 'development',
                id,
                state: state.state,
                mode: state.mode,
                completeness: 'PARTIAL',
                freshness: 'STALE',
                findings: 1,
                severity: { high: 1 },
                finishedAt: new Date().toISOString(),
              },
            ],
          })
        )
      const requestedPage = Number(
        new URL(url, 'http://localhost').searchParams.get('page') ?? '1'
      )
      const history = state.manyHistory
        ? Array.from({ length: 12 }, (_, index) => ({
            ...row(),
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            sourceSha: String(index + 1)
              .padStart(7, '0')
              .repeat(6),
          }))
        : [row()]
      return new Response(
        JSON.stringify({
          branch: 'development',
          assessment: row(),
          latestAttempt: state.latestAttempt,
          ciCoverage: state.coverage
            ? {
                state: 'VERIFIED',
                sourceSha: sha,
                reason: 'CI_COVERAGE_VERIFIED',
                measurement: {
                  analyzedFiles: 1,
                  analyzedLines: 10,
                  coveredLines: 6,
                },
                tests: {
                  tests: 2,
                  passed: 2,
                  failures: 0,
                  errors: 0,
                  skipped: 0,
                },
                testsState: 'PASS',
                runUrl:
                  'https://github.com/fixture/repo/actions/runs/12/attempts/1',
              }
            : {
                state: 'MISSING',
                sourceSha: sha,
                reason: 'CI_COVERAGE_NOT_RECEIVED',
              },
          ...(state.categoryResults
            ? { categoryResults: state.categoryResults }
            : {}),
          freshness: 'STALE',
          checkedAt: new Date().toISOString(),
          history: history.slice((requestedPage - 1) * 10, requestedPage * 10),
          page: requestedPage,
          total: history.length,
          trend: null,
          ...(state.hotspots
            ? {
                hotspotReview: {
                  version: 1,
                  formula: 'reviewed-retained-hotspots-v1',
                  reviewed: 1,
                  total: 2,
                  complete: true,
                  percentage: 50,
                },
              }
            : {}),
          timeline: state.timeline
            ? [
                {
                  id: '22222222-2222-4222-8222-222222222222',
                  sourceSha: 'd'.repeat(40),
                  at: '2026-10-09T10:00:00Z',
                  findings: 4,
                  partial: true,
                  comparableFindings: 4,
                  checkIds: ['quality.reliability'],
                },
                {
                  id,
                  sourceSha: sha,
                  at: '2026-10-11T10:00:00Z',
                  findings: 1,
                  partial: false,
                  comparableFindings: 1,
                  checkIds: ['quality.reliability'],
                },
              ]
            : [],
        })
      )
    }
  )
  vi.stubGlobal('fetch', state.fetch)
})
function mount(
  selectedBranch?: string,
  onQueued?: (assessment: { id: string; branch: string }) => void
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RepositoryHealth
        repositoryId='51'
        name='fixture/repo'
        defaultBranch='development'
        selectedBranch={selectedBranch}
        onAssessmentQueued={onQueued}
      />
    </QueryClientProvider>
  )
}
function mountCoverage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <HealthCoverageDetails repositoryId='51' assessmentId={id} />
    </QueryClientProvider>
  )
}
it('starts Health directly without an approval banner or native-execution readiness request', async () => {
  state.scanning = false
  state.readinessReason = 'REVIEW_REQUIRED'
  await mount()
  await expect
    .element(page.getByRole('button', { name: 'Reassess', exact: true }))
    .toBeEnabled()
  await expect
    .element(page.getByRole('status', { name: 'Scanning readiness' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'Open configuration' }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
    )
    .toBe(true)
  expect(
    state.fetch.mock.calls.some(([url]) =>
      String(url).includes('/native-execution/status')
    )
  ).toBe(false)
})

it('links findings to their exact Health details page instead of a drawer', async () => {
  await mount()
  await expect
    .element(
      page.getByRole('link', { name: 'Unsafe SQL expression', exact: true })
    )
    .toHaveAttribute('href', expect.stringContaining('/findings/'))
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
})
it('explains unavailable analysis and health labels in Help without presenting a clean result', async () => {
  state.mode = 'INSPECTION_ONLY'
  await mount()
  await expect
    .element(page.getByText('Findings unavailable because no analyzer ran.'))
    .toBeVisible()
  await page.getByRole('button', { name: 'Help for Repository health' }).click()
  await expect
    .element(page.getByRole('heading', { name: 'Freshness and history' }))
    .toBeVisible()
  await expect
    .element(page.getByText('Current means', { exact: false }))
    .toBeVisible()
})
it('shows report history and permits reassessment of another branch without a CI workflow', async () => {
  await mount()
  await page
    .getByRole('combobox', { name: 'Assessment branch' })
    .selectOptions('main')
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  expect(
    JSON.parse(
      state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]
        .body
    ).branch
  ).toBe('main')
})
it('loads the chosen branch immediately and never displays the previous branch report for an unassessed branch', async () => {
  const original = state.fetch.getMockImplementation()!
  state.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (
        url.pathname.endsWith('/51/health') &&
        url.searchParams.get('branch') === 'main' &&
        init?.method !== 'POST'
      ) {
        return Response.json({
          branch: 'main',
          assessment: null,
          history: [],
          total: 0,
          page: 1,
          ciCoverage: { state: 'MISSING', sourceSha: null },
          freshness: 'UNVERIFIED',
          checkedAt: null,
        })
      }
      return original(input, init)
    }
  )
  await mount()
  await expect
    .element(
      page.getByRole('link', { name: 'Unsafe SQL expression', exact: true })
    )
    .toBeVisible()
  await page
    .getByRole('combobox', { name: 'Assessment branch' })
    .selectOptions('main')
  await expect
    .element(page.getByRole('heading', { name: 'Not assessed', exact: true }))
    .toBeVisible()
  await expect
    .element(
      page.getByRole('link', { name: 'Unsafe SQL expression', exact: true })
    )
    .not.toBeInTheDocument()
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
  await page
    .getByRole('button', { name: 'Assess repository', exact: true })
    .click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(
        ([, init]) =>
          init?.method === 'POST' && JSON.parse(init.body).branch === 'main'
      )
    )
    .toBe(true)
})
it('keeps the branch view unpinned after queuing so previous results remain visible', async () => {
  const queuedId = '22222222-2222-4222-8222-222222222222',
    onQueued = vi.fn()
  const original = state.fetch.getMockImplementation()!
  state.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Response.json({ ...row(), id: queuedId, state: 'QUEUED' })
      return original(input, init)
    }
  )
  await mount(undefined, onQueued)
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect.poll(() => onQueued.mock.calls.length).toBe(1)
  expect(onQueued).toHaveBeenCalledWith(
    expect.objectContaining({ id: queuedId, branch: 'development' })
  )
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(
        ([input, init]) =>
          init?.method !== 'POST' &&
          new URL(String(input), 'http://localhost').searchParams.get(
            'assessment'
          ) === null
      )
    )
    .toBe(true)
})
it('remains usable at 320px without page overflow', async () => {
  await page.viewport(320, 900)
  state.timeline = true
  await mount()
  await expect
    .element(page.getByText('Repository health', { exact: true }))
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  await page.viewport(1280, 800)
})

it('prevents reassessment against a fallback branch while the persisted target is loading', async () => {
  state.fetch.mockImplementation(() => new Promise(() => {}))
  await mount()
  await expect
    .element(page.getByRole('button', { name: 'Assess repository' }))
    .toBeDisabled()
  await expect
    .element(page.getByRole('combobox', { name: 'Assessment branch' }))
    .toBeDisabled()
})

it('shows partial observations above metrics above metrics and opens its exact historical report from chart data', async () => {
  state.timeline = true
  await mount()
  const chart = page.getByRole('region', { name: 'Findings over time' })
  await expect
    .element(
      chart.getByText(
        'Compared rule packs: Reliability. Comparison line only; bars include all retained findings.'
      )
    )
    .toBeVisible()
  await expect
    .element(chart.getByRole('img'))
    .toHaveAttribute(
      'aria-label',
      '2 assessments, 1 partial. Retained finding counts in chronological order: 4, 1. Exact revisions and coverage are in View chart data.'
    )
  const chartElement = document.querySelector(
    '[aria-label="Findings over time"]'
  )!
  const metric = Array.from(
    document.querySelectorAll('[data-slot="card"]')
  ).find(
    (node) =>
      node.querySelector('[data-slot="card-title"]')?.textContent === 'Security'
  )!
  expect(
    chartElement.compareDocumentPosition(metric) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  await chart.getByText('View chart data', { exact: true }).click()
  await chart
    .getByRole('button', { name: 'Open health report ddddddd', exact: true })
    .click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([url]) =>
        String(url).includes('assessment=22222222-2222-4222-8222-222222222222')
      )
    )
    .toBe(true)
})
it('shows unavailable history without plotting incomplete analysis as zero', async () => {
  state.mode = 'INSPECTION_ONLY'
  await mount()
  const chart = page.getByRole('region', { name: 'Findings over time' })

  await expect
    .element(chart.getByText('Analysis history unavailable', { exact: true }))
    .toBeVisible()
  await expect
    .element(chart.getByRole('img'))
    .toHaveAttribute(
      'aria-label',
      'Findings over time unavailable. No recorded finding counts are available.'
    )
  await expect
    .element(chart.getByText('View chart data', { exact: true }))
    .not.toBeInTheDocument()
})
it('reassesses the header-selected branch without a second branch picker or help button', async () => {
  await mount('main')
  await expect
    .element(page.getByText('Repository health', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('combobox', { name: 'Assessment branch' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Help for Repository health' }))
    .not.toBeInTheDocument()
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  expect(
    JSON.parse(
      state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]
        .body
    ).branch
  ).toBe('main')
})

it('merges assessment controls and the chart in one compact panel above metrics in both themes', async () => {
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await mount('development')
    await expect
      .element(page.getByText('Analyses completed', { exact: true }))
      .toBeVisible()
    const panel = document.querySelector(
      '[aria-label="Repository health summary"]'
    )!
    expect(
      panel.querySelector('[aria-label="Findings over time"]')
    ).not.toBeNull()
    expect(panel.querySelector('[data-slot="card"]')).toBeNull()
    expect(
      panel.querySelector('[role="img"]')!.getBoundingClientRect().height
    ).toBeLessThanOrEqual(110)
    expect(panel.textContent).toContain('Reassess')
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
})
it('renders report metrics without waiting for branch freshness and suppresses stale cached reports after access denial', async () => {
  const respond = state.fetch.getMockImplementation()!
  let release!: (value: Response) => void
  const freshness = new Promise<Response>((resolve) => {
    release = resolve
  })
  state.fetch.mockImplementation((url, init) =>
    String(url).includes('/health/freshness?') ? freshness : respond(url, init)
  )
  const view = await mount('development')
  await expect
    .element(page.getByText('Analyses completed', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByText('Checking freshness…', { exact: true }))
    .toBeVisible()
  release(
    Response.json({
      assessmentId: id,
      sourceSha: sha,
      branch: 'development',
      freshness: 'CURRENT',
      checkedAt: new Date().toISOString(),
    })
  )
  await expect.element(page.getByText('Current', { exact: true })).toBeVisible()
  state.fetch.mockResolvedValue(
    Response.json({ message: 'Access revoked' }, { status: 403 })
  )
  await page
    .getByRole('button', { name: 'Refresh health report', exact: true })
    .click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access is unavailable')
  await expect
    .element(page.getByText('Analyses completed', { exact: true }))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('hides report data if the independent freshness check reveals revoked access', async () => {
  const respond = state.fetch.getMockImplementation()!
  state.fetch.mockImplementation((url, init) =>
    String(url).includes('/health/freshness?')
      ? Promise.resolve(
          Response.json({ message: 'Access revoked' }, { status: 403 })
        )
      : respond(url, init)
  )
  const view = await mount('development')
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access is unavailable')
  await expect
    .element(page.getByText('Analyses completed', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Assess repository' }))
    .toBeDisabled()
  await view.unmount()
})

it('shows measured duplication and its actual denominator alongside analysis coverage', async () => {
  state.duplication = true
  await mount()
  await expect
    .element(page.getByText('20.0% duplicated', { exact: false }))
    .toBeVisible()
  await page.getByText('Duplicated code', { exact: true }).click()
  await expect
    .element(
      page.getByText(
        '20 of 100 analyzed lines · 2 files. Overlapping blocks count once.'
      )
    )
    .toBeVisible()
})

it('shows automated hotspot findings separately from optional review counts', async () => {
  state.hotspots = true
  await mount()
  await expect
    .element(
      page.getByRole('link', { name: 'View security hotspots findings' })
    )
    .not.toBeInTheDocument()
  await page.getByText('Security hotspot review', { exact: true }).click()
  await expect
    .element(page.getByText('Optional review · 1 / 2 reviewed'))
    .toBeVisible()
  await expect
    .element(
      page.getByText('50.0% reviewed. Decisions apply to this commit only.')
    )
    .toBeVisible()
})

it('uses automatic test discovery on reassessment without asking for individual tests', async () => {
  await mount()
  await expect
    .element(page.getByRole('checkbox', { name: 'Run tests for coverage' }))
    .not.toBeInTheDocument()
  await expect
    .poll(() =>
      document.querySelector<HTMLParagraphElement>(
        '[aria-label="Test coverage: Unavailable"]'
      )
    )
    .not.toBeNull()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
    )
    .toBe(true)
  const body = JSON.parse(
    String(
      state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1]
        .body
    )
  )
  expect(body).not.toHaveProperty('includeCoverage')
})
it('runs tests alone and keeps the older security result linked to the same commit', async () => {
  const previous = '22222222-2222-4222-8222-222222222222'
  state.category = 'coverage'
  state.coverage = true
  state.categoryResults = {
    security: {
      assessmentId: previous,
      finishedAt: '2026-10-14T06:00:00Z',
      value: '3',
    },
    coverage: {
      assessmentId: id,
      finishedAt: '2026-10-14T06:30:00Z',
      value: 'Unavailable',
    },
  }
  await mount()
  await expect
    .element(
      page.getByText('This assessment ran tests and coverage only.', {
        exact: false,
      })
    )
    .toBeVisible()
  await expect.element(page.getByLabelText('Security: 3')).toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'View security findings' }))
    .toHaveAttribute('href', expect.stringContaining(previous))
  await expect
    .element(page.getByRole('button', { name: 'Run test coverage' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'Open test coverage details' }))
    .toHaveAttribute('href', expect.stringContaining('category=coverage'))
})
it('shows verified CI coverage and test counts without execution or settings actions', async () => {
  state.coverage = true
  await mountCoverage()
  await expect
    .element(
      page.getByRole('heading', { name: 'Tests and coverage', level: 1 })
    )
    .toBeVisible()
  await expect.element(page.getByText('60.0%', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('2 passed · 0 failed · 0 skipped'))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'View CI run and logs' }))
    .toHaveAttribute(
      'href',
      expect.stringContaining('/actions/runs/12/attempts/1')
    )
  await expect
    .element(page.getByRole('button', { name: 'Run test coverage' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Test coverage settings' }))
    .not.toBeInTheDocument()
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
})
it('explains missing CI coverage with a setup link and no fabricated zero', async () => {
  await mountCoverage()
  await expect
    .element(page.getByText('Coverage not received', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'CI coverage setup' }))
    .toHaveAttribute(
      'href',
      'https://docs.preflytlabs.com/user-guide/repository-health'
    )
  await expect.element(page.getByText('—', { exact: true })).toBeVisible()
})
it('shows actual measured coverage with test counts and the loaded-file scope', async () => {
  state.coverage = true
  await mount()
  await expect
    .element(page.getByText('60.0% covered', { exact: false }))
    .toBeVisible()
  await page.getByText('Optional test coverage', { exact: true }).click()
  await expect
    .element(
      page.getByText(
        '6 of 10 measured lines · 2 tests passed. Loaded source files only; unimported files are excluded.'
      )
    )
    .toBeVisible()
})

it('shows the saved analyzer scope alongside the coverage outcome', async () => {
  await mount()
  await page.getByText('Static security analysis', { exact: true }).click()
  await expect
    .element(
      page.getByText(
        'JavaScript, TypeScript and Python only: eval and exec calls.'
      )
    )
    .toBeVisible()
})
it('aligns analysis cards in the same row when their summaries have different lengths', async () => {
  await page.viewport(1280, 900)
  state.duplication = true
  state.scanErrors = true
  await mount()
  await expect.element(page.getByLabelText('Analysis coverage')).toBeVisible()
  const cards = document.querySelectorAll(
    '[aria-label="Analysis coverage"] details.group'
  )
  expect(cards).toHaveLength(2)
  expect(cards[0].getBoundingClientRect().bottom).toBeCloseTo(
    cards[1].getBoundingClientRect().bottom,
    0
  )
  const firstAction = cards[0].querySelector('summary > span:last-child')!
  const secondAction = cards[1].querySelector('summary > span:last-child')!
  expect(firstAction.getBoundingClientRect().top).toBeCloseTo(
    secondAction.getBoundingClientRect().top,
    0
  )
})

it('shows historical policy evidence separately and links to the original CI assessment', async () => {
  state.policy = true
  await mount()
  await expect
    .element(page.getByText('Policy revision 3 · 2 requirements'))
    .toBeVisible()
  await expect.element(page.getByText('1 / 2 evaluated')).toBeVisible()
  await expect
    .element(page.getByText('1 passing · 0 blocked · 1 incomplete'))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'View policy assessment' }))
    .toHaveAttribute(
      'href',
      '/repositories/51?tab=assessments&assessment=ci-report'
    )
  await expect
    .element(page.getByText('Separate from file analysis.', { exact: false }))
    .toBeVisible()
})

it('shows measured per-analyzer file counts without claiming inventory files were scanned', async () => {
  state.measuredFiles = true
  await mount()
  await expect
    .element(page.getByText('2 / 3 candidate files analyzed', { exact: true }))
    .toBeVisible()
  await page.getByText('Static security analysis', { exact: true }).click()
  await expect
    .element(page.getByText('1 not analyzed.', { exact: false }))
    .toBeVisible()
  await expect
    .element(page.getByText('Files discovered', { exact: true }))
    .toBeVisible()
})

it('uses a consistent dash for all missing dimension metrics', async () => {
  state.mode = 'INSPECTION_ONLY'
  await mount()
  await expect
    .poll(() =>
      [...document.querySelectorAll('p[aria-label]')].filter(
        (node) => node.textContent === '—'
      )
    )
    .toHaveLength(5)
  for (const label of [
    'Security',
    'Reliability',
    'Maintainability',
    'Duplication',
  ]) {
    await expect
      .element(
        document.querySelector<HTMLParagraphElement>(
          `[aria-label="${label}: Unavailable"]`
        )!
      )
      .toBeVisible()
  }
  await expect
    .poll(() =>
      document.querySelector<HTMLParagraphElement>(
        '[aria-label="Test coverage: Unavailable"]'
      )
    )
    .not.toBeNull()
})

it('shows retained counts with a Partial scan badge instead of a comparison symbol', async () => {
  state.categoryResults = {
    security: {
      assessmentId: id,
      finishedAt: '2026-10-14T06:00:00Z',
      value: '≥228',
    },
  }
  await mount()
  const card = page.getByRole('link', { name: 'View security findings' })
  await expect.element(card.getByText('228', { exact: true })).toBeVisible()
  await expect
    .element(card.getByText('Partial scan', { exact: true }))
    .toBeVisible()
  await expect.element(card).not.toHaveTextContent('≥')
})

it('links the five metric cards to their exact report and category', async () => {
  await mount()
  for (const label of [
    'security',
    'reliability',
    'maintainability',
    'duplication',
    'test coverage',
  ]) {
    const linkName =
      label === 'test coverage'
        ? 'Open test coverage details'
        : `View ${label} findings`
    await expect
      .element(page.getByRole('link', { name: linkName }))
      .toBeVisible()
    await expect
      .element(page.getByRole('link', { name: linkName }))
      .toHaveAttribute(
        'href',
        expect.stringContaining(
          `category=${label === 'test coverage' ? 'coverage' : label}`
        )
      )
    await expect
      .element(
        page.getByRole('link', {
          name:
            label === 'test coverage'
              ? 'Open test coverage details'
              : `View ${label} findings`,
        })
      )
      .toHaveAttribute('href', expect.stringContaining(`health=${id}`))
  }
})

it('paginates analyzer outcomes and keeps the detailed scope collapsed until opened', async () => {
  state.manyAnalyses = true
  await mount()
  const coverage = page.getByLabelText('Analysis coverage')
  await expect.element(coverage.getByText('8 / 8')).toBeVisible()
  await expect
    .element(coverage.getByText('1', { exact: true }).first())
    .toBeVisible()
  await expect
    .element(coverage.getByText('1–4 of 8 analyzers · page 1 of 2'))
    .toBeVisible()
  await expect
    .element(coverage.getByText('Extra check 3', { exact: true }))
    .toBeVisible()
  await expect
    .element(coverage.getByText('Extra check 4', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(
      coverage.getByText(
        'JavaScript, TypeScript and Python only: eval and exec calls.'
      )
    )
    .not.toBeVisible()
  await coverage.getByRole('button', { name: 'Next' }).click()
  await expect
    .element(coverage.getByText('5–8 of 8 analyzers · page 2 of 2'))
    .toBeVisible()
  await expect
    .element(coverage.getByText('Extra check 7', { exact: true }))
    .toBeVisible()
  await expect
    .element(coverage.getByText('Static security analysis', { exact: true }))
    .not.toBeInTheDocument()
  await coverage.getByRole('button', { name: 'Previous' }).click()
  await coverage.getByText('Static security analysis', { exact: true }).click()
  await expect
    .element(
      coverage.getByText(
        'JavaScript, TypeScript and Python only: eval and exec calls.'
      )
    )
    .toBeVisible()
})

it('explains why security findings can coexist with unavailable metrics', async () => {
  await mount()
  await expect
    .element(page.getByText('Retained findings in the analyzed scope'))
    .toBeVisible()
  await expect
    .element(page.getByText('No verified finding count yet').first())
    .toBeVisible()
  await expect
    .element(page.getByText('No verified duplication measurement'))
    .toBeVisible()
  await expect
    .element(page.getByText('Coverage not received', { exact: true }))
    .toBeVisible()
})

it('shows no more than ten findings per page and paginates the recorded list', async () => {
  state.manyFindings = true
  await mount()
  const findings = page.getByLabelText('Repository findings')
  await expect.element(findings.getByText('1–10 of 12')).toBeVisible()
  await expect
    .element(findings.getByText('Additional finding 11'))
    .not.toBeInTheDocument()
  await findings.getByRole('button', { name: 'Next', exact: true }).click()
  await expect.element(findings.getByText('11–12 of 12')).toBeVisible()
  await expect
    .element(findings.getByText('Additional finding 11'))
    .toBeVisible()
  await expect
    .element(findings.getByText('Unsafe SQL expression'))
    .not.toBeInTheDocument()
})

it('shows no more than ten history entries per page', async () => {
  state.manyHistory = true
  await mount()
  await page.getByRole('tab', { name: 'Assessment history (12)' }).click()
  const history = page.getByLabelText('Assessment history', { exact: true })
  await expect
    .element(history.getByText('1–10 of 12 reports · page 1 of 2'))
    .toBeVisible()
  await expect
    .element(history.getByText('0000011', { exact: true }))
    .not.toBeInTheDocument()
  await history.getByRole('button', { name: 'Next history page' }).click()
  await expect
    .element(history.getByText('11–12 of 12 reports · page 2 of 2'))
    .toBeVisible()
  await expect
    .element(history.getByText('0000011', { exact: true }))
    .toBeVisible()
  await expect
    .element(history.getByText('0000001', { exact: true }))
    .not.toBeInTheDocument()
})

it('keeps findings and assessment history in separate tabs', async () => {
  await mount()
  await expect
    .element(page.getByRole('tab', { name: 'Findings (1)' }))
    .toHaveAttribute('aria-selected', 'true')
  await expect.element(page.getByLabelText('Repository findings')).toBeVisible()
  await expect
    .element(page.getByLabelText('Assessment history', { exact: true }))
    .not.toBeInTheDocument()
  await page.getByRole('tab', { name: 'Assessment history (1)' }).click()
  await expect
    .element(page.getByLabelText('Assessment history', { exact: true }))
    .toBeVisible()
  await expect
    .element(
      page
        .getByLabelText('Assessment history', { exact: true })
        .getByText('Completed', { exact: true })
    )
    .toHaveClass('text-success-text')
  await expect
    .element(page.getByLabelText('Repository findings'))
    .not.toBeInTheDocument()
})

for (const [stage, label] of [
  ['FETCHING_SOURCE', 'Fetching repository files'],
  ['SCANNING', 'Scanning repository files'],
  ['VERIFYING_RESULTS', 'Verifying scan results'],
]) {
  it(`shows visible progress for ${stage} before report metrics`, async () => {
    state.state = 'RUNNING'
    state.progress = stage
    await mount()
    await expect
      .element(page.getByRole('status', { name: 'Assessment progress' }))
      .toBeVisible()
    await expect.element(page.getByText(label, { exact: true })).toBeVisible()
    await expect
      .element(page.getByRole('link', { name: 'View security findings' }))
      .not.toBeInTheDocument()
  })
}

it('shows safe scanner failure locations in the existing evidence details', async () => {
  state.scanErrors = true
  await mount()
  await page.getByText('Scope and evidence', { exact: true }).first().click()
  await expect
    .element(page.getByText('src/large.ts: Timeout', { exact: true }))
    .toBeVisible()
})

it('explains a pre-scan GitHub rate-limit failure without needing a report, including history and retry time', async () => {
  state.state = 'FAILED'
  state.noReport = true
  state.unpinned = true
  state.failureReason = 'GITHUB_RATE_LIMITED'
  state.retryAt = '2026-10-14T07:00:00Z'
  await page.viewport(320, 900)
  await mount()
  const failure = page.getByRole('alert', { name: 'Assessment failure' })
  await expect
    .element(
      failure.getByText(
        'Stopped before the commit was pinned. No scanners or tests ran.'
      )
    )
    .toBeVisible()
  await expect
    .element(
      failure.getByText('Wait until the retry time, then select Reassess.')
    )
    .toBeVisible()
  await expect
    .element(
      failure.getByText('Repository requests are temporarily paused.', {
        exact: false,
      })
    )
    .toBeVisible()
  await expect
    .element(failure.getByText('Retry after', { exact: false }))
    .toBeVisible()
  const history = page.getByLabelText('Assessment history', { exact: true })
  await expect
    .element(history.getByText('Stopped before scanning'))
    .toBeVisible()
  await expect
    .element(
      history.getByText('Repository requests are temporarily paused.', {
        exact: false,
      })
    )
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  await failure.getByText('Technical details').click()
  await expect.element(failure.getByText(`Assessment ID: ${id}`)).toBeVisible()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
    )
    .toBe(true)
  await page.viewport(1280, 800)
})
it.each(['password=provider-secret', '__proto__', 'constructor'])(
  'explains unknown failure %s safely and keeps retry unavailable to readers',
  async (reason) => {
    state.state = 'FAILED'
    state.noReport = true
    state.unpinned = true
    state.role = 'READER'
    state.failureReason = reason
    await mount()
    const failure = page.getByRole('alert', { name: 'Assessment failure' })
    await expect
      .element(
        failure.getByText(
          'The assessment stopped without a usable result. A specific cause was not recorded.'
        )
      )
      .toBeVisible()
    await failure.getByText('Technical details').click()
    expect(document.body.textContent).not.toContain('provider-secret')
    await expect
      .element(page.getByRole('button', { name: 'Reassess', exact: true }))
      .not.toBeInTheDocument()
  }
)

it('shows an automatic retry instead of a failure while GitHub requests are paused', async () => {
  state.state = 'QUEUED'
  state.failureReason = 'GITHUB_RATE_LIMITED'
  state.noReport = true
  state.unpinned = true
  state.retryAt = '2026-10-17T15:00:00.000Z'
  await mount()
  await expect
    .element(
      page.getByText('Waiting to retry GitHub requests', { exact: true })
    )
    .toBeVisible()
  await expect
    .element(page.getByText('Retry scheduled for', { exact: false }))
    .toBeVisible()
  await expect
    .element(page.getByRole('alert', { name: 'Assessment failure' }))
    .not.toBeInTheDocument()
})

for (const pendingState of ['RUNNING', 'FAILED']) {
  it(`keeps completed Health findings visible when the next assessment is ${pendingState}`, async () => {
    state.latestAttempt = {
      id: '22222222-2222-4222-8222-222222222222',
      branch: 'development',
      state: pendingState,
      reason: pendingState === 'FAILED' ? 'SCANNER_UNAVAILABLE' : null,
      retryAt: null,
    }
    await mount()
    await expect
      .element(
        page.getByText(
          pendingState === 'FAILED' ? 'Update failed' : 'Updating',
          { exact: true }
        )
      )
      .toBeVisible()
    await expect
      .element(page.getByText('Retained findings in the analyzed scope'))
      .toBeVisible()
    await expect
      .element(page.getByRole('button', { name: 'Reassess', exact: true }))
      [pendingState === 'FAILED' ? 'toBeEnabled' : 'toBeDisabled']()
  })
}
