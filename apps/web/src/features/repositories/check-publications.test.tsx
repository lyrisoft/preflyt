import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { CheckPublications } from './check-publications'

const state = vi.hoisted(() => ({
  history: {} as Record<string, unknown>,
  assessments: {} as Record<string, unknown>,
}))
vi.mock('./readiness-automation', () => ({ ReadinessAutomation: () => null }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === 'check-publications'
      ? state.history
      : state.assessments,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
}))
const render = (canRead = true) =>
  renderToStaticMarkup(
    <CheckPublications
      repositoryId='51'
      actorId='viewer'
      canRead={canRead}
      canPublish={false}
    />
  )
beforeEach(() => {
  state.history = {
    isPending: false,
    isError: false,
    data: {
      enabled: false,
      hasMore: true,
      publications: [
        {
          id: 'one',
          prNumber: 7,
          sourceSha: 'a'.repeat(40),
          state: 'UNKNOWN',
          conclusion: 'action_required',
          verifiedAt: null,
          htmlUrl: null,
        },
      ],
    },
  }
  state.assessments = {
    isPending: false,
    isError: false,
    data: { assessments: [] },
  }
})
it('shows unverified history without claiming a successful check and explains disabled deployment', () => {
  const html = render()
  expect(html).toContain('Needs verification')
  expect(html).toContain('Not evaluated')
  expect(html).toContain('Preflyt result')
  expect(html).toContain('Preflyt checks are not being published')
  expect(html).toContain('Next')
  expect(html).not.toContain('Publish non-passing check')
  expect(html).not.toContain('No saved assessments')
  expect(html).not.toContain('Automatic PR checks')
  expect(html).not.toContain('Publication history')
  expect(html).not.toContain('GitHub readiness check')
})
it('hides cached publication rows when access fails', () => {
  state.history = {
    ...state.history,
    isError: true,
    error: new Error('Repository access changed.'),
  }
  expect(render()).toContain('Repository access changed.')
  expect(render()).not.toContain('Needs verification')
  expect(render(false)).toContain('You need policy read access')
  expect(render(false)).not.toContain('Publication history')
})

it('shows one disabled setup message without empty sections or publishing controls', () => {
  state.history = {
    ...state.history,
    data: { enabled: false, hasMore: false, publications: [] },
  }
  const html = render()
  expect(html).toContain('Preflyt checks are not being published')
  expect(html).not.toContain('<table')
  expect(html).not.toContain('Publish check')
  expect(html).not.toContain('No checks published')
})
it('never displays a stale stored success as the current result of an unverified check', () => {
  state.history = {
    ...state.history,
    data: {
      enabled: true,
      hasMore: false,
      publications: [
        {
          id: 'pending',
          prNumber: 7,
          sourceSha: 'a'.repeat(40),
          state: 'UNKNOWN',
          conclusion: 'success',
        },
      ],
    },
  }
  const html = render()
  expect(html).toContain('Not evaluated')
  expect(html).not.toContain('Passed')
})

it('offers no manual publishing flow even to publishers when publication is enabled', () => {
  state.history = {
    ...state.history,
    data: { enabled: true, hasMore: false, publications: [] },
  }
  const html = renderToStaticMarkup(
    <CheckPublications repositoryId='51' canRead canPublish />
  )
  expect(html).not.toContain('Publish check')
  expect(html).not.toContain('Publish PR check')
  expect(html).toContain('No Preflyt checks published yet.')
})
