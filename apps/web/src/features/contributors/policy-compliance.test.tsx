import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { PolicyComplianceSummary, type Compliance } from './policy-compliance'
import { paginatePullRequests } from './pull-request-pagination'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
const period = {
  from: '2026-09-10T00:00:00.000Z',
  to: '2026-10-09T00:00:00.000Z',
}
const fixture = (): Compliance => ({
  eligiblePrs: 1,
  completePrs: 0,
  passingPrs: 0,
  blockedPrs: 0,
  incompletePrs: 0,
  unassessedPrs: 1,
  stalePrs: 0,
  passRate: null,
  coverage: 0,
  mixedBaselines: false,
  truncated: false,
  rowsTruncated: false,
  repositories: [],
  baselines: [],
  rows: [],
})
it('shows the compliance section and unknown state immediately instead of an invented passing score', () => {
  const html = renderToStaticMarkup(
    <PolicyComplianceSummary
      data={fixture()}
      period={period}
      onEvidence={() => {}}
    />
  )
  expect(html).toContain('Engineering policy compliance')
  expect(html).not.toContain('Not enough evidence')
  expect(html).not.toContain('with missing or older evidence')
  expect(html).toContain('Missing evidence')
  expect(html).toContain('Not available')
  expect(html).not.toContain('>100%</p>')
})
it('shows permission-denied, empty and truncated states without percentages or non-finite chart values', () => {
  expect(
    renderToStaticMarkup(
      <PolicyComplianceSummary
        data={null}
        period={period}
        onEvidence={() => {}}
      />
    )
  ).toContain('permission')
  const empty = fixture()
  empty.eligiblePrs = 0
  const html = renderToStaticMarkup(
    <PolicyComplianceSummary
      data={empty}
      period={period}
      onEvidence={() => {}}
    />
  )
  expect(html).toContain('No authored PRs')
  expect(html).not.toContain('NaN')
  const limited = fixture()
  limited.truncated = true
  limited.coverage = null
  expect(
    renderToStaticMarkup(
      <PolicyComplianceSummary
        data={limited}
        period={period}
        onEvidence={() => {}}
      />
    )
  ).toContain('Percentages are hidden')
})
const row = (number: number, overrides = {}) => ({
  id: String(number),
  relationship: 'PR_AUTHOR',
  repositoryId: 'repo',
  pullRequestNumber: number,
  observedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})
it('paginates 20 distinct PRs per page, preserving the final page and empty state', () => {
  const rows = Array.from({ length: 45 }, (_, i) => row(i + 1))
  expect(paginatePullRequests(rows, 1)).toMatchObject({
    total: 45,
    pages: 3,
    page: 1,
    pageSize: 20,
  })
  expect(paginatePullRequests(rows, 1).items).toHaveLength(20)
  expect(paginatePullRequests(rows, 3).items).toHaveLength(5)
  expect(paginatePullRequests(rows, 100).page).toBe(3)
  expect(paginatePullRequests([], 1)).toMatchObject({
    items: [],
    total: 0,
    page: 1,
    pages: 1,
  })
})
it('shows the newest activity once per PR, keeps repository identities separate and excludes reviews', () => {
  const rows = [
    row(1),
    row(1, { id: 'updated', observedAt: '2026-10-08T00:00:00.000Z' }),
    row(1, { id: 'other', repositoryId: 'other' }),
    row(2, { relationship: 'REVIEWER' }),
  ]
  const result = paginatePullRequests(rows, 1)
  expect(result.total).toBe(2)
  expect(result.items[0].id).toBe('updated')
  expect(result.items[1].repositoryId).toBe('other')
})
