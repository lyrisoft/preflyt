import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { NativeCheckPlanView } from './native-check-plan'

const state = vi.hoisted(() => ({
  open: true,
  query: {} as Record<string, unknown>,
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'reader', organizationId: 'org' },
  }),
}))
const render = () =>
  renderToStaticMarkup(
    <NativeCheckPlanView
      open={state.open}
      setOpen={vi.fn()}
      query={
        state.query as unknown as ComponentProps<
          typeof NativeCheckPlanView
        >['query']
      }
    />
  )
beforeEach(() => {
  state.open = true
  state.query = {
    isError: false,
    isPending: false,
    isFetching: false,
    data: {
      sourceSha: 'a'.repeat(40),
      branch: 'main',
      planHash: 'b'.repeat(64),
      steps: [
        {
          ruleId: 'secrets.scan',
          title: 'Secret scanning',
          required: true,
          reason: 'TOOL_REVIEW_REQUIRED',
        },
        {
          ruleId: 'tests.required',
          title: 'Tests',
          required: false,
          reason: 'ADAPTER_UNAVAILABLE',
        },
      ],
    },
  }
})
it('shows recorded source and blocked checks without claiming results', () => {
  const html = render()
  expect(html).toContain('Recorded commit')
  expect(html).toContain('No checks have run')
  expect(html).toContain('Tool review required')
  expect(html).toContain('not supported yet')
  expect(html).not.toContain('Run checks')
  expect(html).toContain('aria-expanded="true"')
})
it('keeps the plan collapsed until requested', () => {
  state.open = false
  const html = render()
  expect(html).toContain('View check plan')
  expect(html).not.toContain('Secret scanning')
  expect(html).toContain('aria-expanded="false"')
})
it('hides previously loaded source data on authorization error', () => {
  state.query = {
    ...state.query,
    isError: true,
    error: new Error('Access denied'),
  }
  const html = render()
  expect(html).toContain('Access denied')
  expect(html).not.toContain('Recorded commit')
  expect(html).toContain('Retry')
})
it('exposes loading and empty states', () => {
  state.query = { isPending: true }
  expect(render()).toContain('role="status"')
  state.query = {
    data: {
      sourceSha: 'a'.repeat(40),
      branch: 'main',
      planHash: 'b'.repeat(64),
      steps: [],
    },
  }
  expect(render()).toContain('No checks in the saved standards selection')
})
