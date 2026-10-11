import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceStart } from './workspace-start'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode
    to: string
    search?: { tab: string }
  }) => <a href={`${to}?tab=${search?.tab}`}>{children}</a>,
}))
beforeEach(() => {
  state.query = { data: { github: false, oidc: false } }
})
it('takes the deployment admin directly to connection configuration', () => {
  const html = renderToStaticMarkup(<WorkspaceStart platformAdmin />)
  expect(html).toContain('/organization-settings?tab=configuration')
  expect(html).not.toContain('Manage workspaces')
})
it('requires GitHub sign-in for organization ownership rather than granting admin access', () => {
  state.query = { data: { github: true } }
  const html = renderToStaticMarkup(<WorkspaceStart platformAdmin />)
  expect(html).toContain('/auth/github/login')
  expect(html).toContain('organization owner')
})
it('keeps system configuration out of ordinary user onboarding', () => {
  const html = renderToStaticMarkup(<WorkspaceStart platformAdmin={false} />)
  expect(html).toContain('Ask your Preflyt administrator')
  expect(html).not.toContain('href=')
})
it('shows retry instead of treating unavailable configuration as unconfigured', () => {
  state.query = { isError: true, error: new Error('Connection unavailable') }
  const html = renderToStaticMarkup(<WorkspaceStart platformAdmin />)
  expect(html).toContain('Try again')
  expect(html).not.toContain('Configure GitHub')
})
