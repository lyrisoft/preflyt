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
  expect(html).toContain('Action required')
  expect(html).toContain('Not verified')
  expect(html).toContain('Publication is disabled')
  expect(html).toContain('Next')
  expect(html).not.toContain('Publish non-passing check')
  expect(html).toContain('No saved assessments')
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
