import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { RepositoryRulesets, RulesetDetail } from './repository-rulesets'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
const clients: QueryClient[] = []
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(value)
  return value
}
function queued() {
  return new Response(
    JSON.stringify({
      code: 'GITHUB_SYNC_PENDING',
      message: 'The background worker is fetching the latest GitHub data.',
      retryAt: new Date(Date.now() + 1100).toISOString(),
    }),
    { status: 503 }
  )
}
const rule = {
  id: 7,
  name: 'Main branch rules',
  target: 'branch',
  sourceType: 'Repository',
  source: 'fixture/app',
  enforcement: 'active',
  htmlUrl: 'https://github.com/fixture/app/rules/7',
}
const list = {
  rulesets: [rule],
  hasMore: false,
  page: 1,
  fetchedAt: new Date().toISOString(),
}
const listView = (queryClient: QueryClient) => (
  <QueryClientProvider client={queryClient}>
    <RepositoryRulesets
      repositoryId='501'
      actorId='reader'
      repositoryName='fixture/app'
      canRead
      canDraft={false}
      canManage={false}
    />
  </QueryClientProvider>
)

it('shows queued reads as progress and automatically loads the rulesets without forcing GitHub refresh', async () => {
  const fetch = vi.fn(async (_url: RequestInfo | URL) =>
    fetch.mock.calls.length === 1 ? queued() : Response.json(list)
  )
  vi.stubGlobal('fetch', fetch)
  const view = await render(listView(client()))
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Loading GitHub data')
  await expect.element(view.getByRole('alert')).not.toBeInTheDocument()
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
  expect(fetch.mock.calls.length).toBe(2)
  expect(
    fetch.mock.calls.every(([url]) => !String(url).includes('refresh=true'))
  ).toBe(true)
})

it('keeps the saved list while a requested refresh runs, then updates the visible page cache', async () => {
  let reads = 0
  const fetch = vi.fn(async (_url: RequestInfo | URL) => {
    const updated = ++reads >= 3
    return Response.json({
      ...list,
      fetchedAt: updated
        ? new Date(Date.now() + 1000).toISOString()
        : list.fetchedAt,
      rulesets: [
        { ...rule, name: updated ? 'Updated branch rules' : rule.name },
      ],
    })
  })
  vi.stubGlobal('fetch', fetch)
  const queryClient = client()
  const view = await render(listView(queryClient))
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Updating GitHub rulesets…')
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Updated branch rules', { exact: true }))
    .toBeVisible()
  expect(
    queryClient.getQueryData<typeof list>([
      'github-rulesets',
      'reader',
      '501',
      1,
      10,
    ])?.rulesets[0].name
  ).toBe('Updated branch rules')
  expect(
    fetch.mock.calls.filter(([url]) => String(url).includes('refresh=true'))
  ).toHaveLength(1)
})

it('hides saved rulesets after access is denied and preserves the permission error', async () => {
  const queryClient = client()
  queryClient.setQueryData(['github-rulesets', 'reader', '501', 1, 10], list, {
    updatedAt: 0,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ message: 'Repository access changed.' }, { status: 403 })
    )
  )
  const view = await render(listView(queryClient))
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Repository access changed.')
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .not.toBeInTheDocument()
})

it('lets the user retry when a background refresh keeps returning the saved snapshot', async () => {
  const actualNow = Date.now.bind(Date)
  let elapsed = 0
  vi.spyOn(Date, 'now').mockImplementation(() => actualNow() + elapsed)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(list))
  )
  const queryClient = client()
  const view = await render(listView(queryClient))
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Updating GitHub rulesets…')
  elapsed = 120_001
  await queryClient.refetchQueries({
    queryKey: ['github-rulesets', 'reader', '501', 1, 10],
    exact: true,
  })
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('GitHub is taking longer to refresh')
  await expect
    .element(view.getByRole('button', { name: 'Refresh', exact: true }))
    .toBeEnabled()
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
})

it('automatically follows queued configuration and insights reads until both are available', async () => {
  let configurationReads = 0
  let insightReads = 0
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/insights?')) {
      if (++insightReads === 1) return queued()
      return Response.json({
        suites: [],
        hasMore: false,
        scannedSuites: 0,
        repositoryName: 'fixture/app',
        fetchedAt: new Date().toISOString(),
        summary: {
          ruleEvaluations: 0,
          activePass: 0,
          activeFail: 0,
          evaluateFail: 0,
          attributedBypass: 0,
          suiteBypassUnattributed: 0,
          failureTypes: [],
        },
      })
    }
    if (++configurationReads === 1) return queued()
    return Response.json({
      ruleset: {
        ...rule,
        branches: { include: ['refs/heads/main'], exclude: [] },
        rules: [],
      },
      fetchedAt: new Date().toISOString(),
    })
  })
  vi.stubGlobal('fetch', fetch)
  const view = await render(
    <QueryClientProvider client={client()}>
      <RulesetDetail repositoryId='501' actorId='reader' id={7} canRead />
    </QueryClientProvider>
  )
  await expect
    .element(view.getByText('Loading GitHub data').first())
    .toBeVisible()
  await expect
    .element(view.getByText('Main branch rules', { exact: true }))
    .toBeVisible()
  await expect
    .element(
      view.getByText('No evaluations match these filters.', { exact: true })
    )
    .toBeVisible()
  expect(configurationReads).toBe(2)
  expect(insightReads).toBe(2)
})
