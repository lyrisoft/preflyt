import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { CompanionIntegrations } from './companion-integrations'
import { HostedMcpIntegrations } from './hosted-mcp-integrations'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'owner', organizationId: 'org' },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
let fetchMock: ReturnType<typeof vi.fn>,
  clipboard: ReturnType<typeof vi.spyOn>,
  denied = false,
  revoked = false
beforeEach(() => {
  denied = false
  revoked = false
  clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  fetchMock = vi.fn(async (url: string) => {
    if (denied)
      return Response.json({ message: 'Access denied.' }, { status: 403 })
    if (url.includes('/consent?'))
      return Response.json({
        id: 'request',
        clientName: 'Native MCP client',
        redirectUri: 'http://127.0.0.1:5555/callback',
        scopes: ['findings:read', 'findings:review'],
        repositories: [{ id: '120', name: 'fixture/repo' }],
        expiresAt: '2099-01-01',
      })
    if (url.endsWith('/mcp-connections/revoke')) {
      revoked = true
      return Response.json({ revoked: true })
    }
    if (url.endsWith('/mcp-connections'))
      return Response.json([
        {
          id: 'connection',
          clientName: 'Native MCP client',
          repositories: ['120'],
          scopes: 'findings:read findings:review',
          expiresAt: '2099-01-01',
          revokedAt: revoked ? '2026-10-19' : null,
          lastUsedAt: '2026-10-19',
        },
      ])
    return Response.json([])
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
it('makes the hosted endpoint default and keeps the companion collapsed', async () => {
  const view = await mount(<CompanionIntegrations />)
  await expect
    .element(
      view.getByRole('heading', { name: 'Connect your agent', exact: true })
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'OpenAI logo' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'Claude logo' }))
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Download companion' }))
    .not.toBeInTheDocument()
  expect(view.container.textContent).not.toContain('PREFLYT_FINDING_TOKEN')
  await expect
    .element(
      view.getByText('Optional: run local tasks with the companion', {
        exact: true,
      })
    )
    .toBeVisible()
})
it('copies native connection commands without private tokens or a downloaded script', async () => {
  const view = await mount(<HostedMcpIntegrations />)
  await view.getByRole('button', { name: 'Copy command', exact: true }).click()
  expect(clipboard.mock.calls[0][0]).toContain('codex mcp add preflyt --url')
  expect(clipboard.mock.calls[0][0]).toContain('codex mcp login preflyt')
  expect(clipboard.mock.calls[0][0]).not.toMatch(/TOKEN|\.mjs|Bearer/)
  await view.getByRole('button', { name: 'Claude Code', exact: true }).click()
  await view.getByRole('button', { name: 'Copy command', exact: true }).click()
  expect(clipboard.mock.calls[1][0]).toContain(
    'claude mcp add --transport http --scope user preflyt'
  )
  await expect
    .element(view.getByText(/Then run \/mcp in Claude Code/))
    .toBeVisible()
})
it('requires explicit repository consent and displays the registered return address', async () => {
  const view = await mount(<HostedMcpIntegrations requestId='request' />)
  await expect
    .element(view.getByText('Return address: http://127.0.0.1:5555/callback'))
    .toBeVisible()
  await expect
    .element(view.getByRole('button', { name: 'Approve access', exact: true }))
    .toBeDisabled()
  await view.getByRole('checkbox', { name: 'fixture/repo' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Approve access', exact: true }))
    .toBeEnabled()
  expect(fetchMock.mock.calls.some(([u]) => u.endsWith('/approve'))).toBe(false)
})
it('disconnects a hosted connection and displays the result', async () => {
  const view = await mount(<HostedMcpIntegrations />)
  await expect
    .element(view.getByText('Connected', { exact: true }))
    .toBeVisible()
  await view
    .getByRole('button', { name: 'Disconnect agent', exact: true })
    .click()
  await expect
    .element(view.getByText('Disconnected', { exact: true }))
    .toBeVisible()
})
it('shows a permission error without suggesting success', async () => {
  denied = true
  const view = await mount(<HostedMcpIntegrations />)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Access denied.')
  await expect
    .element(view.getByText('Connected', { exact: true }))
    .not.toBeInTheDocument()
})
for (const theme of ['light', 'dark'])
  it(`fits hosted setup at 320px in ${theme}`, async () => {
    await page.viewport(320, 900)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const view = await mount(<HostedMcpIntegrations />)
    await expect
      .element(
        view.getByRole('heading', { name: 'Connect your agent', exact: true })
      )
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  })
