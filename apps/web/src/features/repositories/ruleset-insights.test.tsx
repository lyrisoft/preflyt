import type { ReactNode } from 'react'
import '@/styles/index.css'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render as renderBrowser } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RulesetInsights } from './ruleset-insights'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: ReactNode
    params: { repositoryId: string }
    search: { tab: string; assessment: string }
  }) => (
    <a
      href={`/repositories/${params.repositoryId}?tab=${search.tab}&assessment=${search.assessment}`}
    >
      {children}
    </a>
  ),
}))
const render = () =>
  renderToStaticMarkup(
    <RulesetInsights
      repositoryId='501'
      actorId='reader'
      rulesetId={7}
      configuration={null}
    />
  )
beforeEach(() => {
  state.query = {
    isPending: false,
    isError: false,
    data: {
      suites: [],
      hasMore: false,
      fetchedAt: '2026-10-09T12:00:00Z',
      scannedSuites: 0,
      repositoryName: 'fixture/app',
      summary: {
        ruleEvaluations: 0,
        activePass: 0,
        activeFail: 0,
        evaluateFail: 0,
        attributedBypass: 0,
        suiteBypassUnattributed: 0,
        failureTypes: [],
      },
    },
  }
})
it('labels current-page counts and empty history without a false pass percentage', () => {
  const html = render()
  expect(html).toContain('on this page')
  expect(html).toContain('No matching evaluations')
  expect(html).toContain('Previous')
  expect(html).toContain('Next')
  expect(html).not.toContain('100%')
})
it('hides cached evaluation rows on permission/provider errors', () => {
  state.query = {
    ...state.query,
    isError: true,
    error: new Error('Repository access changed'),
  }
  const html = render()
  expect(html).toContain('Repository access changed')
  expect(html).not.toContain('Active rules passed')
  expect(html).not.toContain('No matching evaluations')
})

it('shows disabled or failed saved-history collection without claiming complete coverage', () => {
  state.query.data = {
    ...(state.query.data as object),
    fetchedAt: null,
    collection: {
      enabled: false,
      error: false,
      lastSweepAt: null,
      retentionDays: 90,
    },
  }
  const html = render()
  expect(html).toContain('Saved GitHub history')
  expect(html).toContain('History collection is disabled')
  expect(html).toContain('No history collected yet')
  expect(html).not.toContain('100%')
})

it('shows collected-period comparisons and an honest bounded-history warning', () => {
  state.query.data = {
    ...(state.query.data as object),
    trend: {
      truncated: true,
      limit: 1000,
      previousWindowLimitedByRetention: true,
      days: [],
      current: {
        activePass: 2,
        activeFail: 3,
        evaluateFail: 1,
        attributedBypass: 0,
      },
      previous: {
        activePass: 1,
        activeFail: 4,
        evaluateFail: 2,
        attributedBypass: 0,
      },
    },
  }
  const html = render()
  expect(html).toContain('Saved rule history')
  expect(html).toContain('Previous period')
  expect(html).toContain('newest 1000 saved suites')
  expect(html).toContain('part of the previous period')
  expect(html).toContain('No saved evaluations match')
  expect(html).not.toContain('100%')
})
it('links the exact saved assessment and distinguishes missing commit assessments', () => {
  const suite = {
    id: 1,
    actor: 'developer',
    ref: 'refs/heads/main',
    sourceSha: 'a'.repeat(40),
    pushedAt: '2026-10-10T00:00:00Z',
    suiteResult: 'pass',
    rules: [],
  }
  state.query.data = {
    ...(state.query.data as object),
    suites: [
      {
        ...suite,
        assessments: [{ id: 'exact-assessment', createdAt: suite.pushedAt }],
      },
      { ...suite, id: 2, assessments: [] },
    ],
  }
  const html = render()
  expect(html).toContain(
    '/repositories/501?tab=assessments&amp;assessment=exact-assessment'
  )
  expect(html).toContain('No saved assessment for this commit')
})

it('renders the real saved-history chart within a narrow viewport in both themes', async () => {
  await page.viewport(320, 800)
  state.query.data = {
    ...(state.query.data as object),
    trend: {
      truncated: false,
      limit: 1000,
      previousWindowLimitedByRetention: false,
      days: [
        {
          day: '2026-10-10',
          activePass: 2,
          activeFail: 3,
          evaluateFail: 1,
          attributedBypass: 0,
        },
      ],
      current: {
        activePass: 2,
        activeFail: 3,
        evaluateFail: 1,
        attributedBypass: 0,
      },
      previous: {
        activePass: 1,
        activeFail: 4,
        evaluateFail: 2,
        attributedBypass: 0,
      },
    },
  }
  const view = await renderBrowser(
    <div style={{ width: '100%', padding: 16 }}>
      <RulesetInsights
        repositoryId='501'
        actorId='reader'
        rulesetId={7}
        configuration={null}
      />
    </div>
  )
  try {
    for (const theme of ['light', 'dark']) {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      await expect.element(view.getByText('Saved rule history')).toBeVisible()
      await expect
        .poll(
          () =>
            document.querySelector('.recharts-surface')?.getBoundingClientRect()
              .width ?? 0
        )
        .toBeGreaterThan(0)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        window.innerWidth + 1
      )
    }
  } finally {
    await view.unmount()
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})
