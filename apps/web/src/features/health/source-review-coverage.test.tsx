import type { AnchorHTMLAttributes } from 'react'
import '@/styles/index.css'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { HealthReport } from './health-api'
import { SourceReviewCoverage } from './source-review-coverage'

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  params: Record<string, string>
  search: Record<string, string>
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, search, ...props }: MockLinkProps) => (
    <a
      {...props}
      href={`/review-areas/${params.assessmentId}/${params.areaId}?repository=${search.repository}`}
    >
      {children}
    </a>
  ),
}))

beforeEach(async () => {
  await page.viewport(1280, 800)
})

afterEach(async () => {
  cleanup()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

const report = (coverage?: HealthReport['sourceReviewCoverage']) =>
  ({
    analyses: [{ id: 'security.strix' }],
    sourceReviewCoverage: coverage,
  }) as HealthReport
const coverage: NonNullable<HealthReport['sourceReviewCoverage']> = {
  version: 1,
  scope: 'SOURCE_ONLY',
  evidence: 'AI_REPORTED',
  available: true,
  truncated: false,
  entries: [
    {
      surface: 'src/payments.ts',
      riskArea: 'Authorization',
      outcome: 'no_issue_found',
    },
  ],
  gaps: [
    {
      surface: 'Refunds',
      riskArea: 'Concurrency',
      detail: 'No provider stub available.',
    },
  ],
  caveats: [],
}

it('distinguishes AI accounts from independently verified tests and shows unresolved areas', async () => {
  await render(<SourceReviewCoverage report={report(coverage)} />)
  await expect
    .element(page.getByRole('region', { name: 'Source review coverage' }))
    .toBeVisible()
  await expect
    .element(page.getByText('No issue reported', { exact: true }).last())
    .toBeVisible()
  await expect
    .element(page.getByText('No provider stub available.'))
    .not.toBeInTheDocument()
  await page
    .getByRole('button', {
      name: 'Show details for review area 2',
      exact: true,
    })
    .click()
  await expect
    .element(page.getByText('No provider stub available.'))
    .toBeVisible()
  await expect
    .element(page.getByText(/do not independently verify that a test ran/))
    .toBeVisible()
  await expect
    .element(page.getByText(/Live APIs and websites were outside scope/))
    .toBeVisible()
})
it('shows unknown coverage for old reports without an imported ledger', async () => {
  await render(<SourceReviewCoverage report={report()} />)
  await expect
    .element(
      page.getByText(
        'Review coverage is unavailable. Unreported areas remain unknown.'
      )
    )
    .toBeVisible()
  await expect.element(page.getByRole('table')).not.toBeInTheDocument()
})
it('labels areas absent from the repository as not applicable', async () => {
  const view = await render(
    <SourceReviewCoverage
      report={report({
        ...coverage,
        gaps: [],
        entries: [
          {
            surface: 'Payment workers',
            riskArea: 'Duplicate payouts',
            outcome: 'not_applicable',
          },
        ],
      })}
    />
  )
  await expect
    .element(view.getByText('Not applicable', { exact: true }).last())
    .toBeVisible()
  await expect
    .element(view.getByText('Outside scope', { exact: true }))
    .not.toBeInTheDocument()
})
it('paginates bounded coverage and flags omitted details', async () => {
  const view = await render(
    <SourceReviewCoverage
      report={report({
        ...coverage,
        truncated: true,
        gaps: [],
        entries: Array.from({ length: 11 }, (_, index) => ({
          surface: `area-${index}`,
          riskArea: 'Authorization',
          outcome: 'needs_follow_up',
        })),
      })}
    />
  )
  await expect
    .element(
      page.getByText(
        'Some coverage details were omitted. This list is incomplete.'
      )
    )
    .toBeVisible()
  await expect
    .element(page.getByText('area-10', { exact: true }))
    .not.toBeInTheDocument()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect.element(page.getByText('area-10', { exact: true })).toBeVisible()
  await view.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect.element(page.getByText('area-0', { exact: true })).toBeVisible()
})
it('keeps static scanner reports unchanged', async () => {
  await render(
    <SourceReviewCoverage
      report={{ analyses: [{ id: 'security.sast' }] } as HealthReport}
    />
  )
  await expect
    .element(page.getByRole('region', { name: 'Source review coverage' }))
    .not.toBeInTheDocument()
})

it('combines matching gaps with their area and preserves complete details behind a keyboard disclosure', async () => {
  const surface =
    'POST /v1/billing/payment/confirm (api/src/controllers/billingController.js:1555 → api/src/services/billingService.js:3288 confirmPaymentStatus)'
  const detail =
    'Provider amount and currency need verification against the payment attempt.'
  const view = await render(
    <SourceReviewCoverage
      report={report({
        ...coverage,
        entries: [
          {
            surface,
            riskArea: 'Payment confirmation and tenant binding',
            outcome: 'needs_follow_up',
          },
        ],
        gaps: [
          {
            surface,
            riskArea: 'Payment confirmation and tenant binding',
            detail,
          },
        ],
      })}
    />
  )
  await expect.element(view.getByText('1 area · 1 need review')).toBeVisible()
  await expect.element(view.getByText('1–1 of 1')).toBeVisible()
  const details = view.getByRole('button', {
    name: 'Show details for review area 1',
    exact: true,
  })
  ;(details.element() as HTMLButtonElement).focus()
  await userEvent.keyboard('{Enter}')
  await expect.element(view.getByText(detail)).toBeVisible()
  await expect
    .element(
      view.getByRole('button', {
        name: 'Hide details for review area 1',
        exact: true,
      })
    )
    .toHaveAttribute('aria-expanded', 'true')
  expect(view.getByRole('table').element().textContent).toContain(surface)
  await userEvent.keyboard('{Enter}')
  await expect.element(view.getByText(detail)).not.toBeInTheDocument()
})

it('keeps the report and keyboard pagination usable at 320px in both themes', async () => {
  await page.viewport(320, 800)
  const view = await render(
    <div style={{ padding: 16 }}>
      <SourceReviewCoverage
        report={report({
          ...coverage,
          gaps: [],
          entries: Array.from({ length: 11 }, (_, index) => ({
            surface: `src/${'long-name-'.repeat(12)}${index}.ts`,
            riskArea: 'Authorization',
            outcome: 'needs_follow_up',
          })),
        })}
      />
    </div>
  )
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    await expect
      .element(view.getByRole('heading', { name: 'Source review coverage' }))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    const next = view.getByRole('button', { name: 'Next', exact: true })
    const nextButton = next.element() as HTMLButtonElement
    nextButton.focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(view.getByText('11–11 of 11')).toBeVisible()
    window.scrollTo(0, 0)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await page.screenshot({
      path: `__screenshots__/preflyt-source-coverage-320-${dark ? 'dark' : 'light'}.png`,
    })
    await view.getByRole('button', { name: 'Previous', exact: true }).click()
  }
})

it('links review areas to the exact repository and saved assessment', async () => {
  const view = await render(
    <SourceReviewCoverage
      report={report(coverage)}
      repositoryId='1097527174'
      assessmentId='11111111-1111-4111-8111-111111111111'
    />
  )
  await expect
    .element(view.getByRole('link', { name: 'Authorization', exact: true }))
    .toHaveAttribute(
      'href',
      '/review-areas/11111111-1111-4111-8111-111111111111/0?repository=1097527174'
    )
})
