import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { IntegrationCatalogue } from '@/features/workspace/integration-catalogue'
import { CompanionIntegrations } from './companion-integrations'
import { FindingCompanionActions } from './finding-companion-actions'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'owner', organizationId: 'org' },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
let online = true,
  revoked = false,
  job = false,
  failed = false,
  fetchMock: ReturnType<typeof vi.fn>
const scope = {
  origin: 'health' as const,
  repositoryId: '120',
  assessmentId: 'assessment',
  findingId: 'b'.repeat(64),
}
beforeEach(() => {
  online = true
  revoked = false
  job = false
  failed = false
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (failed)
      return Response.json(
        { message: 'Repository access was revoked.' },
        { status: 403 }
      )
    if (url.includes('/mcp-connections')) return Response.json([])
    if (url.includes('/consent?'))
      return Response.json({
        id: 'request',
        name: 'My computer',
        agents: ['codex', 'claude'],
        repositories: [{ id: '120', name: 'fixture/repo' }],
        expiresAt: '2099-01-01',
      })
    if (url.endsWith('/revoke')) {
      revoked = true
      return Response.json({ revoked: true })
    }
    if (url.includes('/jobs?'))
      return Response.json(
        job
          ? [
              {
                id: 'job',
                agent: 'codex',
                mode: 'verify',
                state: 'RUNNING',
                createdAt: '2026-10-19',
                cancelRequested: false,
                failure: null,
              },
            ]
          : []
      )
    if (url.endsWith('/jobs') && init?.method === 'POST') {
      job = true
      return Response.json({ id: 'job' })
    }
    if (url.endsWith('/cancel')) {
      job = false
      return Response.json({ cancelled: true })
    }
    return Response.json([
      {
        id: 'connection',
        name: 'My computer',
        agents: ['codex', 'claude'],
        repositories: ['120'],
        lastSeenAt: online ? new Date().toISOString() : '2020-01-01',
        expiresAt: '2099-01-01',
        revokedAt: revoked ? '2026-10-19' : null,
      },
    ])
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <div style={{ padding: 16 }}>{children}</div>
    </QueryClientProvider>
  )
}
it('lists MCP beside GitHub with independent connection status', async () => {
  const select = vi.fn(),
    view = await mount(
      <IntegrationCatalogue
        connected
        mcpConnected={false}
        selected='mcp'
        onSelect={select}
      />
    )
  await view.getByRole('button', { name: /MCP and coding agents/ }).click()
  expect(select).toHaveBeenCalledWith('mcp')
  await expect
    .element(view.getByText('Not connected', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('textbox', { name: 'Search integrations' })
    .fill('DeepSeek')
  await expect
    .element(view.getByRole('button', { name: /MCP and coding agents/ }))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: /Connect your GitHub App/ }))
    .not.toBeInTheDocument()
})
it('keeps pairing, agent logos, download and disconnect under Integrations', async () => {
  const view = await mount(<CompanionIntegrations />)
  await view
    .getByText('Optional: run local tasks with the companion', { exact: true })
    .click()
  await expect
    .element(view.getByText('My computer', { exact: true }))
    .toBeVisible()
  await expect.element(view.getByText('Online', { exact: true })).toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'OpenAI logo' }).first())
    .toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'Claude logo' }).first())
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Download companion' }))
    .toHaveAttribute('href', expect.stringContaining('/companions/download'))
  await expect
    .element(view.getByText('Set the private token', { exact: true }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect
    .element(view.getByText('Disconnected', { exact: true }))
    .toBeVisible()
})
it('requires explicit repository selection before approving a computer', async () => {
  const view = await mount(<CompanionIntegrations requestId='request' />)
  await expect
    .element(view.getByRole('button', { name: 'Approve connection' }))
    .toBeDisabled()
  await view.getByRole('checkbox', { name: 'fixture/repo' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Approve connection' }))
    .toBeEnabled()
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/approve'))).toBe(
    false
  )
})
it('queues verification with exact finding scope and can cancel it', async () => {
  const view = await mount(
    <FindingCompanionActions scope={scope} canRun onChanged={() => {}} />
  )
  await expect
    .element(view.getByRole('button', { name: 'Verify', exact: true }))
    .toBeEnabled()
  await view.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect.element(view.getByText('Running', { exact: true })).toBeVisible()
  const call = fetchMock.mock.calls.find(
    ([url, init]) => url.endsWith('/jobs') && init?.method === 'POST'
  )
  expect(JSON.parse(call![1]!.body as string)).toMatchObject({
    scope,
    connectionId: 'connection',
    agent: 'codex',
    mode: 'verify',
  })
  await view.getByRole('button', { name: 'Cancel task' }).click()
  await expect
    .element(view.getByText('Running', { exact: true }))
    .not.toBeInTheDocument()
})
it('does not offer execution when the companion is offline or access is missing', async () => {
  online = false
  const view = await mount(
    <FindingCompanionActions
      scope={scope}
      canRun={false}
      onChanged={() => {}}
    />
  )
  await expect
    .element(view.getByRole('button', { name: 'Verify', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('link', { name: 'Manage agent connections' }))
    .toHaveAttribute(
      'href',
      expect.stringContaining('/integrations?integration=mcp')
    )
})
it('shows actionable errors instead of a successful connection', async () => {
  failed = true
  const view = await mount(<CompanionIntegrations />)
  await view
    .getByText('Optional: run local tasks with the companion', { exact: true })
    .click()
  await expect
    .element(view.getByRole('alert').first())
    .toHaveTextContent('Repository access was revoked.')
})
for (const theme of ['light', 'dark'])
  it(`keeps Integrations usable at 320px in ${theme}`, async () => {
    await page.viewport(320, 900)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await mount(<CompanionIntegrations />)
    await view
      .getByText('Optional: run local tasks with the companion', {
        exact: true,
      })
      .click()
    await expect
      .element(view.getByText('My computer', { exact: true }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  })
