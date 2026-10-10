import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { GatePolicyPanel } from './gate-policy-panel'

const state = vi.hoisted(() => ({
  selection: 'selection' as string | null,
  owned: false,
  policyState: 'DRAFT',
  policySelection: 'selection',
  count: 1,
  fetch: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string
    search: Record<string, string>
    children: ReactNode
  }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('./repository-queries', () => ({
  useStandards: () => ({
    isPending: false,
    isError: false,
    data: {
      catalogue: [{ id: 'baseline', version: '1.0.0', digest: 'b'.repeat(64), title: 'Baseline Engineering', description: 'Baseline checks', rules: [{ id: 'tests', title: 'Tests', requiredIn: ['RECOMMENDED'] }, { id: 'lint', title: 'Lint', requiredIn: [] }] }],
      recommendations: [{ id: 'baseline', version: '1.0.0' }],
      controls: [
        { id: 'tests', title: 'Tests', required: true },
        { id: 'lint', title: 'Lint', required: false },
      ],
      selection: {
        id: 'selection',
        packs: [{ id: 'baseline', version: '1.0.0' }],
      },
    },
  }),
}))
vi.mock('./engineering-queries', () => ({
  engineeringPath: (_id: string, p: string) => `/fixture${p}`,
  engineeringRead: async () => ({
    currentSelectionId: state.selection,
    truncated: false,
    revisions: Array.from({ length: state.count }, (_, i) => ({
      id: `policy-${i}`,
      branchRef: 'refs/heads/main',
      revision: state.count - i,
      selectionId: state.policySelection,
      state: state.policyState,
      definitionHash: 'a'.repeat(64),
      draftedById: 'author',
      approvedById: null,
      definition: {
        ...(state.owned ? { standardsSource: 'POLICY' } : {}),
        mode: 'OBSERVE',
        packs: [{ id: 'baseline', version: '1.0.0', digest: 'b'.repeat(64) }],
        rules: [
          {
            id: 'tests',
            title: 'Tests',
            required: true,
            capability: 'import_only',
          },
        ],
      },
    })),
  }),
}))
beforeEach(async () => {
  await page.viewport(1280, 900)
  state.selection = state.policySelection = 'selection'
  state.owned = false
  state.policyState = 'DRAFT'
  state.count = 1
  state.fetch.mockReset().mockResolvedValue(
    new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', state.fetch)
})
async function mount(canPublish = true, actorId = 'author') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = await render(
    <QueryClientProvider client={client}>
      <div className='p-6'>
        <GatePolicyPanel
          repositoryId='101'
          initialBranch='main'
          canDraft
          canPublish={canPublish}
          actorId={actorId}
        />
      </div>
    </QueryClientProvider>
  )
  return { view, client }
}
it('creates a policy by selecting the branch and standards directly', async () => {
  const { view } = await mount()
  await page.getByRole('button', { name: 'New policy' }).click()
  await expect
    .element(page.getByRole('textbox', { name: 'Branch name' }))
    .toHaveValue('main')
  await expect.element(page.getByText('Baseline Engineering', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create policy' }).click()
  await expect
    .poll(() => state.fetch.mock.calls[0]?.[1]?.body)
    .toBe(
      JSON.stringify({
        branchRef: 'refs/heads/main',
        standards: { profile: 'RECOMMENDED', packs: [{ id: 'baseline', version: '1.0.0', digest: 'b'.repeat(64) }] },
        requiredRules: [],
      })
    )
  await view.unmount()
})
it('blocks approval of a self-authored draft and keeps publication separate', async () => {
  const { view } = await mount()
  await page.getByRole('button', { name: 'Review main version 1' }).click()
  await expect
    .element(page.getByRole('button', { name: 'Approve policy' }))
    .toBeDisabled()
  await expect
    .element(page.getByRole('button', { name: 'Publish policy' }))
    .toBeDisabled()
  await expect
    .element(page.getByText('Another authorized publisher', { exact: false }))
    .toBeVisible()
  expect(state.fetch).not.toHaveBeenCalled()
  await view.unmount()
})
it('does not require repository standards and does not block creation when repository defaults change', async () => {
  state.selection = null
  const { view, client } = await mount()
  await page.getByRole('button', { name: 'New policy' }).click()
  await expect.element(page.getByRole('button', { name: 'Create policy' })).toBeEnabled()
  state.selection = 'changed-selection'
  await client.invalidateQueries({ queryKey: ['gate-policies', '101'] })
  await expect.element(page.getByRole('button', { name: 'Create policy' })).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Baseline Engineering', exact: false }).click()
  await expect.element(page.getByRole('button', { name: 'Create policy' })).toBeDisabled()
  expect(state.fetch).not.toHaveBeenCalled()
  await view.unmount()
})
it('keeps a policy with its own standards current after repository defaults change', async () => {
  state.owned = true
  state.selection = 'other-selection'
  const { view } = await mount(true, 'reviewer')
  await page.getByRole('button', { name: 'Review main version 1' }).click()
  await expect.element(page.getByRole('button', { name: 'Approve policy' })).toBeEnabled()
  await expect.element(page.getByText('Standards changed', { exact: true })).not.toBeInTheDocument()
  await view.unmount()
})
it('offers an explicit protection review after publication without performing activation', async () => {
  state.policyState = 'PUBLISHED'
  const { view } = await mount()
  await page.getByRole('button', { name: 'Review main version 1' }).click()
  await expect
    .element(page.getByRole('link', { name: 'Review merge protection' }))
    .toHaveAttribute(
      'href',
      '/quality-gates?repository=101&gate=rulesets&rulesetView=drafts'
    )
  await expect
    .element(page.getByText('Published', { exact: true }).last())
    .toHaveClass('text-success-text')
  expect(state.fetch).not.toHaveBeenCalled()
  await view.unmount()
})
it('bounds policy history to five rows while preserving older revisions', async () => {
  state.count = 8
  const { view } = await mount()
  await expect
    .element(page.getByRole('button', { name: 'Review main version 8' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Review main version 1' }))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect
    .element(page.getByRole('button', { name: 'Review main version 1' }))
    .toBeVisible()
  await view.unmount()
})

it('fits the standards picker and create action at 320px in both themes', async () => {
  await page.viewport(320, 780)
  document.documentElement.classList.add('dark')
  const { view } = await mount()
  await page.viewport(320, 780)
  await page.getByRole('button', { name: 'New policy' }).click()
  await expect.element(page.getByRole('button', { name: 'Create policy' })).toBeVisible()
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth)
  await page.screenshot({ path: 'src/features/repositories/__screenshots__/branch-policy-dark-mobile.png' })
  document.documentElement.classList.remove('dark')
  await page.screenshot({ path: 'src/features/repositories/__screenshots__/branch-policy-light-mobile.png' })
  await view.unmount()
})
