import type { AnchorHTMLAttributes } from 'react'
import '@/styles/index.css'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { ReviewAreaDetailsPage } from './review-area-details-page'

type ReviewFixture = {
  repository: string
  assessment: {
    id: string
    branch: string
    sourceSha: string
    finishedAt: string
    report: {
      analyses: { id: string }[]
      sourceReviewCoverage: {
        available: boolean
        entries: { surface: string; riskArea: string; outcome: string }[]
        gaps: { surface: string; riskArea: string; detail: string }[]
        caveats: string[]
      }
    }
  }
}
type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  params: Record<string, string>
  search: Record<string, string>
}
const state = vi.hoisted(() => ({
  data: null as ReviewFixture | undefined | null,
  isError: false,
  isPending: false,
  error: null as Error | null,
  refetch: vi.fn(),
}))
const useHealth = vi.hoisted(() => vi.fn())
vi.mock('./health-api', () => ({
  useHealth: (...args: unknown[]) => {
    useHealth(...args)
    return { ...state, isFetching: false }
  },
}))
vi.mock('@/components/layout/app-header', () => ({ AppHeader: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, search, ...props }: MockLinkProps) => (
    <a
      {...props}
      href={`/repositories/${params.repositoryId}?health=${search.health}&branch=${search.branch}`}
    >
      {children}
    </a>
  ),
}))
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  state.isError = false
  state.isPending = false
  state.error = null
  useHealth.mockClear()
  state.data = {
    repository: 'lyrisoft/maiguard-api',
    assessment: {
      id,
      branch: 'main',
      sourceSha: 'a'.repeat(40),
      finishedAt: '2026-10-19T01:31:29.892Z',
      report: {
        analyses: [{ id: 'security.strix' }],
        sourceReviewCoverage: {
          available: true,
          entries: [
            {
              surface:
                'api/src/services/billingService.js:3288 confirmPaymentStatus',
              riskArea: 'Payment amount and currency binding',
              outcome: 'needs_follow_up',
            },
          ],
          gaps: [
            {
              surface:
                'api/src/services/billingService.js:3288 confirmPaymentStatus',
              riskArea: 'Payment amount and currency binding',
              detail:
                'Compare the provider-confirmed amount and currency with the payment attempt.',
            },
          ],
          caveats: [],
        },
      },
    },
  }
})
afterEach(async () => {
  await cleanup()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
it('shows saved review notes, source references and exact commit without presenting a confirmed finding', async () => {
  const view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='0'
    />
  )
  await expect
    .element(
      view.getByRole('heading', { name: 'Payment amount and currency binding' })
    )
    .toBeVisible()
  await expect
    .element(
      view.getByText(
        'Compare the provider-confirmed amount and currency with the payment attempt.'
      )
    )
    .toBeVisible()
  await expect
    .element(
      view.getByText(
        'api/src/services/billingService.js:3288 confirmPaymentStatus'
      )
    )
    .toBeVisible()
  await expect.element(view.getByText('a'.repeat(40))).toBeVisible()
  await expect
    .element(view.getByText('Needs review', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByText('Suggestions only', { exact: true }))
    .toBeVisible()
  await expect
    .element(view.getByRole('link', { name: 'Back to security report' }))
    .toHaveAttribute(
      'href',
      `/repositories/1097527174?health=${id}&branch=main`
    )
})
it('does not show cached source details after repository access is denied', async () => {
  state.isError = true
  state.error = new Error(
    'Repository access is unavailable or you do not have permission.'
  )
  const view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='0'
    />
  )
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('Repository access is unavailable')
  await expect
    .element(view.getByText('Payment amount and currency binding'))
    .not.toBeInTheDocument()
  await expect
    .element(
      view.getByText(
        'api/src/services/billingService.js:3288 confirmPaymentStatus'
      )
    )
    .not.toBeInTheDocument()
})
it('handles invalid links, missing areas and loading', async () => {
  let view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='-1'
    />
  )
  expect(useHealth).toHaveBeenLastCalledWith('1097527174', id, 1, false)
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('incomplete or invalid')
  await view.unmount()
  view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='8'
    />
  )
  await expect
    .element(view.getByRole('alert'))
    .toHaveTextContent('not present in the saved security report')
  await view.unmount()
  state.isPending = true
  state.data = undefined
  view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='0'
    />
  )
  await expect
    .element(view.getByLabelText('Loading review details'))
    .toBeVisible()
})
it('keeps long source references readable at 320px in both themes', async () => {
  await page.viewport(320, 800)
  state.data!.assessment.report.sourceReviewCoverage.entries[0]!.surface =
    'api/src/' + 'long-path-'.repeat(20) + 'billingService.js'
  const view = await render(
    <ReviewAreaDetailsPage
      repositoryId='1097527174'
      assessmentId={id}
      areaId='0'
    />
  )
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await expect
      .element(view.getByRole('heading', { name: 'Source references' }))
      .toBeInTheDocument()
  }
})
