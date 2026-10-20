import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { PaymentRiskReport } from './payment-risk-report'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

const savedReport = {
  branch: 'main',
  sourceSha: 'a'.repeat(40),
  report: {
    executiveSummary: 'Inspect payment controls.',
    systemInventory: [],
    findings: [],
    domains: [],
    paymentRiskRegister: [],
    attackScenarios: [],
    remediationPlan: [],
    qaRegressionCases: [],
    finalRiskSummary: {
      summary: 'Review gaps.',
      immediateActions: 'Inspect source.',
      topIssueIds: [],
    },
  },
}
it('downloads PDF for reading and Markdown for prompting with a fresh authenticated request', async () => {
  const blobs: Blob[] = [],
    names: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob)
    return 'blob:report'
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    names.push(this.download)
  })
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url: string) =>
      url.includes('?format=pdf')
        ? new Response('%PDF-1.7\nfixture', {
            headers: { 'content-type': 'application/pdf' },
          })
        : url.includes('?format=md')
          ? new Response('# Payment Risk Review\nSaved source references.', {
              headers: { 'content-type': 'text/markdown; charset=utf-8' },
            })
          : Response.json(savedReport)
  )
  vi.stubGlobal('fetch', fetch)
  await show(true)
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await vi.waitFor(() => expect(names).toEqual(['payment-risk-fixture.pdf']))
  await page
    .getByRole('button', { name: 'Download Markdown', exact: true })
    .click()
  await vi.waitFor(() =>
    expect(names).toEqual([
      'payment-risk-fixture.pdf',
      'payment-risk-fixture.md',
    ])
  )
  expect(blobs.map((b) => b.type)).toEqual([
    'application/pdf',
    'text/markdown; charset=utf-8',
  ])
  expect(await blobs[1].text()).toContain('# Payment Risk Review')
  expect(await blobs[0].text()).toContain('%PDF-')
  for (const call of fetch.mock.calls.filter(([url]) =>
    url.includes('?format=')
  ))
    expect(call[1]).toMatchObject({ credentials: 'include', cache: 'no-store' })
  await expect
    .element(page.getByRole('button', { name: 'Download report', exact: true }))
    .not.toBeInTheDocument()
})
it.each(['md', 'pdf'])(
  'does not download %s when access is denied',
  async (format) => {
    const create = vi.spyOn(URL, 'createObjectURL')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('?format=')
          ? new Response('', { status: 403 })
          : Response.json(savedReport)
      )
    )
    await show(true)
    await page
      .getByRole('button', {
        name: format === 'md' ? 'Download Markdown' : 'Download PDF',
        exact: true,
      })
      .click()
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Repository access is unavailable or you do not have permission.'
      )
    )
    expect(create).not.toHaveBeenCalled()
  }
)
it('rejects an unexpected response format without downloading a misleading file', async () => {
  const create = vi.spyOn(URL, 'createObjectURL')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('?format=')
        ? new Response('<html>Sign in</html>', {
            headers: { 'content-type': 'text/html' },
          })
        : Response.json(savedReport)
    )
  )
  await show(true)
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await vi.waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      'The report format was not received. Try again.'
    )
  )
  expect(create).not.toHaveBeenCalled()
})
for (const theme of ['light', 'dark'])
  it(`fits both report downloads at 320px in ${theme}`, async () => {
    await page.viewport(320, 900)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(savedReport))
    )
    await show(true)
    await expect
      .element(page.getByRole('button', { name: 'Download PDF', exact: true }))
      .toBeVisible()
    await expect
      .element(
        page.getByRole('button', { name: 'Download Markdown', exact: true })
      )
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  })
async function show(embedded = false) {
  await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PaymentRiskReport
        embedded={embedded}
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

it('opens an embedded payment report directly without a second Open report action', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      branch: 'main',
      sourceSha: 'a'.repeat(40),
      report: {
        executiveSummary: 'Inspect payment invariants.',
        systemInventory: [],
        findings: [],
        domains: [],
        paymentRiskRegister: [],
        attackScenarios: [],
        remediationPlan: [],
        qaRegressionCases: [],
        finalRiskSummary: {
          summary: 'Further review needed.',
          immediateActions: 'Inspect sources.',
          topIssueIds: [],
        },
      },
    })
  )
  vi.stubGlobal('fetch', fetch)
  await show(true)
  await expect
    .element(page.getByRole('heading', { name: '1. Executive summary' }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Open report' }))
    .not.toBeInTheDocument()
  await expect
    .element(page.getByRole('button', { name: 'Hide report' }))
    .not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})
