import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { AiSettingsPage } from './ai-settings'

const state = vi.hoisted(() => ({
  role: 'OWNER',
  query: {} as Record<string, unknown>,
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { role: state.role, identityId: 'owner', organizationId: 'org' },
  }),
  canAdminister: (role: string) => ['OWNER', 'ADMIN'].includes(role),
}))
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.save(...args),
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@/components/layout/main', () => ({
  Main: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
const configuration = () => ({
  enabled: true,
  executionAvailable: false,
  endpoints: [
    {
      id: 'gateway',
      name: 'Approved gateway',
      baseUrl: 'https://gateway.example.invalid/v1',
      locality: 'hosted',
      requiresKey: true,
      models: ['model-a'],
    },
  ],
  providers: [],
  routes: [],
  stages: ['pull_request'],
})
beforeEach(() => {
  state.role = 'OWNER'
  state.query = {
    data: configuration(),
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }
  state.save.mockReset().mockResolvedValue({})
  state.invalidate.mockReset().mockResolvedValue({})
})
it('keeps connections and routing separate without promising inference', () => {
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Connections')
  expect(html).toContain('Model routing')
  expect(html).toContain('AI explanations are still being built')
  expect(html).not.toContain('Explain findings')
})
it('denies management views to developers', () => {
  state.role = 'DEVELOPER'
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Owner or Admin access is required')
  expect(html).not.toContain('Add connection')
})
it('shows deployment-disabled and request-failure states without old settings', () => {
  state.query = { data: { ...configuration(), enabled: false } }
  expect(renderToStaticMarkup(<AiSettingsPage />)).toContain('AI is disabled')
  state.query = {
    isError: true,
    data: configuration(),
    error: new Error('Access revoked'),
  }
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Access revoked')
  expect(html).not.toContain('Add connection')
})
it('starts new provider connections disabled and keeps errors in the form', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add connection' }).click()
  await expect
    .element(view.getByRole('checkbox', { name: 'Enable connection' }))
    .not.toBeChecked()
  await view
    .getByRole('textbox', { name: 'Connection name' })
    .fill('Team model')
  await view.getByLabelText('Provider key').fill('fixture-key')
  state.save.mockRejectedValueOnce(
    new Error('Connection changed. Reload before saving.')
  )
  await view.getByRole('button', { name: 'Save connection' }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Connection name' }))
    .toHaveValue('Team model')
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers',
    expect.objectContaining({
      enabled: false,
      expectedRevision: 0,
      apiKey: 'fixture-key',
    })
  )
})
it('starts routing disabled with source sharing off and bounded defaults', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('tab', { name: 'Model routing' }).click()
  await view.getByRole('button', { name: 'Configure' }).click()
  await expect
    .element(view.getByRole('checkbox', { name: 'Enable route' }))
    .not.toBeChecked()
  await expect
    .element(
      view.getByRole('checkbox', { name: 'Allow repository source sharing' })
    )
    .not.toBeChecked()
  await view.getByRole('button', { name: 'Save routing' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/routes/pull_request',
    expect.objectContaining({
      allowSource: false,
      enabled: false,
      maxInputTokens: 8000,
      maxOutputTokens: 1000,
      dailyBudgetCents: 1000,
      expectedRevision: 0,
    })
  )
})
it('paginates connections and resets pagination when filtering', async () => {
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      providers: Array.from({ length: 21 }, (_, i) => ({
        id: `connection-${i}`,
        name: `Connection ${String(i).padStart(2, '0')}`,
        endpointId: 'gateway',
        modelId: 'model-a',
        enabled: false,
        revision: 1,
        testStatus: 'NOT_TESTED',
        apiKeySet: false,
      })),
    },
  }
  const view = await render(<AiSettingsPage />)
  await expect
    .element(view.getByRole('cell', { name: /^Connection 00/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('cell', { name: /^Connection 10/ }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByRole('cell', { name: /^Connection 10/ }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Filter connections' })
    .fill('Connection 20')
  await expect
    .element(view.getByRole('cell', { name: /^Connection 20/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('navigation', { name: 'Connection pages' }))
    .not.toBeInTheDocument()
})
