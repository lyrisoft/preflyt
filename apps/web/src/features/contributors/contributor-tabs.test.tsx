import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ContributorsPage } from './contributors-page'

const state = vi.hoisted(() => ({ tab: 'activity', page: 1, canImport: false }))
const data = vi.hoisted(() => ({
  choices: [{ githubId: '11', fullName: 'fixture/repo' }],
  scope: [{ githubId: '11', fullName: 'fixture/repo' }],
  period: { days: 30, from: '2026-09-10', to: '2026-10-09' },
  summary: {},
  activity: [],
  assessmentActivity: [],
  contributionActivity: [],
  permissions: { activity: true, policyEvidence: true },
  page: 1,
  pageSize: 20,
  total: 1,
  truncated: false,
  emptyActivity: false,
  collectionEnabled: true,
  lastReceivedAt: null,
  limitations: [],
  contributors: [
    {
      id: 'person',
      login: 'developer',
      kind: 'HUMAN',
      avatarUrl: 'https://avatars.githubusercontent.com/u/11?s=80',
      profileUrl: 'https://github.com/developer',
      authoredPrs: 31,
      mergedPrs: 0,
      reviews: 0,
      commits: 0,
    },
  ],
  observations: Array.from({ length: 31 }, (_, i) => ({
    id: `event-${i}`,
    relationship: 'PR_AUTHOR',
    repositoryId: '11',
    repository: 'fixture/repo',
    sourceSha: 'a'.repeat(40),
    sourceObjectId: `pr-${i + 1}`,
    pullRequestNumber: i + 1,
    action: 'opened',
    merged: false,
    observedAt: '2026-10-09T00:00:00Z',
    sourceUrl: `https://github.com/fixture/repo/pull/${i + 1}`,
    assessments: [],
  })),
  policyCompliance: {
    eligiblePrs: 31,
    completePrs: 0,
    passingPrs: 0,
    blockedPrs: 0,
    incompletePrs: 0,
    unassessedPrs: 31,
    stalePrs: 0,
    passRate: null,
    coverage: 0,
    mixedBaselines: false,
    truncated: false,
    rowsTruncated: false,
    repositories: [],
    baselines: [],
    rows: [],
  },
}))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({
    days: '30',
    repository: 'all',
    kind: 'all',
    relationship: 'all',
    q: '',
    page: state.page,
    tab: state.tab,
  }),
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useParams: () => ({ contributorId: 'person' }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    isPending: false,
    isError: false,
    isSuccess: false,
    mutate: vi.fn(),
  }),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { identityId: 'person', organizationId: 'org' },
  }),
}))
vi.mock('@/features/workspace/scoped-access', () => ({
  canPerform: () => state.canImport,
}))
vi.mock('@/components/layout/app-header', () => ({
  AppHeader: () => <header>Profile header</header>,
}))
vi.mock('@/components/repository-picker', () => ({
  RepositoryPicker: () => <span>Repository picker</span>,
}))
it.each([
  'repositories',
  'pull-requests',
  'reviews',
  'policy-evidence',
  'activity',
])(
  'puts %s content immediately below tabs without repeating the dashboard',
  (tab) => {
    state.tab = tab
    state.page = 1
    const html = renderToStaticMarkup(
      <ContributorsPage contributorId='person' />
    )
    expect(html).not.toContain('Contribution activity')
    expect(html).not.toContain('Policy Compliance')
    expect(html).toContain('role="tablist"')
  }
)
it('keeps the dashboard inside Overview and the navigation before it', () => {
  state.tab = 'overview'
  state.page = 1
  const html = renderToStaticMarkup(<ContributorsPage contributorId='person' />)
  expect(html).toContain('Policy Compliance')
  expect(html.indexOf('role="tablist"')).toBeLessThan(
    html.indexOf('Contribution activity')
  )
})
it('pages Activity content and does not render later rows on page one', () => {
  state.tab = 'activity'
  state.page = 1
  const first = renderToStaticMarkup(
    <ContributorsPage contributorId='person' />
  )
  expect(first).toContain('Page 1 of 2')
  expect(first).not.toContain('>PR #31')
  state.page = 2
  const second = renderToStaticMarkup(
    <ContributorsPage contributorId='person' />
  )
  expect(second).toContain('Page 2 of 2')
  expect(second).toContain('>PR #31')
  expect(second).not.toContain('>PR #1<')
})

it('puts Help after Refresh and keeps explanatory notes out of the dashboard', () => {
  state.tab = 'overview'
  state.page = 1
  const html = renderToStaticMarkup(<ContributorsPage contributorId='person' />)
  expect(html.indexOf('Refresh local data')).toBeLessThan(
    html.indexOf('Help for Contributor profile')
  )
  expect(html).not.toContain('Metric definitions · Observe mode')
  expect(html).not.toContain('How activity is counted')
  expect(html).not.toContain('Data sources and limits')
  expect(html).toContain('items-stretch')
  expect(html).toContain('h-full min-w-0')
})

it('shows GitHub import in the page header for All repositories only to repository managers', () => {
  state.canImport = true
  try {
    const html = renderToStaticMarkup(<ContributorsPage />)
    expect(html).toContain('Import GitHub activity')
    expect(html.indexOf('Import GitHub activity')).toBeLessThan(
      html.indexOf('Refresh local data')
    )
  } finally {
    state.canImport = false
  }
  expect(renderToStaticMarkup(<ContributorsPage />)).not.toContain(
    'Import GitHub activity'
  )
})

it('keeps a known contributor visible with a clear empty-filter state', () => {
  data.emptyActivity = true
  try {
    const html = renderToStaticMarkup(<ContributorsPage />)
    expect(html).toContain('No recorded activity for this contributor')
    expect(html).toContain('developer')
  } finally {
    data.emptyActivity = false
  }
})
