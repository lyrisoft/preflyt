import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { RulesetInsights } from './ruleset-insights'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
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
