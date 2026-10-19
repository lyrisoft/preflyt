import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PaymentRiskReport } from './payment-risk-report'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
async function show() {
  await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PaymentRiskReport
        repositoryId='51'
        assessmentId='fixture'
        scopeKey='organization:owner'
      />
    </QueryClientProvider>
  )
}
it('loads the report only when opened and shows all eight sections without execution claims', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      branch: 'main',
      sourceSha: 'a'.repeat(40),
      report: {
        executiveSummary: 'Payment controls require review.',
        systemInventory: [],
        findings: [],
        domains: [],
        paymentRiskRegister: [],
        attackScenarios: [],
        remediationPlan: [],
        qaRegressionCases: [],
        finalRiskSummary: {
          summary: 'Unreviewed areas remain.',
          immediateActions: 'Inspect the source.',
          topIssueIds: [],
        },
      },
    })
  )
  vi.stubGlobal('fetch', fetch)
  await show()
  expect(fetch).not.toHaveBeenCalled()
  await page.getByRole('button', { name: 'Open report' }).click()
  await expect
    .element(page.getByRole('heading', { name: '1. Executive summary' }))
    .toBeVisible()
  for (const section of [
    '2. System inventory',
    '3. Findings (0)',
    '4. Payment risk register',
    '5. Attack scenarios',
    '6. Remediation plan',
    '7. Proposed regression tests',
    '8. Final risk summary',
  ])
    await expect.element(page.getByText(section, { exact: true })).toBeVisible()
  await page.getByText('5. Attack scenarios', { exact: true }).click()
  await expect
    .element(
      page.getByText(
        'Conceptual source traces. These scenarios were not executed.'
      )
    )
    .toBeVisible()
  await page.getByRole('button', { name: 'Hide report' }).click()
  await page.getByRole('button', { name: 'Open report' }).click()
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('keeps report failures actionable', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 403 }))
  )
  await show()
  await page.getByRole('button', { name: 'Open report' }).click()
  await expect
    .element(page.getByText('The payment risk report could not be loaded.'))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Retry' }))
    .toBeVisible()
})

it('does not reuse another user scope report and hides cached data after access is denied', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let denied = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      denied
        ? new Response('', { status: 403 })
        : Response.json({
            branch: 'main',
            sourceSha: 'a'.repeat(40),
            report: {
              executiveSummary: 'Private owner report.',
              systemInventory: [],
              findings: [],
              domains: [],
              paymentRiskRegister: [],
              attackScenarios: [],
              remediationPlan: [],
              qaRegressionCases: [],
              finalRiskSummary: {
                summary: 'Needs review.',
                immediateActions: 'Inspect.',
                topIssueIds: [],
              },
            },
          })
    )
  )
  function ScopedReport() {
    const [scope, setScope] = useState('organization:owner')
    return (
      <>
        <button
          onClick={() => {
            denied = true
            setScope('organization:reader')
          }}
        >
          Switch user
        </button>
        <button
          onClick={() => {
            denied = true
            void client.invalidateQueries({ queryKey: ['payment-risk-report'] })
          }}
        >
          Recheck access
        </button>
        <PaymentRiskReport
          repositoryId='51'
          assessmentId='fixture'
          scopeKey={scope}
        />
      </>
    )
  }
  await render(
    <QueryClientProvider client={client}>
      <ScopedReport />
    </QueryClientProvider>
  )
  await page.getByRole('button', { name: 'Open report' }).click()
  await expect.element(page.getByText('Private owner report.')).toBeVisible()
  await page.getByRole('button', { name: 'Recheck access' }).click()
  await expect
    .element(page.getByText('The payment risk report could not be loaded.'))
    .toBeVisible()
  await expect
    .element(page.getByText('Private owner report.'))
    .not.toBeInTheDocument()
  await page.getByRole('button', { name: 'Switch user' }).click()
  await expect
    .element(page.getByText('The payment risk report could not be loaded.'))
    .toBeVisible()
  await expect
    .element(page.getByText('Private owner report.'))
    .not.toBeInTheDocument()
})
