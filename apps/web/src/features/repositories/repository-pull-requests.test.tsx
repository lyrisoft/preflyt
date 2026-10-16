import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { RepositoryPullRequests } from './repository-pull-requests'

const state = vi.hoisted(() => ({ status: 'PASS', error: false }))
const context = {
  state: 'open',
  merged: false,
  draft: false,
  head: { ref: 'feature', sha: 'a'.repeat(40), repositoryId: '501' },
  base: { ref: 'main', sha: 'b'.repeat(40), repositoryId: '501' },
}
vi.mock('./engineering-queries', () => ({
  usePullRequests: () => ({
    data: { pullRequests: [{ id: 'pr', number: 1, context }] },
    refetch: vi.fn(),
  }),
  usePullRequest: () => ({
    isError: state.error,
    error: new Error('Cannot load PR'),
    refetch: vi.fn(),
    data: {
      pullRequest: { number: 1, context, syncState: 'SYNCED', revision: 1 },
      verification: 'RECENTLY_VERIFIED',
      readiness: state.status,
      reason: `SAVED_ASSESSMENT_${state.status}`,
      mergeReview: {
        assessmentId: 'saved',
        sourceSha: context.head.sha,
        status: state.status,
      },
    },
  }),
}))
vi.mock('./assessment-context', () => ({
  AssessmentSnapshotDialog: () => null,
}))
it.each([
  ['PASS', 'Required checks passed', 'text-success-text'],
  ['BLOCK', 'Required checks failed', 'text-danger-text'],
  ['INCOMPLETE', 'Required results incomplete', 'text-warning-text'],
  ['WARN', 'Optional checks need attention', 'text-warning-text'],
])('shows the matching saved %s result', async (status, label, color) => {
  state.status = status
  const view = await render(<RepositoryPullRequests repositoryId='501' />)
  await expect
    .element(view.getByText(label, { exact: true }))
    .toHaveClass(color)
  await expect
    .element(view.getByRole('button', { name: 'View evaluated assessment' }))
    .toBeVisible()
})

it('hides a cached passing result when loading the current PR fails', async () => {
  state.status = 'PASS'
  state.error = true
  try {
    const view = await render(<RepositoryPullRequests repositoryId='501' />)
    await expect
      .element(view.getByRole('alert'))
      .toHaveTextContent('Cannot load PR')
    await expect
      .element(view.getByText('Required checks passed', { exact: true }))
      .not.toBeInTheDocument()
  } finally {
    state.error = false
  }
})
