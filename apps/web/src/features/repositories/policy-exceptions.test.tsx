import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PolicyExceptions, type PolicyException } from './policy-exceptions'

const sha = 'a'.repeat(40)
const policy = {
  id: 'policy',
  selectionId: 'selection',
  definitionHash: 'b'.repeat(64),
  branchRef: 'refs/heads/main',
  definition: {
    rules: [
      { id: 'security', title: 'Security scan', required: true },
      { id: 'tests', title: 'Test execution', required: true },
    ],
  },
}
let rows: PolicyException[],
  calls: { path: string; body: Record<string, unknown> }[]
const renderPanel = (
  canRequest = true,
  canApprove = false,
  actorId = 'requester'
) =>
  render(
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
      <PolicyExceptions
        repositoryId='51'
        policy={policy}
        actorId={actorId}
        canRequest={canRequest}
        canApprove={canApprove}
      />
    </QueryClientProvider>
  )
beforeEach(() => {
  rows = []
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url)
      if (init?.method === 'POST') {
        calls.push({ path, body: JSON.parse(String(init.body)) })
        return new Response(JSON.stringify({ id: 'new' }), { status: 201 })
      }
      return new Response(
        JSON.stringify(
          path.endsWith('/assessments')
            ? {
                assessments: [
                  {
                    id: 'assessment',
                    sourceSha: sha,
                    selectionId: 'selection',
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : { exceptions: rows, truncated: false }
        )
      )
    })
  )
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await page.viewport(1280, 900)
})
it('uses custom commit and expiry controls and submits the exact scoped request', async () => {
  const view = await renderPanel()
  await view.getByRole('button', { name: 'Request exception' }).click()
  await view.getByRole('combobox', { name: 'Assessed commit' }).click()
  await view.getByRole('option', { name: sha.slice(0, 12) }).click()
  await view.getByRole('checkbox', { name: 'Security scan' }).click()
  await view
    .getByRole('textbox', { name: 'Reason and follow-up' })
    .fill('Vendor scanner false positive tracked in issue 123.')
  const before = Date.now()
  await view.getByRole('button', { name: 'Submit request' }).click()
  await expect.poll(() => calls.length).toBe(1)
  expect(calls[0].path).toContain('/gate-policies/policy/exceptions')
  expect(calls[0].body).toMatchObject({
    expectedPolicyHash: policy.definitionHash,
    sourceSha: sha,
    ruleIds: ['security'],
  })
  expect(
    Date.parse(calls[0].body.expiresAt as string) - before
  ).toBeGreaterThan(23 * 3600000)
  expect(Date.parse(calls[0].body.expiresAt as string) - before).toBeLessThan(
    25 * 3600000
  )
  // Radix retains hidden native controls for form semantics; the user-facing
  // controls must be custom button/combobox triggers.
  for (const native of document.querySelectorAll('select')) {
    expect(native.getAttribute('aria-hidden')).toBe('true')
    expect(native.tabIndex).toBe(-1)
  }
})
it('shows pending requests with semantic badges and prevents self-approval in the UI', async () => {
  rows = [
    {
      id: 'exception',
      state: 'REQUESTED',
      sourceSha: sha,
      ruleIds: ['security'],
      reason: 'Vendor false positive with tracked follow-up',
      requestedById: 'requester',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      requestHash: 'c'.repeat(64),
      revision: 1,
    },
  ]
  const view = await renderPanel(true, true)
  await expect
    .element(view.getByText('Pending review'))
    .toHaveClass('text-warning-text')
  await expect
    .element(view.getByRole('button', { name: 'Approve exception' }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Withdraw' }).click()
  await expect.poll(() => calls.length).toBe(1)
  expect(calls[0].body).toEqual({
    expectedHash: 'c'.repeat(64),
    expectedRevision: 1,
  })
  expect(calls[0].path).toContain('/exception/revoke')
})
it('provides separate approval controls and keeps read-only access read-only', async () => {
  rows = [
    {
      id: 'exception',
      state: 'REQUESTED',
      sourceSha: sha,
      ruleIds: ['security'],
      reason: 'Vendor false positive with tracked follow-up',
      requestedById: 'requester',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      requestHash: 'c'.repeat(64),
      revision: 1,
    },
  ]
  const view = await renderPanel(true, true, 'reviewer')
  await view.getByRole('button', { name: 'Approve exception' }).click()
  await expect.poll(() => calls.length).toBe(1)
  expect(calls[0].path).toContain('/exception/approve')
  await view.unmount()
  const readOnly = await renderPanel(false, false, 'viewer')
  await expect.element(readOnly.getByText('Pending review')).toBeVisible()
  for (const name of [
    'Request exception',
    'Approve exception',
    'Withdraw',
    'Reject',
  ])
    await expect
      .element(readOnly.getByRole('button', { name, exact: true }))
      .not.toBeInTheDocument()
})
it('keeps the request form readable on mobile in both themes', async () => {
  await page.viewport(390, 900)
  const view = await render(
    <div className='mx-auto max-w-xl p-4'>
      <QueryClientProvider client={new QueryClient()}>
        <PolicyExceptions
          repositoryId='51'
          policy={policy}
          canRequest
          canApprove={false}
        />
      </QueryClientProvider>
    </div>
  )
  await view.getByRole('button', { name: 'Request exception' }).click()
  for (const theme of ['light', 'dark']) {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    await expect
      .poll(() => document.documentElement.scrollWidth <= window.innerWidth)
      .toBe(true)
    await expect
      .element(view.getByRole('button', { name: 'Submit request' }))
      .toBeVisible()
    await page.screenshot({
      path: `__screenshots__/policy-exceptions-${theme}-mobile.png`,
    })
  }
  document.documentElement.classList.remove('light', 'dark')
})

it('hides cached exception details after current access fails', async () => {
  rows = [
    {
      id: 'exception',
      state: 'APPROVED',
      sourceSha: sha,
      ruleIds: ['security'],
      reason: 'Private review reason that must be hidden after access loss',
      requestedById: 'requester',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      requestHash: 'c'.repeat(64),
      revision: 2,
    },
  ]
  const view = await renderPanel()
  await expect.element(view.getByText(rows[0].reason)).toBeVisible()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'Access revoked' }), {
          status: 403,
        })
    )
  )
  await view.getByRole('button', { name: 'Refresh exceptions' }).click()
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Repository access changed')
  await expect.element(view.getByText(rows[0].reason)).not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: 'Request exception' }))
    .not.toBeInTheDocument()
})
