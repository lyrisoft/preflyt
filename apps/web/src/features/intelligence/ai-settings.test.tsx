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
  expect(html).toContain('Models')
  expect(html).toContain('Model routing')
  expect(html).toContain('AI explanations are still being built')
  expect(html).not.toContain('Explain findings')
})
it('denies management views to developers', () => {
  state.role = 'DEVELOPER'
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Owner or Admin access is required')
  expect(html).not.toContain('Add model')
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
  expect(html).not.toContain('Add model')
})
it('starts new provider connections disabled and keeps errors in the form', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model' }).click()
  await expect
    .element(view.getByRole('checkbox', { name: 'Enable model' }))
    .not.toBeChecked()
  await view.getByRole('textbox', { name: 'Display name' }).fill('Team model')
  await view
    .getByRole('textbox', { name: 'Endpoint URL' })
    .fill('https://gateway.example.invalid/v1')
  await view.getByRole('textbox', { name: 'Model ID' }).fill('model-a')
  await view.getByLabelText('Provider key').fill('fixture-key')
  state.save.mockRejectedValueOnce(
    new Error('Connection changed. Reload before saving.')
  )
  await view.getByRole('button', { name: 'Save model' }).click()
  await expect
    .element(view.getByRole('textbox', { name: 'Display name' }))
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
    .getByRole('textbox', { name: 'Filter models' })
    .fill('Connection 20')
  await expect
    .element(view.getByRole('cell', { name: /^Connection 20/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('navigation', { name: 'Model pages' }))
    .not.toBeInTheDocument()
})

it('lets an admin approve a self-hosted model without a deployment allowlist or key', async () => {
  const view = await render(<AiSettingsPage />)
  await view.getByRole('button', { name: 'Add model' }).click()
  await view
    .getByRole('textbox', { name: 'Display name' })
    .fill('Internal model')
  await view
    .getByRole('textbox', { name: 'Endpoint URL' })
    .fill('http://model-server:4000/v1')
  await view.getByRole('combobox', { name: 'Hosting' }).selectOptions('local')
  await view.getByRole('textbox', { name: 'Model ID' }).fill('internal-model')
  await view
    .getByRole('checkbox', { name: 'Provider requires an API key' })
    .click()
  await view.getByRole('button', { name: 'Save model' }).click()
  expect(state.save).toHaveBeenCalledWith(
    '/ai/configuration/providers',
    expect.objectContaining({
      baseUrl: 'http://model-server:4000/v1',
      locality: 'local',
      requiresKey: false,
      modelId: 'internal-model',
      enabled: false,
    })
  )
})
it('shows organization-admin approval separately from connection testing', () => {
  state.query = {
    ...state.query,
    data: {
      ...configuration(),
      providers: [
        {
          id: 'model',
          name: 'Team model',
          modelId: 'model-a',
          endpoint: { baseUrl: 'https://model.example/v1' },
          approved: true,
          enabled: true,
          testStatus: 'NOT_TESTED',
        },
      ],
    },
  }
  const html = renderToStaticMarkup(<AiSettingsPage />)
  expect(html).toContain('Approved')
  expect(html).toContain('Not tested')
})
