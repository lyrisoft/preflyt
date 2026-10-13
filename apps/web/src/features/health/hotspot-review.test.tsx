import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { HotspotReview } from './hotspot-review'

const state = vi.hoisted(() => ({
  canReview: true,
  conflict: false,
  fetch: vi.fn(),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({
    isSuccess: true,
    data: { organizationId: 'org', identityId: 'reviewer' },
  }),
}))
beforeEach(() => {
  state.canReview = true
  state.conflict = false
  state.fetch.mockReset()
  state.fetch.mockImplementation(
    async (_input: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (state.conflict)
          return Response.json(
            { message: 'Hotspot review changed. Refresh and try again.' },
            { status: 409 }
          )
        return Response.json({
          ...JSON.parse(String(init.body)),
          revision: 1,
          updatedAt: '2026-10-12T00:00:00Z',
          canReview: true,
        })
      }
      return Response.json({
        state: 'TO_REVIEW',
        note: '',
        revision: 0,
        updatedAt: null,
        canReview: state.canReview,
      })
    }
  )
  vi.stubGlobal('fetch', state.fetch)
})
const mount = () =>
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
      <HotspotReview
        repositoryId='51'
        assessmentId='11111111-1111-4111-8111-111111111111'
        fingerprint={'a'.repeat(64)}
      />
    </QueryClientProvider>
  )
it('requires a rationale, saves the original revision and shows the returned decision', async () => {
  await mount()
  await page.getByRole('combobox', { name: 'Review decision' }).click()
  await page
    .getByRole('option', { name: 'Reviewed: no change needed', exact: true })
    .click()
  await expect
    .element(page.getByRole('button', { name: 'Save review' }))
    .toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Review rationale' })
    .fill('Used only for a non-security checksum.')
  await page.getByRole('button', { name: 'Save review' }).click()
  await expect
    .element(
      page.getByRole('status', { name: 'Saved hotspot review decision' })
    )
    .toHaveTextContent('Reviewed: no change needed')
  const call = state.fetch.mock.calls.find(
    ([, init]) => init?.method === 'POST'
  )!
  expect(JSON.parse(call[1].body)).toEqual({
    state: 'SAFE',
    note: 'Used only for a non-security checksum.',
    expectedRevision: 0,
  })
  expect(String(call[0])).toContain(
    '/health/11111111-1111-4111-8111-111111111111/hotspots/'
  )
})
it('shows permission-limited review without editable controls', async () => {
  state.canReview = false
  await mount()
  await expect
    .element(page.getByText('To review', { exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('button', { name: 'Save review' }))
    .not.toBeInTheDocument()
})
it('preserves the input and explains a conflicting concurrent review', async () => {
  state.conflict = true
  await mount()
  await page.getByRole('combobox', { name: 'Review decision' }).click()
  await page
    .getByRole('option', { name: 'Reviewed: fix required', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Review rationale' })
    .fill('This hash protects credentials.')
  await page.getByRole('button', { name: 'Save review' }).click()
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent('Hotspot review changed. Refresh and try again.')
  await expect
    .element(page.getByRole('textbox', { name: 'Review rationale' }))
    .toHaveValue('This hash protects credentials.')
})
it('keeps the review form readable in dark mode at 320 pixels', async () => {
  document.documentElement.classList.add('dark')
  await page.viewport(320, 800)
  const view = await mount()
  await expect
    .element(page.getByRole('combobox', { name: 'Review decision' }))
    .toBeVisible()
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  await view.unmount()
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
