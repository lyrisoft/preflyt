import type { ReactNode, AnchorHTMLAttributes } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { FindingDetailsPage } from './finding-details-page'

const state = vi.hoisted(() => ({
  fail: false,
  mismatch: false,
  canManage: false,
  noLocation: false,
  retryable: false,
  health: false,
  healthBack: false,
  hotspot: false,
  guidance: false,
  reportGuidance: false,
  testFailure: false,
  matches: false,
  ai: 'disabled' as 'disabled' | 'cached' | 'none' | 'failed',
  fetch: vi.fn(),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { identityId: 'owner', organizationId: 'org' },
  }),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useParams: () => ({}), useSearch: () => ({}) }),
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    to: string
    params?: { repositoryId: string }
    search?: Record<string, string>
  }) => (
    <a
      {...props}
      href={
        to.replace('$repositoryId', params?.repositoryId ?? '') +
        (search ? '?' + new URLSearchParams(search) : '')
      }
    >
      {children}
    </a>
  ),
}))
const id = 'f'.repeat(64),
  sha = 'a'.repeat(40),
  assessment = '11111111-1111-4111-8111-111111111111'
const finding = () => ({
  id,
  title: 'Unsafe query',
  repositoryId: '11',
  repository: 'org/repo',
  sourceSha: sha,
  assessmentId: assessment,
  observedAt: '2026-10-12T00:00:00Z',
  severity: 'high',
  status: 'Reported',
  path: state.noLocation ? null : 'src/db.ts',
  line: state.noLocation ? null : 7,
  endLine: state.noLocation ? null : 9,
  reportGuidance: state.reportGuidance
    ? {
        version: 1,
        source: 'ANALYZER_REPORT',
        explanation: 'External rule explanation.',
        advice: 'Use bound parameters. <script>untrusted()</script>',
      }
    : undefined,
  category: state.testFailure ? 'tests' : 'security',
  ruleId: 'sql-injection',
  evidence: ['d'.repeat(64), 'APPROVED_CI_SOURCE_FAILED'],
  verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
  occurrences: 1,
  triage: { state: 'REPORTED', assigneeId: null, note: '', revision: 0 },
})
beforeEach(() => {
  Object.assign(state, {
    fail: false,
    mismatch: false,
    canManage: false,
    noLocation: false,
    retryable: false,
    health: false,
    healthBack: false,
    hotspot: false,
    guidance: false,
    reportGuidance: false,
    testFailure: false,
    matches: false,
    ai: 'disabled',
  })
  state.fetch
    .mockReset()
    .mockImplementation(async (url: string, init?: RequestInit) => {
      if (state.fail)
        return Response.json({ message: 'Access revoked' }, { status: 403 })
      if (url.includes('/finding-guidance')) {
        if (init?.method === 'POST')
          return Response.json({
            available: true,
            canGenerate: true,
            state: 'QUEUED',
            result: null,
          })
        if (state.ai === 'cached')
          return Response.json({
            available: true,
            canGenerate: true,
            state: 'SUCCEEDED',
            model: 'Configured model',
            result: {
              version: 1,
              sourceSha: sha,
              contextHash: 'saved',
              problem: 'The query is built from untrusted input.',
              impact: 'An attacker may change which rows are returned.',
              solution: 'Bind the input as a query parameter.',
              evidenceLines: [7],
            },
          })
        return Response.json({
          available: state.ai !== 'disabled',
          canGenerate: state.ai !== 'disabled',
          state:
            state.ai === 'none'
              ? 'NONE'
              : state.ai === 'failed'
                ? 'FAILED'
                : 'UNAVAILABLE',
          result: null,
        })
      }
      if (init?.method === 'POST')
        return Response.json({
          state: 'RESOLVED',
          assigneeId: 'developer',
          note: 'Reviewed',
          revision: 1,
        })
      if (url.includes('/source?') || url.endsWith('/source'))
        return Response.json({
          path: state.noLocation ? null : 'src/db.ts',
          line: state.noLocation ? null : 7,
          endLine: 9,
          sourceSha: state.mismatch ? 'b'.repeat(40) : sha,
          retryable: state.retryable,
          reason: state.retryable
            ? 'Source could not be verified at this commit. Retry source later.'
            : state.noLocation
              ? 'This check did not provide a source location.'
              : null,
          lines: state.noLocation
            ? []
            : [
                { number: 6, text: 'const query = request.query;' },
                { number: 7, text: 'database.execute(query);' },
                { number: 8, text: 'return rows;' },
                { number: 9, text: '}' },
                { number: 10, text: '// surrounding code' },
              ],
        })
      if (url.includes('/hotspots/'))
        return Response.json({
          state: 'TO_REVIEW',
          note: '',
          revision: 0,
          updatedAt: null,
          canReview: false,
        })
      if (url.includes('/assignees'))
        return Response.json([{ id: 'developer', label: 'developer' }])
      if (url.includes('/health?'))
        return Response.json({
          repository: 'org/repo',
          assessment: {
            id: assessment,
            sourceSha: sha,
            createdAt: '2026-10-12',
            report: {
              findings: [
                {
                  reportGuidance: finding().reportGuidance,
                  guidance: state.guidance
                    ? {
                        version: 1,
                        source: 'PREFLYT_RULE_GUIDANCE',
                        rule: 'preflyt-js-nan-comparison',
                        why: 'NaN comparisons do not test for NaN.',
                        fix: 'Use Number.isNaN(value).',
                        limits: 'Review the intended behavior.',
                        reference:
                          'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NaN',
                      }
                    : undefined,
                  relatedLocations: state.matches
                    ? [{ path: 'other file.ts', line: 4, endLine: 12 }]
                    : undefined,
                  fingerprint: id,
                  title: 'Unsafe query',
                  severity: 'high',
                  path: 'src/db.ts',
                  line: 7,
                  endLine: 9,
                  category: state.hotspot ? 'hotspot' : 'duplication',
                  ruleId: 'sql-injection',
                  checkId: 'security.sast',
                  evidence: 'e'.repeat(64),
                },
              ],
            },
          },
        })
      return Response.json({ finding: finding(), canManage: state.canManage })
    })
  vi.stubGlobal('fetch', state.fetch)
})
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FindingDetailsPage
        findingId={id}
        search={
          state.health
            ? {
                origin: 'health',
                repository: '11',
                health: assessment,
                ...(state.healthBack
                  ? {
                      back: `origin=health&health=${assessment}&category=duplication&repository=11&kind=findings&page=1`,
                    }
                  : {}),
              }
            : { assessment, back: 'kind=gaps&repository=11&q=unsafe&page=2' }
        }
      />
    </QueryClientProvider>
  )
}
it('renders a full details page with a highlighted code block at the saved SHA and a filtered return link', async () => {
  await mount()
  await expect
    .element(page.getByRole('heading', { name: 'Unsafe query', level: 1 }))
    .toBeVisible()
  await expect
    .element(page.getByText('database.execute(query);', { exact: true }))
    .toBeVisible()
  expect(document.querySelectorAll('[data-reported-line=true]')).toHaveLength(3)
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
  await expect
    .element(page.getByRole('link', { name: 'Open on GitHub' }))
    .toHaveAttribute(
      'href',
      `https://github.com/org/repo/blob/${sha}/src/db.ts#L7-L9`
    )
  await expect
    .element(page.getByRole('link', { name: 'Back to findings' }))
    .toHaveAttribute(
      'href',
      '/findings?kind=gaps&repository=11&q=unsafe&page=2'
    )
  await expect
    .element(
      page.getByText(
        'Admin-associated report; source not independently verified'
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByText('The approved CI check or workflow failed.'))
    .toBeVisible()
})
it('shows saved AI guidance as the primary issue, effect and fix without requesting it again', async () => {
  state.ai = 'cached'
  await mount()
  await expect
    .element(page.getByText('The query is built from untrusted input.'))
    .toBeVisible()
  await expect
    .element(page.getByText('An attacker may change which rows are returned.'))
    .toBeVisible()
  await expect
    .element(page.getByText('Bind the input as a query parameter.'))
    .toBeVisible()
  await expect.element(page.getByText('Likely effect')).toBeVisible()
  expect(
    document
      .querySelector(
        'section[aria-label="Problem and solution"] [data-slot="surface-icon"] svg'
      )
      ?.classList.contains('lucide-sparkles')
  ).toBe(true)
  expect(
    state.fetch.mock.calls.filter(
      ([url, init]) =>
        url.includes('/finding-guidance') && init?.method === 'POST'
    )
  ).toHaveLength(0)
})
it('keeps saved guidance visible while AI is unavailable or waiting to run', async () => {
  state.reportGuidance = true
  state.ai = 'disabled'
  const first = await mount()
  await expect
    .element(page.getByText('External rule explanation.'))
    .toBeVisible()
  expect(
    document
      .querySelector(
        'section[aria-label="Problem and solution"] [data-slot="surface-icon"] svg'
      )
      ?.classList.contains('lucide-message-square-text')
  ).toBe(true)
  expect(
    state.fetch.mock.calls.filter(
      ([url, init]) =>
        url.includes('/finding-guidance') && init?.method === 'POST'
    )
  ).toHaveLength(0)
  await first.unmount()
  state.ai = 'none'
  await mount()
  await expect
    .poll(
      () =>
        state.fetch.mock.calls.filter(
          ([url, init]) =>
            url.includes('/finding-guidance') && init?.method === 'POST'
        ).length
    )
    .toBe(1)
  await expect
    .element(page.getByText('External rule explanation.'))
    .toBeVisible()
})
it('explains a missing source location without displaying fabricated code', async () => {
  state.noLocation = true
  await mount()
  await expect
    .element(page.getByText('This check did not provide a source location.'))
    .toBeVisible()
  expect(document.querySelectorAll('[data-reported-line]')).toHaveLength(0)
  await expect
    .element(page.getByRole('link', { name: 'Open on GitHub' }))
    .not.toBeInTheDocument()
})
it('suppresses code from a mismatched source response and denied finding access', async () => {
  state.mismatch = true
  const view = await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Source could not be matched')
  await expect
    .element(page.getByText('database.execute(query);'))
    .not.toBeInTheDocument()
  await view.unmount()
  state.fail = true
  await mount()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Repository access is unavailable')
  await expect
    .element(page.getByRole('region', { name: 'Affected code' }))
    .not.toBeInTheDocument()
})
it('preserves authorized triage controls and source scrolling at 320px in both themes', async () => {
  state.canManage = true
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await mount()
    await expect
      .element(page.getByRole('button', { name: 'Save changes' }))
      .toBeVisible()
    await page.getByLabelText('Status', { exact: true }).click()
    await page.getByRole('option', { name: 'Resolved', exact: true }).click()
    await expect
      .element(page.getByLabelText('Resolution or review note'))
      .toBeRequired()
    await page
      .getByLabelText('Resolution or review note')
      .fill('Reviewed and fixed in the next commit')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(() =>
        state.fetch.mock.calls.some(([, init]) => init?.method === 'POST')
      )
      .toBe(true)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
it('opens Health findings with their category and complete source block', async () => {
  state.health = true
  await mount()
  await expect
    .element(page.getByText('duplication', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByText('database.execute(query);', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Back to Health report' }))
    .toHaveAttribute('href', `/repositories/11?tab=health&health=${assessment}`)
  expect(document.querySelectorAll('[data-reported-line=true]')).toHaveLength(3)
  await expect
    .element(page.getByRole('button', { name: 'Save changes' }))
    .not.toBeInTheDocument()
})

it('starts source retrieval while finding metadata is still loading', async () => {
  const respond = state.fetch.getMockImplementation()!
  let release!: () => void
  const metadata = new Promise<void>((resolve) => {
    release = resolve
  })
  state.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!url.includes('/source')) await metadata
    return respond(url, init)
  })
  const view = await mount()
  await expect
    .poll(() =>
      state.fetch.mock.calls.some(([url]) => url.includes('/source?'))
    )
    .toBe(true)
  await expect
    .element(page.getByRole('status', { name: 'Loading finding details' }))
    .toBeVisible()
  release()
  await expect
    .element(page.getByText('database.execute(query);', { exact: true }))
    .toBeVisible()
  await view.unmount()
})

it('offers a source retry after a transient capture failure', async () => {
  state.retryable = true
  const view = await mount()
  await expect
    .element(page.getByRole('button', { name: 'Retry source' }))
    .toBeVisible()
  state.retryable = false
  await page.getByRole('button', { name: 'Retry source' }).click()
  await expect
    .element(page.getByText('database.execute(query);', { exact: true }))
    .toBeVisible()
  await view.unmount()
})

it('shows hotspot review beside the exact source on the dedicated details page', async () => {
  state.health = true
  state.hotspot = true
  await mount()
  await expect
    .element(page.getByText('Hotspot review', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByText('To review', { exact: true }))
    .toBeVisible()
  expect(document.querySelectorAll('[data-reported-line=true]')).toHaveLength(3)
  await expect
    .element(page.getByRole('button', { name: 'Save review' }))
    .not.toBeInTheDocument()
})

it('shows truthful fallback guidance without inferring a rule explanation', async () => {
  await mount()
  await expect
    .element(page.getByRole('button', { name: /Problem and solution/ }))
    .toBeVisible()
  await expect
    .element(
      page.getByText(
        'Rule-specific guidance is unavailable for this saved result.',
        { exact: false }
      )
    )
    .toBeVisible()
})
it('renders saved health rule guidance beside the original evidence', async () => {
  state.health = true
  state.guidance = true
  await mount()
  await expect
    .element(page.getByText('NaN comparisons do not test for NaN.'))
    .toBeVisible()
  await expect.element(page.getByText('Use Number.isNaN(value).')).toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'Language reference' }))
    .toHaveAttribute(
      'href',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NaN'
    )
})

it('shows analyzer-supplied advice as text with its own source label', async () => {
  state.reportGuidance = true
  await mount()
  await expect
    .element(page.getByText('External rule explanation.'))
    .toBeVisible()
  await expect
    .element(page.getByRole('heading', { name: 'Suggested solution' }))
    .toBeVisible()
  await expect
    .element(
      page.getByText('Use bound parameters. <script>untrusted()</script>')
    )
    .toBeVisible()
  await expect
    .element(
      page.getByText('Analyzer-provided guidance from the saved report.', {
        exact: false,
      })
    )
    .toBeVisible()
  expect(document.querySelector('main script')).toBeNull()
})

it('shows matching blocks as links at the exact assessed commit', async () => {
  state.health = true
  state.matches = true
  await mount()
  await expect
    .element(page.getByRole('heading', { name: 'Matching blocks' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('link', { name: 'other file.ts:4–12' }))
    .toHaveAttribute(
      'href',
      `https://github.com/org/repo/blob/${sha}/other%20file.ts#L4-L12`
    )
})

it('preserves saved analyzer explanations through the Health finding mapper', async () => {
  state.health = true
  state.reportGuidance = true
  await mount()
  await expect
    .element(page.getByText('External rule explanation.'))
    .toBeVisible()
  await expect
    .element(page.getByRole('heading', { name: 'Suggested solution' }))
    .toBeVisible()
  await expect
    .element(
      page.getByText('Use bound parameters. <script>untrusted()</script>')
    )
    .toBeVisible()
  expect(document.querySelector('script')).not.toHaveTextContent('untrusted()')
})

it('returns to the original category-filtered Findings list for Health details', async () => {
  state.health = true
  state.healthBack = true
  await mount()
  await expect
    .element(page.getByRole('link', { name: 'Back to findings' }))
    .toHaveAttribute('href', expect.stringContaining('category=duplication'))
  await expect
    .element(page.getByRole('link', { name: 'Back to findings' }))
    .toHaveAttribute('href', expect.stringContaining(`health=${assessment}`))
})

it('keeps problem and solution with the code and supports keyboard collapse without hiding the evidence', async () => {
  state.reportGuidance = true
  await mount()
  const toggle = page.getByRole('button', { name: /Problem and solution/ })
  await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
  const panel = document.querySelector(
    'section[aria-label="Problem and solution"]'
  )!
  expect(panel.closest('[aria-label="Affected code"]')).not.toBeNull()
  expect(panel.textContent).toContain('Unsafe query')
  await toggle.click()
  await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect
    .element(page.getByRole('heading', { name: 'Problem', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByText('database.execute(query);', { exact: true }))
    .toBeVisible()
  await userEvent.keyboard('{Enter}')
  await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect
    .element(page.getByText('External rule explanation.'))
    .toBeVisible()
})
it('gives test failures actionable steps without inventing a root cause or patch', async () => {
  state.testFailure = true
  await mount()
  await expect
    .element(
      page.getByText('This test failed in the saved CI report.', {
        exact: false,
      })
    )
    .toBeVisible()
  await expect
    .element(
      page.getByText(
        'Compare the failing assertion with the expected behavior,',
        { exact: false }
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByText('General test-failure guidance.', { exact: false }))
    .toBeVisible()
})
