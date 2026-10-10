import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { NativeExecutionStatus } from './native-execution-status'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'reader', organizationId: 'org' },
  }),
}))
const render = () =>
  renderToStaticMarkup(<NativeExecutionStatus repositoryId='51' />)
beforeEach(() => {
  state.query = {
    isPending: false,
    isError: false,
    isFetching: false,
    data: {
      mode: 'INGEST_ONLY',
      executionAvailable: false,
      preflightVerified: false,
      checkedAt: '2026-10-09T12:00:00Z',
      reason: 'REVIEW_REQUIRED',
      message:
        'An independent sandbox review is required before Preflyt can run checks.',
    },
  }
})
it('shows imported-only mode with an actionable review status and accessible help', () => {
  const html = render()
  expect(html).toContain('Imported CI only')
  expect(html).toContain('independent sandbox review')
  expect(html).toContain('Check sandbox')
  expect(html).toContain('Help for Execution environment')
  expect(html).not.toContain('Run checks')
})
it('never presents a successful preflight as passing repository checks', () => {
  state.query.data = {
    ...(state.query.data as object),
    preflightVerified: true,
    message:
      'Sandbox review and current controls are verified. Running checks is not enabled yet.',
  }
  const html = render()
  expect(html).toContain('Execution setup verified')
  expect(html).toContain('Imported CI only')
  expect(html).toContain('not enabled yet')
  expect(html).not.toContain('Passed')
})
it('hides cached status on an access or provider error', () => {
  state.query = {
    ...state.query,
    isError: true,
    error: new Error('Access denied'),
  }
  const html = render()
  expect(html).toContain('Access denied')
  expect(html).not.toContain('Imported CI only')
})
it('exposes a loading status and disables duplicate checks', () => {
  state.query = { isPending: true, isFetching: true }
  const html = render()
  expect(html).toContain('role="status"')
  expect(html).toContain('Checking the execution environment')
  expect(html).toContain('disabled=""')
})

it('distinguishes an enabled reviewed runner from imported-only mode without claiming passing checks', () => {
  state.query.data = {
    ...(state.query.data as object),
    executionAvailable: true,
    preflightVerified: true,
    mode: 'HYBRID',
    message: 'Preflyt can run reviewed checks for this repository.',
  }
  const html = render()
  expect(html).toContain('Run checks available')
  expect(html).not.toContain('Imported CI only')
  expect(html).not.toContain('Checks passed')
})
