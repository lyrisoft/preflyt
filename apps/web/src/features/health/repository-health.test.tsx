import type { ReactNode, AnchorHTMLAttributes } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { HealthCoverageDetails } from './health-coverage-details'
import { RepositoryHealth } from './repository-health'

const state = vi.hoisted(() => ({
  latestAttempt: null as null | {
    id: string
    branch: string
    state: string
    reason: string | null
    retryAt: string | null
    scanner?: 'strix'
  },
  aiAvailable: false,
  aiAnalysis: false,
  aiPreference: false,
  omitAiConfirmation: false,
  aiReview: null as Record<string, unknown> | null,
  mode: 'EXECUTED',
  state: 'COMPLETED',
  progress: 'SCANNING',
  failureReason: null as string | null,
  noReport: false,
  unpinned: false,
  category: null as 'coverage' | null,
  categoryResults: null as Record<
    string,
    {
      assessmentId: string
      assessmentIds?: string[]
      aiFindings?: number
      standardFindings?: number
      finishedAt: string
      value: string
    } | null
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
  findingsFail: false,
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
    ...(state.aiAnalysis
      ? [
          {
            id: 'security.strix',
            title: 'Strix security review',
            state: 'UNAVAILABLE',
            reason: 'STRIX_RUNNING',
            scope: 'Source-only AI security review.',
          },
        ]
      : []),
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
  state.aiAnalysis = false
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
  state.findingsFail = false
  state.manyHistory = false
  state.scanning = true
  state.readinessReason = 'READY'
  state.readinessFailure = false
  state.platformAdmin = false
  state.aiAvailable = false
  state.aiPreference = false
  state.omitAiConfirmation = false
  state.aiReview = null
  state.fetch.mockReset()
  state.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (/\/health\/[^/]+\/findings\?/.test(url)) {
        if (state.findingsFail)
          return Response.json(
            { message: 'Findings unavailable' },
            { status: 503 }
          )
        const params = new URL(url, 'http://localhost').searchParams
        const selectedPage = Number(params.get('page') ?? 1)
        const size = Number(params.get('pageSize') ?? 10)
        const q = (params.get('q') ?? '').toLowerCase()
        const severity = params.get('severity') ?? 'all'
        const aiId = state.categoryResults?.security?.assessmentIds?.find(
          (value) => value !== id
        )
        const aiRows =
          aiId && params.get('reports')?.split(',').includes(aiId)
            ? [
                {
                  ...report().findings[0],
                  fingerprint: 'e'.repeat(64),
                  assessmentId: aiId,
                  assessedAt: '2026-10-12T10:00:00Z',
                  evidence: 'AI_REPORTED',
                  title: 'AI payment issue',
                },
              ]
            : []
        const available = [...report().findings, ...aiRows]
        const matching = available.filter(
          (f) =>
            (severity === 'all' || f.severity === severity) &&
            `${f.title} ${f.path} ${f.ruleId}`.toLowerCase().includes(q)
        )
        return Response.json({
          assessmentId: id,
          sourceSha: sha,
          rows: matching.slice((selectedPage - 1) * size, selectedPage * size),
          total: matching.length,
          unfilteredTotal: available.length,
          page: selectedPage,
          pageSize: size,
        })
      }
      if (url.includes('/health/strix'))
        return Response.json({
          available: state.aiAvailable,
          reason: state.aiAvailable
            ? 'AI review ready.'
            : 'Connect a tested AI model.',
        })
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
        return new Response(
          JSON.stringify({
            ...row(),
            state: 'QUEUED',
            ...(state.omitAiConfirmation
              ? {}
              : {
                  includeAiSecurity:
                    JSON.parse(String(init.body)).includeAiSecurity === true,
                  aiReviewId: JSON.parse(String(init.body)).includeAiSecurity
                    ? 'ai-queued'
                    : null,
                }),
          }),
          {
            status: 201,
          }
        )
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
          assessment: {
            ...row(),
            report: state.noReport
              ? null
              : {
                  ...report(),
                  findings: [],
                  findingSummary: {
                    total: report().findings.length,
                    unsuppressed: report().findings.length,
                    analyzerHigh: report().findings.filter(
                      (f) => f.severity === 'high'
                    ).length,
                    groups: report().findings.reduce<
                      Array<{
                        category: string
                        checkId: string
                        count: number
                      }>
                    >((groups, f) => {
                      const group = groups.find(
                        (g) =>
                          g.category === f.category && g.checkId === f.checkId
                      )
                      if (group) group.count++
                      else
                        groups.push({
                          category: f.category,
                          checkId: f.checkId,
                          count: 1,
                        })
                      return groups
                    }, []),
                  },
                },
          },
          latestAttempt: state.latestAttempt,
          assessmentOptions: { includeAiSecurity: state.aiPreference },
          strixReview: state.aiReview,
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
    .element(chart.getByText('Findings over time', { exact: true }))
    .toBeVisible()
  await expect
    .element(chart.getByRole('group', { name: /All findings over/ }))
    .toHaveAttribute(
      'aria-label',
      'All findings over 2 scans. Finding counts: 4, 1. Select a column to open its assessment.'
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
  await chart
    .getByRole('button', { name: /Open scan.*commit ddddddd/ })
    .first()
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
    .element(chart.getByText('No recorded results to chart', { exact: true }))
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
      .element(page.getByRole('link', { name: 'View security findings' }))
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
    .element(page.getByRole('link', { name: 'View security findings' }))
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
    .element(page.getByRole('link', { name: 'View security findings' }))
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
  await page.getByText('Assessment details', { exact: true }).click()
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

it('requests each findings page from the server instead of downloading the recorded list', async () => {
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
  expect(
    state.fetch.mock.calls.some(([url]) =>
      String(url).includes('/findings?page=2&pageSize=10')
    )
  ).toBe(true)
  await findings
    .getByRole('textbox', { name: 'Search health findings' })
    .fill('Unsafe SQL')
  await expect.element(findings.getByText('1–1 of 1')).toBeVisible()
  await expect
    .element(findings.getByText('Unsafe SQL expression'))
    .toBeVisible()
  expect(
    state.fetch.mock.calls.some(([url]) =>
      String(url).includes('/findings?page=1&pageSize=10&q=Unsafe+SQL')
    )
  ).toBe(true)
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

it('shows a findings request error with retry instead of presenting it as no findings', async () => {
  state.findingsFail = true
  await mount()
  const findings = page.getByLabelText('Repository findings')
  await expect
    .element(findings.getByRole('alert'))
    .toHaveTextContent('Findings unavailable')
  await expect
    .element(findings.getByText('Unsafe SQL expression'))
    .not.toBeInTheDocument()
  state.findingsFail = false
  await findings.getByRole('button', { name: 'Retry loading findings' }).click()
  await expect
    .element(findings.getByText('Unsafe SQL expression'))
    .toBeVisible()
  await expect.element(findings.getByText('1–1 of 1')).toBeVisible()
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
  await page.getByText('Assessment details', { exact: true }).click()
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
    const reassess = expect.element(
      page.getByRole('button', { name: 'Reassess', exact: true })
    )
    if (pendingState === 'FAILED') await reassess.toBeEnabled()
    else await reassess.toBeDisabled()
  })
}

it('queues standard and optional AI security checks with one Reassess action', async () => {
  state.aiAvailable = true
  await mount()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeEnabled()
  await page
    .getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    .click()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  const body = JSON.parse(
    state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body
  )
  expect(body).toMatchObject({ branch: 'development', includeAiSecurity: true })
  expect(body.scanner).toBeUndefined()
  await expect
    .element(page.getByRole('button', { name: 'Run VAPT assessment' }))
    .not.toBeInTheDocument()
})
it('centers the stationary sparkle inside the AI review loading ring', async () => {
  state.aiReview = {
    ...row(),
    id: 'ai-running',
    state: 'RUNNING',
    reason: null,
    report: null,
  }
  await mount()
  await expect
    .element(page.getByText('AI security review: Running'))
    .toBeVisible()
  const banner = document.querySelector('[aria-label="Strix review status"]')!
  const ring = banner.querySelector('[data-slot="ai-loading-ring"]')!
  const sparkle = banner.querySelector('.lucide-sparkles')!
  const ringRect = ring.getBoundingClientRect()
  const sparkleRect = sparkle.getBoundingClientRect()
  expect(
    Math.abs(
      (ringRect.left + ringRect.right) / 2 -
        (sparkleRect.left + sparkleRect.right) / 2
    )
  ).toBeLessThan(1)
  expect(
    Math.abs(
      (ringRect.top + ringRect.bottom) / 2 -
        (sparkleRect.top + sparkleRect.bottom) / 2
    )
  ).toBeLessThan(1)
  expect(getComputedStyle(sparkle).animationName).toBe('none')
  expect(ringRect.width).toBeGreaterThan(sparkleRect.width)
  expect(getComputedStyle(ring).animationName).not.toBe('none')
})
it('keeps Reassess usable without an AI model and explains a skipped review', async () => {
  state.aiPreference = true
  state.aiReview = {
    ...row(),
    id: 'ai-skipped',
    state: 'SKIPPED',
    reason: 'AI_SECURITY_UNAVAILABLE',
    report: null,
  }
  await mount()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeDisabled()
  await expect
    .element(page.getByText('AI security review: Skipped'))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Reassess', exact: true }))
    .toBeEnabled()
  await page.getByRole('button', { name: 'Assessment options' }).click()
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
    ).includeAiSecurity
  ).toBe(true)
})
it('loads the repository AI preference without starting another request', async () => {
  state.aiAvailable = true
  state.aiPreference = true
  await mount()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeChecked()
  expect(
    state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
  ).toBe(false)
})

it('keeps the split assessment action compact in both themes and at 320px', async () => {
  state.aiAvailable = true
  state.aiPreference = true
  await mount()
  for (const width of [1280, 320]) {
    await page.viewport(width, 800)
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      const options = page.getByRole('button', { name: 'Assessment options' })
      const primary = page.getByRole('button', {
        name: 'Reassess',
        exact: true,
      })
      await expect.element(primary).toBeVisible()
      const mainRect = primary.element().getBoundingClientRect()
      const arrowRect = options.element().getBoundingClientRect()
      expect(Math.abs(mainRect.right - arrowRect.left)).toBeLessThan(1)
      expect(mainRect.height).toBe(arrowRect.height)
      await options.click()
      await expect
        .element(
          page.getByRole('menuitemcheckbox', {
            name: 'Include AI security review',
          })
        )
        .toBeChecked()
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await new Promise((resolve) => setTimeout(resolve, 300))
      await page.screenshot({
        path: `__screenshots__/preflyt-health-split-${width}-${dark ? 'dark' : 'light'}.png`,
      })
      await userEvent.keyboard('{Escape}')
      await expect
        .element(
          page.getByRole('menuitemcheckbox', {
            name: 'Include AI security review',
          })
        )
        .not.toBeInTheDocument()
    }
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

it('keeps AI selected when Reassess is clicked directly while its options menu is open', async () => {
  state.aiAvailable = true
  await mount()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeEnabled()
  await page
    .getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    .click()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  const body = JSON.parse(
    state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body
  )
  expect(body.includeAiSecurity).toBe(true)
})

it('shows an error when an AI-selected request is acknowledged as standard checks only', async () => {
  state.aiAvailable = true
  state.omitAiConfirmation = true
  await mount()
  await page.getByRole('button', { name: 'Assessment options' }).click()
  await expect
    .element(
      page.getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    )
    .toBeEnabled()
  await page
    .getByRole('menuitemcheckbox', { name: 'Include AI security review' })
    .click()
  await page.getByRole('button', { name: 'Reassess', exact: true }).click()
  await expect
    .element(
      page.getByText(
        /The server did not confirm the requested AI security review/
      )
    )
    .toBeVisible()
  expect(
    state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
  ).toHaveLength(1)
})

it('shows the active standalone AI review instead of the previous cancelled review', async () => {
  state.aiReview = { ...row(), id: 'old-ai', state: 'CANCELLED', report: null }
  state.latestAttempt = {
    id: 'new-ai',
    branch: 'development',
    scanner: 'strix',
    state: 'QUEUED',
    reason: null,
    retryAt: null,
  }
  await mount()
  await expect
    .element(page.getByText('AI security review: Queued'))
    .toBeVisible()
  await expect
    .element(page.getByText('AI security review: Cancelled'))
    .not.toBeInTheDocument()
  const button = page.getByRole('button', {
    name: 'AI review queued…',
    exact: true,
  })
  await expect.element(button).toBeDisabled()
  const ring = button.element().querySelector('[data-slot="ai-loading-ring"]')!
  expect(getComputedStyle(ring).animationName).not.toBe('none')
})
it('runs VAPT from the AI analysis card instead of standard security checks', async () => {
  state.aiAnalysis = true
  await mount()
  await page.getByText('Assessment details', { exact: true }).click()
  await page.getByText('Strix security review', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Run AI security review', exact: true })
    .click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
          .length
    )
    .toBe(1)
  const body = JSON.parse(
    state.fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body
  )
  expect(body).toMatchObject({ branch: 'development', scanner: 'strix' })
  expect(body.category).toBeUndefined()
})
it('shows a running AI analysis with a spinning button instead of Not run', async () => {
  state.aiAnalysis = true
  state.aiReview = { ...row(), id: 'active-ai', state: 'RUNNING', report: null }
  await mount()
  await page.getByText('Assessment details', { exact: true }).click()
  await page.getByText('Strix security review', { exact: true }).click()
  const button = page
    .getByRole('button', { name: 'Reviewing security…', exact: true })
    .last()
  await expect.element(button).toBeDisabled()
  expect(
    getComputedStyle(
      button.element().querySelector('[data-slot="ai-loading-ring"]')!
    ).animationName
  ).not.toBe('none')
  const card = button.element().closest('details')!
  expect(card.textContent).toContain('Running')
  expect(card.textContent).not.toContain('Not run')
  expect(card.textContent).not.toContain('Report completed')
})

it('keeps a valid freshness badge steady and hides checking text during background refresh', async () => {
  const respond = state.fetch.getMockImplementation()!
  let refreshing = false
  let release!: (value: Response) => void
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  state.fetch.mockImplementation((url, init) =>
    String(url).includes('/health/freshness?')
      ? refreshing
        ? pending
        : Promise.resolve(
            Response.json({
              assessmentId: id,
              sourceSha: sha,
              branch: 'development',
              freshness: 'CURRENT',
              checkedAt: new Date().toISOString(),
            })
          )
      : respond(url, init)
  )
  const view = await mount('development')
  await expect.element(page.getByText('Current', { exact: true })).toBeVisible()
  refreshing = true
  await page
    .getByRole('button', { name: 'Refresh health report', exact: true })
    .click()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(([url]) =>
          String(url).includes('/health/freshness?')
        ).length
    )
    .toBe(2)
  await expect.element(page.getByText('Current', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('Checking freshness…', { exact: true }))
    .not.toBeInTheDocument()
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
  await view.unmount()
})

it('combines scanner and AI findings into one Security card and exact saved-report link', async () => {
  const aiId = '22222222-2222-4222-8222-222222222222'
  state.categoryResults = {
    security: {
      assessmentId: id,
      assessmentIds: [id, aiId],
      standardFindings: 230,
      aiFindings: 1,
      value: '231',
      finishedAt: '2026-10-14T06:30:00Z',
    },
  }
  state.aiReview = {
    id: aiId,
    state: 'COMPLETED',
    sourceSha: sha,
    report: report(),
  }
  await mount()
  await expect.element(page.getByLabelText('Security: 231')).toBeVisible()
  await expect
    .element(page.getByText('230 scanner findings · 1 AI finding to review'))
    .not.toBeInTheDocument()
  const link = page.getByRole('link', { name: 'View security findings' })
  await expect
    .element(link)
    .toHaveAttribute(
      'href',
      expect.stringContaining(
        'healthReports=' + encodeURIComponent(id + ',' + aiId)
      )
    )
  await expect
    .element(link)
    .toHaveAttribute('href', expect.stringContaining('source=health'))
  await expect
    .element(page.getByText('AI security review: Completed'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('link', { name: 'View AI security findings' }))
    .not.toBeInTheDocument()
})

it('keeps running AI review status inside Security without overflow in either theme', async () => {
  state.aiReview = {
    ...row(),
    id: 'ai-running',
    state: 'RUNNING',
    reason: null,
    report: null,
  }
  await mount()
  for (const width of [1280, 320]) {
    await page.viewport(width, 900)
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      const status = document.querySelector(
        '[aria-label="Strix review status"]'
      )!
      expect(
        status
          .closest('[data-slot="card"]')
          ?.querySelector('[aria-label="Security: 1"]')
      ).not.toBeNull()
      expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `__screenshots__/preflyt-combined-security-${width}-${dark ? 'dark' : 'light'}.png`,
      })
    }
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

it('includes the AI issue in the repository findings count, filter results and exact report link', async () => {
  const aiId = '33333333-3333-4333-8333-333333333333'
  state.categoryResults = {
    security: {
      assessmentId: id,
      assessmentIds: [id, aiId],
      standardFindings: report().findings.length,
      aiFindings: 1,
      finishedAt: '2026-10-12T10:00:00Z',
      value: String(report().findings.length + 1),
    },
  }
  await mount()
  await expect
    .element(
      page.getByRole('tab', {
        name: `Findings (${report().findings.length + 1})`,
        exact: true,
      })
    )
    .toBeVisible()
  await page
    .getByRole('textbox', { name: 'Search health findings' })
    .fill('AI payment')
  const link = page.getByRole('link', { name: 'AI payment issue', exact: true })
  await expect.element(link).toBeVisible()
  await expect
    .element(link)
    .toHaveAttribute('href', expect.stringContaining(`health=${aiId}`))
  await expect
    .element(page.getByText('Needs review', { exact: true }).first())
    .toBeVisible()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(
        ([url]) =>
          String(url).includes('reports=') &&
          decodeURIComponent(String(url)).includes(aiId)
      )
    )
    .toBe(true)
})

it('prioritizes one Findings table and keeps supporting evidence behind Assessment details', async () => {
  const view = await mount()
  const details = page.getByLabelText('Assessment details', { exact: true })
  await expect.element(page.getByLabelText('Repository findings')).toBeVisible()
  await expect
    .element(page.getByLabelText('Analysis coverage'))
    .not.toBeVisible()
  expect(details.element().hasAttribute('open')).toBe(false)
  await page.getByText('Assessment details', { exact: true }).click()
  await expect.element(page.getByLabelText('Analysis coverage')).toBeVisible()
  await expect.element(page.getByLabelText('Repository findings')).toBeVisible()
  await page.getByText('Assessment details', { exact: true }).click()
  await expect
    .element(page.getByLabelText('Analysis coverage'))
    .not.toBeVisible()
  await expect.element(page.getByLabelText('Repository findings')).toBeVisible()
  await view.unmount()
})
