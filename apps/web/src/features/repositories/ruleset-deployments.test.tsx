import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { RulesetDeployments } from './ruleset-deployments'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const message =
  'A current automatically published passing PR check is required on main before activation'
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
  toastError.mockClear()
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
