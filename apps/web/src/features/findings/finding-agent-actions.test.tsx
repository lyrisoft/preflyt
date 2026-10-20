import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { FindingAgentActions } from './finding-agent-actions'
import type { Finding } from './finding-types'

vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: { identityId: 'owner', organizationId: 'org' },
  }),
}))
vi.mock('@/features/companions/finding-companion-actions', () => ({
  FindingCompanionActions: () => (
    <a href='/integrations?integration=mcp'>Manage agent connections</a>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const finding = {
  id: 'b'.repeat(64),
  repositoryId: '120',
  repository: 'fixture/repo',
  sourceSha: 'a'.repeat(40),
  assessmentId: 'assessment',
  category: 'security',
} as Finding
let hosted = true
let hostedClients = ['Codex', 'Claude Code']
let hostedRepositories = ['120']
let active = false,
  canConnect = true,
  failed = false
let evidence: unknown[] = []
const token = 'pfv_' + 'x'.repeat(43)
let clipboard: ReturnType<typeof vi.spyOn>, fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  hosted = true
  hostedClients = ['Codex', 'Claude Code']
  hostedRepositories = ['120']
  active = false
  canConnect = true
  failed = false
  evidence = []
  clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (failed)
      return Response.json(
        { message: 'Repository access was revoked.' },
        { status: 403 }
      )
    if (url.includes('/mcp-connections'))
      return Response.json(
        hosted
          ? hostedClients.map((clientName, n) => ({
              id: String(n),
              clientName,
              repositories: hostedRepositories,
              scopes: 'findings:read findings:review',
              expiresAt: '2099-01-01',
              revokedAt: null,
            }))
          : []
      )
    if (url.includes('/launch-task?'))
      return Response.json({
        prompt: `Verify fixture/repo at ${finding.sourceSha}. MCP scope: finding ${finding.id}`,
        repository: finding.repository,
      })
    if (url.includes('/task?'))
      return Response.json({
        task:
          'Verify the assessed commit ' +
          finding.sourceSha +
          '; source line 12: return run(input)',
      })
    if (url.endsWith('/connections')) {
      active = true
      return Response.json({
        id: 'grant',
        token,
        expiresAt: '2099-01-01T00:00:00Z',
      })
    }
    if (url.endsWith('/revoke')) {
      active = false
      return Response.json({ revoked: true })
    }
    return Response.json({
      canConnect,
      grants: active
        ? [{ id: 'grant', expiresAt: '2099-01-01T00:00:00Z', revokedAt: null }]
        : [],
      evidence,
    })
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
async function mount(manual = true) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <div style={{ padding: 16 }}>
        <FindingAgentActions
          finding={finding}
          origin='health'
          manual={manual}
        />
      </div>
    </QueryClientProvider>
  )
}
it('copies the commit-bound task without creating a connection', async () => {
  const view = await mount()
  await view
    .getByRole('button', { name: 'Copy verification task', exact: true })
    .click()
  await expect
    .poll(() => clipboard.mock.calls[0]?.[0])
    .toContain(finding.sourceSha)
  expect(
    fetchMock.mock.calls.some(([url]) => url.endsWith('/connections'))
  ).toBe(false)
})
it('offers both client configurations without embedding the private token and supports revocation', async () => {
  const view = await mount()
  await view.getByRole('button', { name: 'Connect agent', exact: true }).click()
  await expect
    .element(page.getByRole('img', { name: 'OpenAI logo', exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('img', { name: 'Claude logo', exact: true }))
    .toBeVisible()
  await expect
    .element(
      page.getByRole('button', { name: 'Create connection', exact: true })
    )
    .toBeEnabled()
  await page
    .getByRole('button', { name: 'Create connection', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Copy configuration', exact: true })
    .click()
  expect(clipboard.mock.calls.at(-1)?.[0]).toContain('bearer_token_env_var')
  expect(clipboard.mock.calls.at(-1)?.[0]).not.toContain(token)
  await page.getByRole('button', { name: 'Claude Code', exact: true }).click()
  await page
    .getByRole('button', { name: 'Copy configuration', exact: true })
    .click()
  const config = JSON.parse(clipboard.mock.calls.at(-1)![0])
  expect(config.mcpServers.preflyt_finding.headers.Authorization).toBe(
    'Bearer ${PREFLYT_FINDING_TOKEN}'
  )
  await page
    .getByRole('button', { name: 'Copy private token', exact: true })
    .click()
  expect(clipboard.mock.calls.at(-1)?.[0]).toBe(token)
  await page.getByText('Your active connections (1)', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Revoke connection', exact: true })
    .click()
  await expect
    .element(
      page.getByRole('button', { name: 'Create connection', exact: true })
    )
    .toBeVisible()
  expect(
    fetchMock.mock.calls.find(([url]) => url.endsWith('/revoke'))?.[1]?.body
  ).toBe(JSON.stringify({ id: 'grant' }))
})
it('prevents users without review permission from creating a connection', async () => {
  canConnect = false
  const view = await mount()
  await view.getByRole('button', { name: 'Connect agent', exact: true }).click()
  await expect
    .element(
      page.getByText(
        'You need permission to run AI reviews for this repository.'
      )
    )
    .toBeVisible()
  await expect
    .element(
      page.getByRole('button', { name: 'Create connection', exact: true })
    )
    .toBeDisabled()
})
it('shows copy failures instead of reporting success', async () => {
  const view = await mount()
  failed = true
  await view
    .getByRole('button', { name: 'Copy verification task', exact: true })
    .click()
  await expect
    .element(page.getByText('Repository access was revoked.'))
    .toBeVisible()
  expect(clipboard).not.toHaveBeenCalled()
})

it('shows returned evidence as an external report with its commands and results', async () => {
  evidence = [
    {
      id: 'evidence-1',
      kind: 'verification',
      createdAt: '2026-10-19T01:00:00Z',
      content: {
        agent: 'Codex',
        outcome: 'INCONCLUSIVE',
        reasoning: 'The source path needs execution evidence.',
        commands: 'No commands executed.',
        results: 'Source review only.',
      },
    },
  ]
  const view = await mount()
  await expect
    .element(view.getByText('External report', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Review inconclusive', { exact: true }))
    .toBeVisible()
  await view.getByText('Commands and results', { exact: true }).click()
  await expect.element(view.getByText(/No commands executed/)).toBeVisible()
})

it('keeps setup usable at 320px in both themes', async () => {
  await page.viewport(320, 800)
  const view = await mount()
  await view.getByRole('button', { name: 'Connect agent', exact: true }).click()
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await expect
      .element(
        page.getByRole('heading', {
          name: 'Connect a coding agent',
          exact: true,
        })
      )
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  }
})

it('opens connected coding-agent drafts without a companion or creating credentials', async () => {
  const view = await mount(false)
  for (const [name, protocol, parameter] of [
    ['Codex', 'codex:', 'prompt'],
    ['Claude Code', 'claude:', 'q'],
  ]) {
    const link = view.getByRole('link', {
      name: `Open in ${name}`,
      exact: true,
    })
    await expect.element(link).toBeVisible()
    const url = new URL(link.element().getAttribute('href')!)
    expect(url.protocol).toBe(protocol)
    expect(url.searchParams.get(parameter)).toContain(finding.sourceSha)
    expect(url.searchParams.get(parameter)).toContain(finding.id)
    expect(url.href).not.toContain(token)
  }
  expect(
    fetchMock.mock.calls.some(([url]) => url.endsWith('/connections'))
  ).toBe(false)
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/companion'))).toBe(
    false
  )
  for (const dark of [false, true]) {
    await page.viewport(320, 800)
    document.documentElement.classList.toggle('dark', dark)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  }
})
it('keeps copy available when no supported coding agent is connected', async () => {
  hosted = false
  const view = await mount(false)
  await expect
    .element(view.getByRole('link', { name: 'Open in Codex', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(
      view.getByRole('button', { name: 'Copy verification task', exact: true })
    )
    .toBeEnabled()
  await expect
    .element(
      view.getByText(
        'Copy the verification task into your coding agent. Manage its Preflyt access in Integrations.'
      )
    )
    .toBeVisible()
})

it('shows DeepSeek Harness as a connected agent and copies its task without creating credentials or a desktop link', async () => {
  hostedClients = ['DeepSeek Harness']
  const view = await mount(false)
  await view
    .getByRole('button', {
      name: 'Copy task for DeepSeek Harness',
      exact: true,
    })
    .click()
  await expect
    .poll(() => clipboard.mock.calls[0]?.[0])
    .toContain(finding.sourceSha)
  await expect
    .element(view.getByRole('link', { name: /Open in/ }))
    .not.toBeInTheDocument()
  expect(
    fetchMock.mock.calls.some(
      ([url]) => url.endsWith('/connections') || url.includes('/launch-task?')
    )
  ).toBe(false)
  await expect
    .element(
      view.getByText(
        'Paste the copied task into the named agent and send it to start.'
      )
    )
    .toBeVisible()
})

it('shows all connected MCP clients once alongside supported desktop links', async () => {
  hostedClients = [
    'Codex',
    'DeepSeek Harness',
    'Custom MCP agent',
    'DeepSeek Harness',
  ]
  const view = await mount(false)
  await expect
    .element(view.getByRole('link', { name: 'Open in Codex', exact: true }))
    .toBeVisible()
  await expect
    .element(
      view.getByRole('button', {
        name: 'Copy task for DeepSeek Harness',
        exact: true,
      })
    )
    .toBeVisible()
  await expect
    .element(view.getByRole('img', { name: 'DeepSeek logo', exact: true }))
    .toBeVisible()
  await view
    .getByRole('button', {
      name: 'Copy task for Custom MCP agent',
      exact: true,
    })
    .click()
  await expect
    .poll(() => clipboard.mock.calls.at(-1)?.[0])
    .toContain(finding.sourceSha)
  expect(view.container.querySelectorAll('button').length).toBe(3)
  for (const dark of [false, true]) {
    await page.viewport(320, 800)
    document.documentElement.classList.toggle('dark', dark)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  }
})

it('shows a connected agent that needs repository approval without offering a task or creating access', async () => {
  hostedClients = ['DeepSeek Harness']
  hostedRepositories = ['other']
  const view = await mount(false)
  const link = view.getByRole('link', {
    name: 'Manage DeepSeek Harness access',
    exact: true,
  })
  await expect.element(link).toBeVisible()
  expect(link.element().getAttribute('href')).toBe(
    '/integrations?integration=mcp'
  )
  await expect
    .element(
      view.getByRole('button', {
        name: 'Copy task for DeepSeek Harness',
        exact: true,
      })
    )
    .not.toBeInTheDocument()
  expect(
    fetchMock.mock.calls.some(
      ([url]) =>
        url.includes('/launch-task?') ||
        url.includes('/task?') ||
        url.endsWith('/connections')
    )
  ).toBe(false)
})

it('keeps desktop links disabled when the task fails its access check', async () => {
  const normalFetch = fetchMock.getMockImplementation()! as (
    url: string,
    init?: RequestInit
  ) => Promise<Response>
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    url.includes('/launch-task?')
      ? Promise.resolve(
          Response.json(
            { message: 'Repository access was revoked.' },
            { status: 403 }
          )
        )
      : normalFetch(url, init)
  )
  const view = await mount(false)
  await expect
    .element(view.getByText('Repository access was revoked.'))
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Open in Codex', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: 'Open in Codex', exact: true }))
    .toBeDisabled()
  await expect
    .element(
      view.getByRole('button', { name: 'Retry agent links', exact: true })
    )
    .toBeVisible()
})
