import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { GatePreview } from './engineering-queries'
import {
  AssessmentReport as RepositoryAssessments,
  AssessmentList,
} from './repository-assessments'

const state = vi.hoisted(() => ({
  detail: {
    data: {} as ReturnType<typeof assessmentFixture>,
    isError: false,
    isPending: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  preview: {
    data: {} as GatePreview,
    isError: false,
    isPending: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  history: {
    data: {
      assessments: [] as { id: string; sourceSha: string; createdAt: string }[],
    },
    isError: false,
    isPending: false,
    error: null as Error | null,
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'gate-preview' ? state.preview : state.detail,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({}),
}))
vi.mock('./repository-queries', () => ({
  useAssessmentList: () => state.history,
  useStandards: vi.fn(),
  useCiEvidence: vi.fn(),
}))
vi.mock('../intelligence/skill-review-panel', () => ({
  SkillReviewPanel: () => <div>AI review content</div>,
}))
vi.mock('./assessment-context', () => ({
  AssessmentContext: () => <div>Assessment context</div>,
}))
vi.mock('./native-execution-status', () => ({
  NativeExecutionStatus: () => <div>Execution details</div>,
}))
vi.mock('./assessment-coverage-chart', () => ({
  AssessmentCoverageChart: ({
    onSelect,
  }: {
    onSelect: (value: string) => void
  }) => (
    <button onClick={() => onSelect('missing')}>View missing inputs</button>
  ),
}))
beforeEach(() => {
  state.history = {
    data: {
      assessments: [
        {
          id: 'report',
          sourceSha: 'a'.repeat(40),
          createdAt: '2026-10-10T00:00:00Z',
        },
      ],
    },
    isError: false,
    isPending: false,
    error: null,
  }
  state.preview = {
    isError: false,
    isPending: false,
    error: null,
    refetch: vi.fn(),
    data: {
      sourceSha: 'a'.repeat(40),
      status: 'INCOMPLETE',
      evaluatorVersion: 2,
      evaluationHash: 'hash',
      requiredRules: 12,
      requiredRulesSatisfied: 0,
      requiredRulesBlocked: 0,
      requiredRulesIncomplete: 12,
      advisoryFailed: 0,
      advisoryIncomplete: 0,
      reasons: [],
      rules: Array.from({ length: 12 }, (_, i) => ({
        ruleId: `rule-${i}`,
        title: `Check ${i + 1}`,
        required: true,
        status: 'INCOMPLETE',
        reasons: ['TRUSTED_EXECUTION_NOT_ESTABLISHED'],
        deliveryId: null,
      })),
    },
  }

  state.detail = {
    data: assessmentFixture(),
    isError: false,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }
})
function assessmentFixture() {
  return {
    id: 'report',
    sourceSha: 'a'.repeat(40),
    assessmentHash: 'digest',
    selectionId: 'selection',
    request: { subjectKind: 'REPOSITORY', selectionRevision: 1 },
    plan: { adoptionProfile: 'RECOMMENDED', packs: [] },
    report: {
      coverage: 'INCOMPLETE',
      collectedAt: '2026-10-10T00:00:00Z',
      requiredChecks: 12,
      trustedExecutedChecks: 0,
      collectionTruncated: false,
      observations: [],
      checks: Array.from({ length: 12 }, (_, i) => ({
        ruleId: `rule-${i}`,
        title: `Check ${i + 1}`,
        coverage: 'INCOMPLETE',
        required: true,
        deliveryId: null as string | null,
        providerResult: null as 'SUCCEEDED' | 'FAILED' | null,
        freshness: 'FRESH_AT_COLLECTION',
        mappingTrust: 'APPROVED_SOURCE_BINDING',
        reason: 'Missing inputs',
      })),
    },
  }
}
it('opens check results, paginates them and reveals optional sections only on request', async () => {
  const view = await render(
    <RepositoryAssessments
      repositoryId='123'
      initialSha=''
      initialAssessmentId='report'
      canCreate={false}
    />
  )
  await expect.element(page.getByText('Merge review result')).toBeVisible()
  await expect.element(page.getByText('Check 1', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('Check 6', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('AI review content'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Assessment context'))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect.element(page.getByText('Check 6', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'AI reviews', exact: true }).click()
  await expect.element(page.getByText('AI review content')).toBeVisible()
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await page.getByText('Evidence coverage', { exact: true }).click()
  await page.getByRole('button', { name: 'View missing inputs' }).click()
  await expect
    .element(page.getByRole('tab', { name: 'Checks (12)' }))
    .toHaveAttribute('aria-selected', 'true')
  await expect.element(page.getByText('Check 1', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Details', exact: true }).click()
  await expect.element(page.getByText('Assessment context')).toBeVisible()
  await view.unmount()
})
it('hides cached assessment details after access failure', async () => {
  state.detail = {
    ...state.detail,
    isError: true,
    error: new Error('Access changed'),
  }
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Access changed')
  await expect
    .element(page.getByText('Merge review result'))
    .not.toBeInTheDocument()
  await view.unmount()
})
it('keeps tabs and check results within a narrow viewport in both themes', async () => {
  await page.viewport(320, 900)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await render(
      <div className='p-4'>
        <RepositoryAssessments
          repositoryId='123'
          initialSha=''
          canCreate={false}
        />
      </div>
    )
    await expect
      .element(page.getByRole('tab', { name: 'Checks (12)' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})

async function chooseChecks(name: string) {
  await page.getByRole('combobox', { name: 'Checks to show' }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

it('prioritizes required failures and keeps passing and optional checks available on request', async () => {
  state.preview.data.rules[0].status = 'PASS'
  state.preview.data.rules[0].reasons = []
  state.detail.data.report.checks[1].required = false
  state.preview.data.rules[1].required = false
  state.preview.data.rules[11].status = 'BLOCK'
  state.preview.data.rules[11].reasons = ['APPROVED_CI_SOURCE_FAILED']
  Object.assign(state.preview.data, {
    status: 'BLOCK',
    requiredRules: 11,
    requiredRulesSatisfied: 1,
    requiredRulesBlocked: 1,
    requiredRulesIncomplete: 9,
  })
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByText('Required checks failed'))
    .toHaveClass('text-danger-text')
  expect(view.container.querySelector('li button')?.textContent).toContain(
    'Check 12'
  )
  await expect
    .element(page.getByText('Check 1', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Check 2', { exact: true }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: /Check 12/ }).click()
  await expect
    .element(page.getByRole('link', { name: 'View CI activity' }))
    .toHaveAttribute('href', '/repositories/123?tab=activity')
  await chooseChecks('Passing checks')
  await expect.element(page.getByText('Check 1', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('Passed', { exact: true }))
    .toHaveClass('text-success-text')
  await chooseChecks('Optional checks')
  await expect.element(page.getByText('Check 2', { exact: true })).toBeVisible()
  await view.unmount()
})

it('does not promote successful CI or configuration evidence into a passing requirement', async () => {
  state.detail.data.report.checks[0].coverage = 'CONFIGURATION_OBSERVED'
  state.detail.data.report.checks[0].providerResult = 'SUCCEEDED'
  state.detail.data.report.checks[0].deliveryId = 'delivery'
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect.element(page.getByText('Check 1', { exact: true })).toBeVisible()
  await expect
    .element(page.getByText('Required results incomplete'))
    .toHaveClass('text-warning-text')
  await expect
    .element(page.getByText('Passed', { exact: true }))
    .not.toBeInTheDocument()
  await chooseChecks('Passing checks')
  await expect
    .element(page.getByText('No checks match this filter.'))
    .toBeVisible()
  await view.unmount()
})

it('shows an actionable pass state without repeating passing checks', async () => {
  state.preview.data.rules.forEach((rule) => {
    rule.status = 'PASS'
    rule.reasons = []
  })
  Object.assign(state.preview.data, {
    status: 'PASS',
    requiredRulesSatisfied: 12,
    requiredRulesIncomplete: 0,
  })
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByText('Required checks passed', { exact: true }))
    .toHaveClass('text-success-text')
  await expect
    .element(page.getByText('Check 1', { exact: true }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'View all checks' }).click()
  await expect.element(page.getByText('Check 1', { exact: true })).toBeVisible()
  await expect
    .element(
      page.getByText('GitHub decides whether merging is allowed.', {
        exact: false,
      })
    )
    .toBeVisible()
  await view.unmount()
})

it('does not render a cached pass after a merge evaluation failure and offers retry', async () => {
  state.preview.data.status = 'PASS'
  state.preview.isError = true
  state.preview.error = new Error('Repository access changed')
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access changed')
  await expect
    .element(page.getByText('Required checks passed', { exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Not evaluated').first())
    .toHaveClass('text-warning-text')
  await page.getByRole('button', { name: 'Retry result' }).click()
  expect(state.preview.refetch).toHaveBeenCalledOnce()
  await view.unmount()
})

it('hides cached reports when history access fails', async () => {
  state.history.isError = true
  state.history.error = new Error('History access changed')
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={true} />
  )
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('History access changed')
  await expect
    .element(page.getByText('Merge review result'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'New assessment' }))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('keeps commit mismatch and collection warnings visible and respects creation permission', async () => {
  state.detail.data.report.collectionTruncated = true
  for (const canCreate of [false, true]) {
    const view = await render(
      <RepositoryAssessments
        repositoryId='123'
        initialSha={'b'.repeat(40)}
        canCreate={canCreate}
      />
    )
    await expect
      .element(
        page.getByText('This assessment is for a different commit', {
          exact: false,
        })
      )
      .toBeVisible()
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('CI collection hit its 100-result limit')
    if (canCreate)
      await expect
        .element(page.getByRole('button', { name: 'Assess inspected commit' }))
        .toBeVisible()
    else
      await expect
        .element(page.getByRole('button', { name: 'Assess inspected commit' }))
        .not.toBeInTheDocument()
    await view.unmount()
  }
})

it('gives an empty read-only report list one clear next step', async () => {
  state.history.data.assessments = []
  const view = await render(
    <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect.element(page.getByText('No saved assessments yet')).toBeVisible()
  await expect
    .element(page.getByText('Ask a repository administrator', { exact: false }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Create assessment' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('Merge review result'))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('distinguishes loading from incomplete results', async () => {
  state.detail.isPending = true
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByRole('status'))
    .toHaveTextContent('Loading assessment…')
  await expect
    .element(page.getByText('Required results incomplete'))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('routes optional warnings to the optional checks using the result action', async () => {
  for (let i = 0; i < 11; i++) {
    state.preview.data.rules[i].status = 'PASS'
    state.preview.data.rules[i].reasons = []
  }
  state.preview.data.rules[11].required = false
  state.detail.data.report.checks[11].required = false
  Object.assign(state.preview.data, {
    status: 'WARN',
    requiredRules: 11,
    requiredRulesSatisfied: 11,
    requiredRulesIncomplete: 0,
    advisoryIncomplete: 1,
  })
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  await page.getByRole('button', { name: 'Review optional checks' }).click()
  await expect
    .element(page.getByText('Check 12', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('heading', { name: 'Optional checks' }))
    .toBeVisible()
  await view.unmount()
})

it('renders readable result hierarchy in light, dark and mobile layouts', async () => {
  state.detail.data.report.checks = state.detail.data.report.checks.slice(0, 3)
  state.preview.data.rules = state.preview.data.rules.slice(0, 3)
  state.preview.data.rules[2].status = 'BLOCK'
  state.preview.data.rules[2].reasons = ['APPROVED_CI_SOURCE_FAILED']
  state.preview.data.rules[0].status = 'PASS'
  state.preview.data.rules[0].reasons = []
  Object.assign(state.preview.data, {
    status: 'BLOCK',
    requiredRules: 3,
    requiredRulesSatisfied: 1,
    requiredRulesBlocked: 1,
    requiredRulesIncomplete: 1,
  })
  state.detail.data.report.checks[2].title = 'Required test execution'
  state.detail.data.report.checks[1].title = 'Dependency vulnerability scan'
  for (const [theme, width] of [
    ['light', 1280],
    ['dark', 1280],
    ['dark', 320],
  ] as const) {
    await page.viewport(width, 1000)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await render(
      <div className='mx-auto max-w-5xl p-4'>
        <RepositoryAssessments
          repositoryId='123'
          initialSha=''
          canCreate={false}
        />
      </div>
    )
    await expect.element(page.getByText('Required checks failed')).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
    await page.screenshot({
      path: `__screenshots__/readable-report-${theme}-${width}.png`,
    })
    if (width === 320) {
      await page
        .getByRole('button', { name: /Required test execution/ })
        .click()
      const firstCheck = view.container.querySelector('li')!
      const actionText = [...firstCheck.querySelectorAll('p')].find((p) =>
        p.textContent?.startsWith('Review the failed CI result')
      )!
      expect(actionText.getBoundingClientRect().width).toBeGreaterThan(150)
      await page.screenshot({
        element: firstCheck,
        path: '__screenshots__/readable-report-mobile-check.png',
      })
    }
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})

it('keeps repeated instructions collapsed and opens one check at a time with the keyboard', async () => {
  state.preview.data.rules[0].reasons = ['CI_OBSERVATION_MISSING']
  const view = await render(
    <RepositoryAssessments repositoryId='123' initialSha='' canCreate={false} />
  )
  const first = page.getByRole('button', { name: /Check 1 Required/ })
  await expect.element(first).toHaveAttribute('aria-expanded', 'false')
  await expect
    .element(page.getByText('No CI result was collected for this check.'))
    .toBeVisible()
  await expect
    .element(page.getByText('Next step', { exact: true }))
    .not.toBeInTheDocument()
  await first.click()
  await expect.element(first).toHaveAttribute('aria-expanded', 'true')
  await expect
    .element(page.getByText('Saved evidence', { exact: true }))
    .toBeVisible()
  await page.getByRole('button', { name: /Check 2 Required/ }).click()
  await expect.element(first).toHaveAttribute('aria-expanded', 'false')
  await expect
    .element(page.getByText('Saved evidence', { exact: true }))
    .toBeVisible()
  const second = page
    .getByRole('button', { name: /Check 2 Required/ })
    .element()
  second.focus()
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByText('Saved evidence', { exact: true }))
    .not.toBeInTheDocument()
  await view.unmount()
})

it('keeps a populated incomplete report compact in both themes', async () => {
  state.detail.data.report.checks = state.detail.data.report.checks.slice(0, 9)
  state.preview.data.rules = state.preview.data.rules.slice(0, 9)
  Object.assign(state.preview.data, {
    requiredRules: 9,
    requiredRulesIncomplete: 9,
  })
  const titles = [
    'Build validation',
    'CI configuration',
    'Dependency lockfiles',
    'Lint validation',
    'Secret scanning',
    'Type checking',
    'Required test execution',
    'Static application security',
    'Dependency vulnerability scan',
  ]
  state.detail.data.report.checks.forEach((check, i) => {
    check.title = titles[i]
    state.preview.data.rules[i].reasons = [
      i === 1 || i === 2
        ? 'PROFILE_NOT_COMPLETE_AT_REVISION'
        : 'CI_OBSERVATION_MISSING',
    ]
  })
  for (const theme of ['light', 'dark']) {
    await page.viewport(1280, 900)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await render(
      <div className='mx-auto max-w-5xl p-4'>
        <RepositoryAssessments
          repositoryId='123'
          initialSha=''
          canCreate={false}
        />
      </div>
    )
    await expect
      .element(page.getByText('Required results incomplete'))
      .toBeVisible()
    const rows = view.container.querySelectorAll('li')
    expect(rows.length).toBe(5)
    for (const row of rows)
      expect(row.getBoundingClientRect().height).toBeLessThan(105)
    await page.screenshot({
      path: `__screenshots__/readable-populated-report-${theme}.png`,
    })
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})

it('shows a bounded assessment list and links to a separate report instead of opening one automatically', async () => {
  state.history.data.assessments = Array.from({ length: 7 }, (_, i) => ({
    id: `report-${i + 1}`,
    sourceSha: 'a'.repeat(40),
    createdAt: '2026-10-10T00:00:00Z',
  }))
  const view = await render(
    <AssessmentList
      repositoryId='123'
      initialSha=''
      canCreate={false}
      reportOrigin='quality-gates'
    />
  )
  await expect
    .element(page.getByRole('heading', { name: 'Saved assessments' }))
    .toBeVisible()
  expect(view.container.querySelectorAll('li a')).toHaveLength(5)
  await expect
    .element(
      page.getByRole('link', { name: /Open assessment for commit/ }).first()
    )
    .toHaveAttribute(
      'href',
      '/assessments?repository=123&assessment=report-1&from=quality-gates'
    )
  await expect
    .element(page.getByText('Required checks needing attention'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('tab', { name: 'AI reviews' }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Next assessments' }).click()
  expect(view.container.querySelectorAll('li a')).toHaveLength(2)
  await expect
    .element(
      page.getByRole('link', { name: /Open assessment for commit/ }).first()
    )
    .toHaveAttribute(
      'href',
      '/assessments?repository=123&assessment=report-6&from=quality-gates'
    )
  await view.unmount()
})

it('does not show cached list results after a result or repository access failure', async () => {
  state.preview.data.status = 'PASS'
  state.preview.isError = true
  const view = await render(
    <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByText('Result unavailable'))
    .toHaveClass('text-warning-text')
  await expect
    .element(page.getByText('Required checks passed'))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByLabelText('Evaluated checks unavailable'))
    .toHaveTextContent('—')
  await expect
    .element(page.getByLabelText('Passed checks unavailable'))
    .toHaveTextContent('—')
  await view.unmount()
  state.history.isError = true
  state.history.error = new Error('Repository access changed')
  const denied = await render(
    <AssessmentList repositoryId='123' initialSha='' canCreate={true} />
  )
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access changed')
  await expect
    .element(page.getByRole('link', { name: /Open assessment for commit/ }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'New assessment' }))
    .not.toBeInTheDocument()
  await denied.unmount()
})

it('keeps the list usable on mobile in light and dark themes', async () => {
  await page.viewport(320, 900)
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await render(
      <div className='p-4'>
        <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
      </div>
    )
    await expect
      .element(page.getByRole('link', { name: /Open assessment for commit/ }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      path: `__screenshots__/assessment-list-mobile-${theme}.png`,
    })
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 720)
})

it('shows evaluated checks separately from incomplete evidence, including optional checks', async () => {
  state.preview.data.rules = [
    'PASS',
    'BLOCK',
    'INCOMPLETE',
    'PASS',
    'INCOMPLETE',
    'UNKNOWN',
  ].map((status, i) => ({
    ruleId: `rule-${i}`,
    title: `Check ${i + 1}`,
    required: i < 3,
    status,
    reasons: [],
    deliveryId: null,
  }))
  const view = await render(
    <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
  )
  await expect
    .element(page.getByLabelText('3 of 6 checks evaluated', { exact: true }))
    .toHaveTextContent('3 / 6')
  await expect
    .element(page.getByLabelText('2 checks passed'))
    .toHaveTextContent('2')
  await expect
    .element(page.getByLabelText('1 check failed', { exact: true }))
    .toHaveTextContent('1')
  await expect
    .element(page.getByLabelText('3 checks incomplete'))
    .toHaveTextContent('3')
  await page.getByRole('button', { name: 'Help for Saved assessments' }).click()
  await expect
    .element(
      page.getByText(/Evaluated shows checks with a passed or failed result/)
    )
    .toBeVisible()
  await view.unmount()
})

it('shows unavailable counts for a different commit or unsupported saved format', async () => {
  for (const invalid of ['commit', 'format', 'loading']) {
    state.preview.data.sourceSha =
      invalid === 'commit' ? 'b'.repeat(40) : 'a'.repeat(40)
    state.preview.data.reasons =
      invalid === 'format' ? ['SNAPSHOT_SCHEMA_UNSUPPORTED'] : []
    state.preview.isPending = invalid === 'loading'
    if (state.preview.isPending)
      state.preview.data = undefined as unknown as GatePreview
    const view = await render(
      <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
    )
    await expect
      .element(page.getByLabelText('Evaluated checks unavailable'))
      .toHaveTextContent('—')
    await expect
      .element(page.getByLabelText('Passed checks unavailable'))
      .toHaveTextContent('—')
    await view.unmount()
  }
})

it('keeps the outcome columns aligned on desktop and readable in a narrow content area', async () => {
  await page.viewport(1280, 900)
  for (const width of [1000, 560]) {
    const view = await render(
      <div style={{ width, maxWidth: '100%' }} className='p-4'>
        <AssessmentList repositoryId='123' initialSha='' canCreate={false} />
      </div>
    )
    await expect
      .element(page.getByLabelText('0 of 12 checks evaluated', { exact: true }))
      .toHaveTextContent('0 / 12')
    await expect
      .element(page.getByLabelText('12 checks incomplete'))
      .toHaveTextContent('12')
    const row = view.container.querySelector('li a') as HTMLElement
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    await page.screenshot({
      path: `__screenshots__/assessment-list-columns-${width}.png`,
    })
    await view.unmount()
  }
  await page.viewport(1280, 720)
})
