import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RulesetDeployments } from './ruleset-deployments'

const { toastError, toastSuccess, toastWarning } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, warning: toastWarning },
}))

const message =
  'A current automatically published passing PR check is required on main before activation'
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
  toastError.mockClear()
  toastSuccess.mockClear()
  toastWarning.mockClear()
})

it('notifies failed activation once and keeps its actionable error in the drawer', async () => {
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST')
      return new Response(JSON.stringify({ message }), { status: 409 })
    if (url.includes('ruleset-drafts'))
      return new Response(JSON.stringify({ drafts: [] }))
    return new Response(
      JSON.stringify({
        enabled: true,
        canSelfApprove: true,
        hasMore: false,
        deployments: [
          {
            id: 'deployment-1',
            state: 'APPROVED',
            draftId: 'draft-1',
            proposedById: 'actor-1',
            approvedById: 'actor-1',
            approvalKind: 'SUPER_ADMIN_SELF_APPROVAL',
            previewHash: 'preview-1',
            definition: {},
            preview: { impacts: [] },
            githubRulesetId: null,
            message: null,
            verifiedAt: null,
          },
        ],
      })
    )
  })
  vi.stubGlobal('fetch', request)
  await render(
    <QueryClientProvider client={client}>
      <RulesetDeployments
        repositoryId='1411149123'
        actorId='actor-1'
        canManage
      />
    </QueryClientProvider>
  )
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page
    .getByRole('button', { name: 'Activate on GitHub', exact: true })
    .click()
  expect(
    request.mock.calls.filter(([, options]) => options?.method === 'POST')
  ).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Confirm activation', exact: true })
    .click()
  await expect
    .poll(() => toastError.mock.calls)
    .toEqual([[message, { id: 'ruleset-operation:1411149123:deploy' }]])
  const drawer = page.getByRole('dialog')
  await expect.element(drawer.getByRole('alert')).toHaveTextContent(message)
  await expect
    .element(
      drawer.getByRole('button', { name: 'Confirm activation', exact: true })
    )
    .toBeEnabled()
  expect(
    request.mock.calls.filter(([, options]) => options?.method === 'POST')
  ).toHaveLength(1)
})

it('keeps verification open, shows external differences and does not permit blind rollback', async () => {
  const deployment = {
    id: 'deployment-drift',
    state: 'ACTIVE',
    draftId: 'draft-1',
    proposedById: 'actor-1',
    approvedById: 'actor-1',
    approvalKind: 'SUPER_ADMIN_SELF_APPROVAL',
    previewHash: 'preview-1',
    definition: { name: 'Original', enforcement: 'active' },
    preview: { impacts: [] },
    githubRulesetId: '24877238',
    message: null,
    verifiedAt: null,
  }
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      deployment.state = 'DRIFTED'
      return new Response(
        JSON.stringify({
          state: 'DRIFTED',
          expected: {
            name: 'Original',
            enforcement: 'active',
            rules: [{ type: 'deletion', parameters: { a: 1, b: 2 } }],
          },
          observed: {
            name: 'External rename',
            enforcement: 'active',
            rules: [{ parameters: { b: 2, a: 1 }, type: 'deletion' }],
          },
        })
      )
    }
    if (url.includes('ruleset-drafts'))
      return new Response(JSON.stringify({ drafts: [] }))
    return new Response(
      JSON.stringify({
        enabled: true,
        canSelfApprove: true,
        hasMore: false,
        deployments: [deployment],
      })
    )
  })
  vi.stubGlobal('fetch', request)
  await render(
    <QueryClientProvider client={client}>
      <RulesetDeployments
        repositoryId='1411149123'
        actorId='actor-1'
        canManage
      />
    </QueryClientProvider>
  )
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('button', { name: 'Verify GitHub', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect
    .element(
      drawer.getByRole('heading', { name: 'Changes detected on GitHub' })
    )
    .toBeVisible()
  await expect
    .element(drawer.getByRole('cell', { name: '"Original"', exact: true }))
    .toBeVisible()
  await expect
    .element(
      drawer.getByRole('cell', { name: '"External rename"', exact: true })
    )
    .toBeVisible()
  await expect
    .element(drawer.getByRole('button', { name: 'Roll back', exact: true }))
    .not.toBeInTheDocument()
  await expect
    .element(drawer.getByRole('cell', { name: 'rules', exact: true }))
    .not.toBeInTheDocument()
  expect(toastWarning).toHaveBeenCalledWith('GitHub ruleset changes detected')
  expect(
    request.mock.calls.filter(([, opts]) => opts?.method === 'POST')
  ).toHaveLength(1)
})

it('keeps a visible draft label and its accessible name after selection at mobile width', async () => {
  await page.viewport(320, 900)
  const name = 'Saved production ruleset for customer-verification-service'
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('ruleset-drafts')
              ? { drafts: [{ id: 'draft-1', name, definitionHash: 'hash-1' }] }
              : {
                  enabled: true,
                  canSelfApprove: false,
                  hasMore: false,
                  deployments: [],
                }
          )
        )
    )
  )
  const view = await render(
    <QueryClientProvider client={client}>
      <div className='p-4'>
        <RulesetDeployments
          repositoryId='1411149123'
          actorId='actor-1'
          canManage
        />
      </div>
    </QueryClientProvider>
  )
  try {
    const picker = view.getByRole('combobox', {
      name: 'Ruleset draft',
      exact: true,
    })
    await expect
      .element(view.getByText('Ruleset draft', { exact: true }))
      .toBeVisible()
    await picker.click()
    await page.getByRole('option', { name }).click()
    await expect.element(picker).toHaveTextContent(name)
    await expect.element(picker).toHaveAccessibleName('Ruleset draft')
    await expect
      .element(view.getByText('Ruleset draft', { exact: true }))
      .toBeVisible()
    await expect
      .element(view.getByRole('button', { name: 'Review activation' }))
      .toBeEnabled()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  } finally {
    await page.viewport(1280, 900)
  }
})
