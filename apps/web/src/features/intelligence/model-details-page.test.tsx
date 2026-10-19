import '@/styles/index.css'
import { beforeEach, it, expect, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { ModelDetailsPage } from './model-details-page'

const state = vi.hoisted(() => ({
  role: 'OWNER',
  query: {} as Record<string, unknown>,
  useQuery: vi.fn(),
  request: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    state.useQuery(options)
    return state.query
  },
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { role: state.role, identityId: 'actor', organizationId: 'org' },
  }),
  canAdminister: (role: string) => ['OWNER', 'ADMIN'].includes(role),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.request(...args),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...props
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
  }) => (
    <a
      {...props}
      href={
        to.replace('$repositoryId', params?.repositoryId ?? '') +
        (search ? '?' + new URLSearchParams(search) : '')
      }
    >
      {children}
    </a>
  ),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@/components/layout/main', () => ({
  Main: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
const id = '11111111-1111-4111-8111-111111111111'
const data = () => ({
  provider: {
    id,
    name: 'DeepSeek connection',
    modelId: 'current-model',
    revision: 2,
    enabled: true,
    testStatus: 'CONNECTED',
    testedAt: null,
    baseUrl: 'https://api.example.invalid',
  },
  totals: {
    inputTokens: 12000,
    outputTokens: 1200,
    cachedTokens: 4000,
    requests: 3,
    unreportedInput: 1,
    unreportedOutput: 1,
  },
  byModel: [
    {
      modelId: 'older-model',
      inputTokens: 12000,
      outputTokens: 1200,
      requests: 3,
    },
  ],
  activity: [
    {
      sourceId: '22222222-2222-4222-8222-222222222222',
      workload: 'VAPT',
      modelId: 'older-model',
      repository: { githubId: '51', fullName: 'org/repo' },
      requests: 3,
      failedRequests: 1,
      unreportedRequests: 1,
      inputTokens: 12000,
      outputTokens: 1200,
      lastUsedAt: '2026-10-18T12:00:00Z',
    },
  ],
  legacyVapt: [
    {
      assessmentId: '33333333-3333-4333-8333-333333333333',
      providerRevision: 1,
      modelId: null,
      repository: { githubId: '51', fullName: 'org/repo' },
      inputTokens: 4000000,
      outputTokens: 8192,
      modelCalls: 35,
      createdAt: '2026-10-18T11:00:00Z',
    },
  ],
  total: 11,
})
beforeEach(() => {
  state.role = 'OWNER'
  state.useQuery.mockClear()
  state.request.mockReset()
  state.query = {
    data: data(),
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }
})
it('shows reported tokens separately from legacy allowances and preserves historical model identity', async () => {
  const view = await render(<ModelDetailsPage providerId={id} />)
  await expect
    .element(view.getByRole('heading', { name: 'DeepSeek connection' }))
    .toBeVisible()
  await expect
    .element(view.getByText('12,000', { exact: true }).first())
    .toBeVisible()
  await expect
    .element(
      view.getByText(
        'Some requests did not return token counts. Totals include reported counts only.'
      )
    )
    .toBeVisible()
  await expect
    .element(view.getByText('older-model', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Model name not recorded (revision 1)'))
    .toBeVisible()
  const links = document.querySelectorAll('a[href*="health="]')
  expect(links.length).toBe(2)
  expect(
    document.querySelectorAll(
      '[aria-labelledby="usage-activity-title"] [aria-label="Table pagination"]'
    ).length
  ).toBe(1)
  expect(state.useQuery.mock.lastCall?.[0].queryKey).toEqual([
    'ai-model-details',
    'actor',
    'org',
    id,
    30,
    1,
    10,
  ])
})
it('does not display cached usage after an authorization error or request it for a non-administrator', async () => {
  state.query = {
    data: data(),
    isError: true,
    error: new Error('Access revoked'),
    refetch: vi.fn(),
  }
  const view = await render(<ModelDetailsPage providerId={id} />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Access revoked')
  await expect
    .element(view.getByRole('heading', { name: 'Recorded usage' }))
    .not.toBeInTheDocument()
  await view.unmount()
  state.role = 'DEVELOPER'
  state.useQuery.mockClear()
  const denied = await render(<ModelDetailsPage providerId={id} />)
  await expect
    .element(
      denied.getByText(
        'Only organization administrators can view model details.'
      )
    )
    .toBeVisible()
  expect(state.useQuery).not.toHaveBeenCalled()
})
it('keeps unknown totals distinct from zero and requests the selected period and page', async () => {
  state.query = {
    ...state.query,
    data: {
      ...data(),
      totals: {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        requests: 0,
        unreportedInput: 0,
        unreportedOutput: 0,
      },
      byModel: [],
      activity: [],
      legacyVapt: [],
    },
  }
  const view = await render(<ModelDetailsPage providerId={id} />)
  await expect
    .element(
      view.getByText(
        'No model usage recorded for this period. New requests will appear here.'
      )
    )
    .toBeVisible()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  expect(state.useQuery.mock.lastCall?.[0].queryKey).toEqual([
    'ai-model-details',
    'actor',
    'org',
    id,
    30,
    2,
    10,
  ])
  const signal = new AbortController().signal
  await state.useQuery.mock.lastCall?.[0].queryFn({ signal })
  expect(state.request).toHaveBeenCalledWith(
    `/ai/configuration/providers/${id}/usage?days=30&page=2&pageSize=10`,
    undefined,
    signal
  )
})
it('keeps the model page within 320px in both themes', async () => {
  await page.viewport(320, 900)
  await render(<ModelDetailsPage providerId={id} />)
  try {
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    }
  } finally {
    document.documentElement.classList.remove('dark')
    await page.viewport(1280, 900)
  }
})
