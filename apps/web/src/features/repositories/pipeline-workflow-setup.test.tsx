import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PipelineWorkflowSetup } from './pipeline-workflow-setup'

const state = vi.hoisted(() => ({
  request: vi.fn(),
  available: true,
  canManage: true,
}))
vi.mock('./governance-api', () => ({
  governanceRequest: (...args: unknown[]) => state.request(...args),
}))
vi.mock('../workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    data: {
      identityId: 'owner',
      organizationId: 'org',
      permissions: ['ai.review.run'],
      organizationWide: true,
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('./yaml-workflow-editor', () => ({
  YamlWorkflowEditor: ({ value, label }: { value: string; label: string }) => (
    <pre aria-label={label}>{value}</pre>
  ),
}))
vi.mock('./workflow-snippet', () => ({
  WorkflowSnippet: () => <p>Workflow preview</p>,
}))
beforeEach(() => {
  state.available = true
  state.request.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith('/standalone/generate'))
      return {
        workflow: '# AI source-backed draft',
        summary: 'Reuses the API CI setup.',
        model: 'Local model',
        skill: { name: 'Preflyt CI setup', version: 1 },
        notes: ['Review the database secret.'],
        setupSources: ['.github/workflows/ci.yml → api'],
      }
    if (path.includes('/standalone?'))
      return {
        workflow: '# Original draft',
        original: '',
        path: '.github/workflows/preflyt.yml',
        baseSha: 'a'.repeat(40),
        branch: 'development',
        exists: false,
        notes: [],
        setupSources: [],
      }
    return {
      apiUrl: 'https://preflyt.example',
      branch: 'refs/heads/development',
      available: true,
      enabled: false,
      checks: [],
      submissions: [],
      setupPr: null,
      write: { available: true, reason: null },
      ai: {
        available: state.available,
        model: 'Local model',
        reason: state.available ? null : 'Source sharing is disabled.',
      },
    }
  })
})
async function show(canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PipelineWorkflowSetup
        repositoryId='51'
        policyId='policy'
        canManage={canManage}
      />
    </QueryClientProvider>
  )
}
it('generates without mandatory instructions, shows a reviewable proposal, and writes nothing until explicitly requested', async () => {
  const view = await show()
  await view.getByRole('button', { name: 'Generate workflow with AI' }).click()
  await expect.element(view.getByText('Reuses the API CI setup.')).toBeVisible()
  await expect
    .element(view.getByText('Preflyt CI setup · version 1'))
    .toBeVisible()
  await expect
    .element(view.getByText('Review the database secret.'))
    .toBeVisible()
  expect(
    state.request.mock.calls.find(([path]) =>
      path.endsWith('/standalone/generate')
    )?.[1]
  ).toMatchObject({
    policyId: 'policy',
    baseSha: 'a'.repeat(40),
    instructions: '',
  })
  await expect
    .element(view.getByRole('button', { name: 'Create setup PR' }))
    .toBeDisabled()
  expect(
    state.request.mock.calls.some(([path]) => path.includes('/pull-request'))
  ).toBe(false)
  await view.getByRole('button', { name: 'Use this draft' }).click()
  await expect
    .element(view.getByLabelText('Proposed standalone workflow'))
    .toHaveTextContent('# AI source-backed draft')
})
it('explains unavailable AI and retains manual setup without a generation request', async () => {
  state.available = false
  const view = await show()
  await expect
    .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
    .toBeDisabled()
  await expect
    .element(view.getByRole('status'))
    .toHaveTextContent('Source sharing is disabled.')
  await expect
    .element(view.getByRole('button', { name: 'Edit YAML' }))
    .toBeEnabled()
  expect(
    state.request.mock.calls.some(([path]) => path.endsWith('/generate'))
  ).toBe(false)
})
it('hides generation from read-only users and fits a narrow viewport', async () => {
  await page.viewport(375, 812)
  try {
    const view = await show(false)
    await expect.element(view.getByText('Workflow preview')).toBeVisible()
    await expect
      .element(view.getByRole('button', { name: 'Generate workflow with AI' }))
      .not.toBeInTheDocument()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  } finally {
    await page.viewport(1280, 800)
  }
})
