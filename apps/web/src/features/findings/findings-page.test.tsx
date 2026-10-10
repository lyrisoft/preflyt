import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { FindingsPage } from './findings-page'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { organizationId: 'org' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/apps'>{children}</a>
  ),
}))
vi.mock('@/components/layout/main', () => ({
  Main: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
beforeEach(() => {
  state.query = {
    data: {
      rows: [],
      total: 0,
      assessedRevisions: 0,
      repositories: [],
      pageSize: 50,
    },
    refetch: vi.fn(),
  }
})
it('shows a useful empty state without fabricated findings', async () => {
  const view = await render(<FindingsPage />)
  await expect.element(view.getByText('No saved assessments yet')).toBeVisible()
  await expect
    .element(view.getByRole('tab', { name: 'Evidence gaps' }))
    .toBeVisible()
})
it('opens exact commit evidence and preserves unverified report status', async () => {
  state.query = {
    data: {
      rows: [
        {
          id: 'f',
          title: 'Unsafe query',
          repositoryId: '1',
          repository: 'org/repo',
          sourceSha: 'a'.repeat(40),
          assessmentId: 'saved',
          observedAt: '2026-10-10T00:00:00Z',
          severity: 'high',
          status: 'Reported',
          path: 'src/db.ts',
          line: 3,
          ruleId: 'query',
          evidence: ['digest'],
          verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
          occurrences: 1,
        },
      ],
      total: 1,
      assessedRevisions: 1,
      repositories: [],
      pageSize: 50,
    },
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByText('Reported', { exact: true }))
    .toHaveClass('text-info-text')
  await view.getByRole('button', { name: 'Details', exact: true }).click()
  await expect
    .element(
      view.getByText(
        'Admin-associated report; source not independently verified'
      )
    )
    .toBeVisible()
  await expect
    .element(view.getByText('a'.repeat(40), { exact: true }))
    .toBeVisible()
})
it('shows API failures without a misleading empty success state', async () => {
  state.query = {
    isError: true,
    error: new Error('Repository access revoked'),
    refetch: vi.fn(),
  }
  const view = await render(<FindingsPage />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Repository access revoked')
  await expect
    .element(view.getByText('No saved assessments yet'))
    .not.toBeInTheDocument()
})
